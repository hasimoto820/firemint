import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import Stripe from "stripe";
import { db } from "../admin";

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");

const VOIDED_PREFIX = "VOIDED_";

function subscriptionRef(subscriptionId: string): FirebaseFirestore.DocumentReference {
  return db.collection("subscriptions").doc(subscriptionId);
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return typeof value === "string" ? value : value.id;
}

/** 002_006_webhook.txt「Stripe の状態 → 書く値」。書くものが無い時は null。 */
function fieldsFor(
  subscription: Stripe.Subscription
): { lastNotificationType: string; expiryTime?: Timestamp } | null {
  const periodEnd = subscription.items.data[0]?.current_period_end;
  switch (subscription.status) {
    case "active":
      return {
        lastNotificationType: subscription.cancel_at_period_end ? "CANCELED" : "PURCHASED",
        expiryTime: Timestamp.fromMillis((periodEnd ?? 0) * 1000),
      };
    case "past_due":
      // 請求期間はもう次の月に進んでいる。expiryTime には書かない
      return { lastNotificationType: "IN_GRACE_PERIOD" };
    case "canceled":
      return {
        lastNotificationType: "CANCELED",
        expiryTime: Timestamp.fromMillis((subscription.ended_at ?? Date.now() / 1000) * 1000),
      };
    default:
      logger.warn("書く値の無い契約の状態", { status: subscription.status });
      return null;
  }
}

/** 不変条件 1・2・3。ドキュメントがある時だけ、Stripe の今の状態を写す。 */
async function syncSubscription(stripe: Stripe, subscriptionId: string): Promise<void> {
  const ref = subscriptionRef(subscriptionId);
  const existing = await ref.get();
  if (!existing.exists) {
    return;
  }
  const label = existing.data()?.lastNotificationType as string | undefined;
  if (label?.startsWith(VOIDED_PREFIX)) {
    return;
  }

  const fields = fieldsFor(await stripe.subscriptions.retrieve(subscriptionId));
  if (fields) {
    await ref.set({ ...fields, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
}

/** その請求書の支払いを全額返金して、契約をすぐ終わらせる（002_006「決めること」1）。 */
async function refundAndCancel(stripe: Stripe, session: Stripe.Checkout.Session): Promise<void> {
  const invoiceId = idOf(session.invoice);
  if (invoiceId) {
    const invoice = await stripe.invoices.retrieve(invoiceId, { expand: ["payments"] });
    for (const { payment } of invoice.payments?.data ?? []) {
      const paymentIntent = idOf(payment.payment_intent);
      if (paymentIntent) {
        await stripe.refunds.create({ payment_intent: paymentIntent });
      }
    }
  }
  const subscriptionId = idOf(session.subscription);
  if (subscriptionId) {
    await stripe.subscriptions.cancel(subscriptionId);
  }
}

async function handleCheckoutCompleted(
  stripe: Stripe,
  session: Stripe.Checkout.Session
): Promise<void> {
  const subscriptionId = idOf(session.subscription);
  if (session.mode !== "subscription" || !subscriptionId) {
    return;
  }

  const ref = subscriptionRef(subscriptionId);
  if ((await ref.get()).exists) {
    await syncSubscription(stripe, subscriptionId);
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const accountId = subscription.metadata.accountId;
  const account = accountId ? await db.collection("accounts").doc(accountId).get() : null;
  if (!account?.exists) {
    logger.warn("account が無いので返金します", { subscriptionId });
    await refundAndCancel(stripe, session);
    return;
  }

  const fields = fieldsFor(subscription);
  if (!fields) {
    return;
  }
  const customerId = idOf(session.customer);
  const batch = db.batch();
  batch.set(ref, {
    accountId,
    provider: "Stripe",
    expiryTime: fields.expiryTime ?? Timestamp.now(),
    lastNotificationType: fields.lastNotificationType,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  if (customerId) {
    batch.update(account.ref, { stripeCustomerId: customerId });
  }
  await batch.commit();
}

async function subscriptionIdOfInvoice(
  stripe: Stripe,
  invoiceId: string
): Promise<string | null> {
  const invoice = await stripe.invoices.retrieve(invoiceId);
  return idOf(invoice.parent?.subscription_details?.subscription);
}

async function subscriptionIdOfCharge(stripe: Stripe, chargeId: string): Promise<string | null> {
  const charge = await stripe.charges.retrieve(chargeId);
  const paymentIntent = idOf(charge.payment_intent);
  if (!paymentIntent) {
    return null;
  }
  const payments = await stripe.invoicePayments.list({
    payment: { type: "payment_intent", payment_intent: paymentIntent },
    limit: 1,
  });
  const invoiceId = idOf(payments.data[0]?.invoice);
  return invoiceId ? subscriptionIdOfInvoice(stripe, invoiceId) : null;
}

/** 返金・チャージバック。全額・一部を問わず、すぐ使えなくして、Stripe の契約も終わらせる。 */
async function handleVoided(stripe: Stripe, chargeId: string, label: string): Promise<void> {
  const subscriptionId = await subscriptionIdOfCharge(stripe, chargeId);
  if (!subscriptionId) {
    return;
  }
  const ref = subscriptionRef(subscriptionId);
  const existing = await ref.get();
  if (!existing.exists) {
    return;
  }
  if ((existing.data()?.lastNotificationType as string | undefined)?.startsWith(VOIDED_PREFIX)) {
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  if (subscription.status !== "canceled") {
    await stripe.subscriptions.cancel(subscriptionId);
  }
  await ref.set(
    {
      expiryTime: Timestamp.now(),
      lastNotificationType: label,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function handleEvent(stripe: Stripe, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(stripe, event.data.object);
      return;
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoiceId = event.data.object.id;
      const subscriptionId = invoiceId ? await subscriptionIdOfInvoice(stripe, invoiceId) : null;
      if (subscriptionId) {
        await syncSubscription(stripe, subscriptionId);
      }
      return;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(stripe, event.data.object.id);
      return;
    case "charge.refunded": {
      const charge = event.data.object;
      await handleVoided(
        stripe,
        charge.id,
        charge.refunded ? "VOIDED_FULL_REFUND" : "VOIDED_PARTIAL_REFUND"
      );
      return;
    }
    case "charge.dispute.created": {
      const chargeId = idOf(event.data.object.charge);
      if (chargeId) {
        await handleVoided(stripe, chargeId, "VOIDED_FULL_REFUND");
      }
      return;
    }
    default:
      return;
  }
}

/**
 * 002_006_webhook.txt。署名が合わなければ 400。一時的な失敗は 500 で、Stripe がやり直す。
 */
export const windows_stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
  async (req, res) => {
    const stripe = new Stripe(STRIPE_SECRET_KEY.value());

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        req.headers["stripe-signature"] as string,
        STRIPE_WEBHOOK_SECRET.value()
      );
    } catch (error) {
      logger.warn("Stripe の署名を確かめられません", {
        reason: error instanceof Error ? error.message : error,
      });
      res.status(400).send("invalid signature");
      return;
    }

    try {
      await handleEvent(stripe, event);
      res.status(200).send("ok");
    } catch (error) {
      logger.error("Stripe の通知の処理に失敗", {
        type: event.type,
        reason: error instanceof Error ? error.message : error,
      });
      res.status(500).send("failed");
    }
  }
);
