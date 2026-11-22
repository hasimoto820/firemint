import { defineMessages } from '@shared/i18n/shared/messages'

// 1 行に 1 キー（4 言語）で並べる。i18n_apply が読み書きするので、整形しない
// prettier-ignore
export const accountMessages = defineMessages({
  'account.err_add_member': { en: "Could not add the member.", ja: "追加できませんでした", 'zh-Hans': "无法添加", 'zh-Hant': "無法新增" },
  'account.err_anonymous': { en: "Could not create an anonymous user: {message}", ja: "匿名ユーザーを作成できませんでした: {message}", 'zh-Hans': "无法创建匿名用户：{message}", 'zh-Hant': "無法建立匿名使用者：{message}" },
  'account.err_bad_checkout_url': { en: "The purchase page URL is not valid.", ja: "購入画面の URL が正しくありません", 'zh-Hans': "购买页面的 URL 不正确", 'zh-Hant': "購買頁面的 URL 不正確" },
  'account.err_bad_portal_url': { en: "The billing page URL is not valid.", ja: "支払いの管理画面の URL が正しくありません", 'zh-Hans': "付款管理页面的 URL 不正确", 'zh-Hant': "付款管理頁面的 URL 不正確" },
  'account.err_google_canceled_or_failed': { en: "Google sign-in was canceled or failed.", ja: "Google ログインがキャンセルまたは失敗しました", 'zh-Hans': "Google 登录已取消或失败", 'zh-Hant': "Google 登入已取消或失敗" },
  'account.err_google_sign_in': { en: "Could not sign in with Google.", ja: "Google でログインできませんでした", 'zh-Hans': "无法使用 Google 登录", 'zh-Hant': "無法使用 Google 登入" },
  'account.err_google_sign_in_detail': { en: "Could not sign in with Google: {message}", ja: "Google でログインできませんでした: {message}", 'zh-Hans': "无法使用 Google 登录：{message}", 'zh-Hant': "無法使用 Google 登入：{message}" },
  'account.err_google_sign_in_failed': { en: "Google sign-in failed.", ja: "Google ログインに失敗しました", 'zh-Hans': "Google 登录失败", 'zh-Hant': "Google 登入失敗" },
  'account.err_google_timeout': { en: "Google sign-in timed out (5 minutes).", ja: "Google ログインがタイムアウトしました（5分）", 'zh-Hans': "Google 登录超时（5 分钟）", 'zh-Hant': "Google 登入逾時（5 分鐘）" },
  'account.err_google_unavailable': { en: "Google sign-in is not available right now.", ja: "今の状態では Google ログインできません", 'zh-Hans': "当前状态下无法使用 Google 登录", 'zh-Hant': "目前狀態下無法使用 Google 登入" },
  'account.err_leave': { en: "Could not leave the account.", ja: "脱退できませんでした", 'zh-Hans': "无法退出", 'zh-Hant': "無法退出" },
  'account.err_no_id_token': { en: "Could not get an ID token.", ja: "ID トークンを取得できませんでした", 'zh-Hans': "无法获取 ID 令牌", 'zh-Hant': "無法取得 ID 權杖" },
  'account.err_not_signed_in': { en: "You are not signed in.", ja: "ログインしていません", 'zh-Hans': "尚未登录", 'zh-Hant': "尚未登入" },
  'account.err_purchase': { en: "Could not purchase.", ja: "購入できませんでした", 'zh-Hans': "无法购买", 'zh-Hant': "無法購買" },
  'account.err_refresh': { en: "Could not refresh the sign-in: {message}", ja: "ログイン情報を更新できませんでした: {message}", 'zh-Hans': "无法更新登录信息：{message}", 'zh-Hant': "無法更新登入資訊：{message}" },
  'account.err_remove_member': { en: "Could not remove the member.", ja: "外せませんでした", 'zh-Hans': "无法移除", 'zh-Hant': "無法移除" },
  'account.google_sign_in_canceled': { en: "Google sign-in was canceled.", ja: "Google ログインをキャンセルしました", 'zh-Hans': "已取消 Google 登录", 'zh-Hant': "已取消 Google 登入" }
})
