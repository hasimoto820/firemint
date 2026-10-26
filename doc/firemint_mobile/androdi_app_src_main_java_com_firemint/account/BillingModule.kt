package com.firemint.account

import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.android.billingclient.api.queryProductDetails
import com.android.billingclient.api.queryPurchasesAsync
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * 003_002_flow.txt「Androidで課金」の、購入フロー起動〜purchaseToken取得部分。
 * サーバー側の検証・acknowledge（Cloud Functions: verifyAndroidPurchase）は
 * ここでは行わない。取得したpurchaseTokenをRN側からCloud Functionsへ送る。
 */
class BillingModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), PurchasesUpdatedListener {

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private var pendingPurchasePromise: Promise? = null

  private val billingClient: BillingClient by lazy {
    BillingClient.newBuilder(reactContext.applicationContext)
        .setListener(this)
        .enablePendingPurchases(
            com.android.billingclient.api.PendingPurchasesParams.newBuilder()
                .enableOneTimeProducts()
                .build())
        .build()
  }

  override fun getName(): String = NAME

  override fun invalidate() {
    super.invalidate()
    scope.cancel()
    if (billingClient.isReady) {
      billingClient.endConnection()
    }
  }

  @ReactMethod
  fun purchaseSubscription(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "画面がありません")
      return
    }
    scope.launch {
      try {
        ensureConnected()

        val params =
            QueryProductDetailsParams.newBuilder()
                .setProductList(
                    listOf(
                        QueryProductDetailsParams.Product.newBuilder()
                            .setProductId(SUBSCRIPTION_PRODUCT_ID)
                            .setProductType(BillingClient.ProductType.SUBS)
                            .build()))
                .build()
        val result = billingClient.queryProductDetails(params)
        val productDetails = result.productDetailsList?.firstOrNull()
        if (productDetails == null) {
          promise.reject(
              "PRODUCT_NOT_FOUND",
              "Play Consoleに商品 $SUBSCRIPTION_PRODUCT_ID が見つかりません")
          return@launch
        }
        val offerToken =
            productDetails.subscriptionOfferDetails?.firstOrNull()?.offerToken
        if (offerToken == null) {
          promise.reject("NO_OFFER", "購入可能なofferがありません")
          return@launch
        }

        val flowParams =
            BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(
                    listOf(
                        BillingFlowParams.ProductDetailsParams.newBuilder()
                            .setProductDetails(productDetails)
                            .setOfferToken(offerToken)
                            .build()))
                .build()

        pendingPurchasePromise = promise
        val launchResult = billingClient.launchBillingFlow(activity, flowParams)
        if (launchResult.responseCode != BillingClient.BillingResponseCode.OK) {
          pendingPurchasePromise = null
          promise.reject(
              "LAUNCH_FAILED",
              launchResult.debugMessage.ifBlank { "購入フローを開始できませんでした" })
        }
        // 以降の結果は onPurchasesUpdated で受け取り、pendingPurchasePromise を解決する
      } catch (e: Exception) {
        pendingPurchasePromise = null
        promise.reject("BILLING_FAILED", e.message ?: e.javaClass.simpleName, e)
      }
    }
  }

  /**
   * Google Play側に既に存在する購入（購入済みだがFireMint側の検証が未完了、
   * 再インストール、別端末で購入済み等）を探して返す。無ければnull。
   */
  @ReactMethod
  fun restorePurchase(promise: Promise) {
    scope.launch {
      try {
        ensureConnected()
        val result =
            billingClient.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder()
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build())
        if (result.billingResult.responseCode != BillingClient.BillingResponseCode.OK) {
          promise.reject(
              "RESTORE_FAILED",
              result.billingResult.debugMessage.ifBlank { "購入情報を取得できませんでした" })
          return@launch
        }
        val purchase =
            result.purchasesList.firstOrNull {
              it.purchaseState == Purchase.PurchaseState.PURCHASED &&
                  it.products.contains(SUBSCRIPTION_PRODUCT_ID)
            }
        if (purchase == null) {
          promise.resolve(null)
          return@launch
        }
        val map = Arguments.createMap()
        map.putString("purchaseToken", purchase.purchaseToken)
        map.putString("productId", SUBSCRIPTION_PRODUCT_ID)
        promise.resolve(map)
      } catch (e: Exception) {
        promise.reject("RESTORE_FAILED", e.message ?: e.javaClass.simpleName, e)
      }
    }
  }

  override fun onPurchasesUpdated(billingResult: BillingResult, purchases: List<Purchase>?) {
    val promise = pendingPurchasePromise
    pendingPurchasePromise = null

    if (billingResult.responseCode == BillingClient.BillingResponseCode.USER_CANCELED) {
      promise?.reject("CANCELLED", "cancelled")
      return
    }
    if (billingResult.responseCode != BillingClient.BillingResponseCode.OK || purchases == null) {
      promise?.reject(
          "PURCHASE_FAILED",
          billingResult.debugMessage.ifBlank { "購入できませんでした" })
      return
    }
    val purchase = purchases.firstOrNull()
    if (purchase == null) {
      promise?.reject("NO_PURCHASE", "購入情報が取得できませんでした")
      return
    }
    val map = Arguments.createMap()
    map.putString("purchaseToken", purchase.purchaseToken)
    map.putString("productId", purchase.products.firstOrNull() ?: SUBSCRIPTION_PRODUCT_ID)
    promise?.resolve(map)
  }

  private suspend fun ensureConnected() {
    if (billingClient.isReady) {
      return
    }
    suspendCancellableCoroutine<Unit> { cont ->
      billingClient.startConnection(
          object : BillingClientStateListener {
            override fun onBillingSetupFinished(billingResult: BillingResult) {
              if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                if (cont.isActive) cont.resume(Unit)
              } else if (cont.isActive) {
                cont.resumeWith(
                    Result.failure(
                        IllegalStateException(
                            billingResult.debugMessage.ifBlank { "Billing接続に失敗しました" })))
              }
            }

            override fun onBillingServiceDisconnected() {}
          })
    }
  }

  companion object {
    const val NAME = "Billing"
  }
}
