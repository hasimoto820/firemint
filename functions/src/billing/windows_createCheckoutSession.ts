import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import Stripe from "stripe";
import { db } from "../admin";

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_PRICE_ID = defineString("STRIPE_PRICE_ID");

const RETURN_URL = "https://firemint-e801f.web.app/";
// Stripe の最短は 30 分。開いたままの購入画面を、長く残さない
const CHECKOUT_EXPIRES_SECONDS = 31 * 60;

/** モバイル版の isAccountSubscribed と同じ判定。Google Play で課金中も含む。 */
async function isAccountSubscribed(accountId: string): Promise<boolean> {
  const snap = await db
    .collection("subscriptions")
    .where("accountId", "==", accountId)
    .orderBy("expiryTime", "desc")
    .limit(1)
    .get();
  if (snap.empty) {
    return false;
  }
  const data = snap.docs[0].data();
  if (data.expiryTime != null && data.expiryTime.toMillis() > Date.now()) {
    return true;
  }
  const label = data.lastNotificationType as string | undefined;
  return label != null && label.includes("GRACE_PERIOD");
}

/**
 * 002_005_flow.txt「デスクトップで課金」。Stripe の購入画面を作って、URL を返す。
 * 購入できるのは Google ログイン済みの owner だけ。課金中なら断る。
 */
export const windows_createCheckoutSession = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    const uid = request.auth?.uid;
    const email = request.auth?.token.email as string | undefined;
    if (!uid) {
      throw new HttpsError("unauthenticated", "認証が必要です。");
    }
    if (!email) {
      throw new HttpsError("failed-precondition", "Google でログインしてください。");
    }

    const accountId = (await db.collection("users").doc(uid).get()).data()?.accountId as
      | string
      | undefined;
    if (!accountId) {
      throw new HttpsError("failed-precondition", "account がありません。");
    }
    const account = (await db.collection("accounts").doc(accountId).get()).data();
    if (account?.ownerUid !== uid) {
      throw new HttpsError("permission-denied", "購入は account の owner のみ行えます。");
    }
    if (await isAccountSubscribed(accountId)) {
      throw new HttpsError("failed-precondition", "既に課金中です。");
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY.value());
    const customer = account.stripeCustomerId as string | undefined;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: STRIPE_PRICE_ID.value(), quantity: 1 }],
      subscription_data: { metadata: { accountId } },
      ...(customer ? { customer } : { customer_email: email }),
      success_url: RETURN_URL,
      cancel_url: RETURN_URL,
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_EXPIRES_SECONDS,
    });
    if (!session.url) {
      throw new HttpsError("internal", "購入画面を作れませんでした。");
    }
    return { url: session.url };
  }
);
