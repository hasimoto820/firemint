import { defineMessages } from '@shared/i18n/shared/messages'

// 1 行に 1 キー（4 言語）で並べる。i18n_apply が読み書きするので、整形しない
// prettier-ignore
export const queryMessages = defineMessages({
  'query.code_aria': { en: "JS query code", ja: "JS Query コード", 'zh-Hans': "JS 查询代码", 'zh-Hant': "JS 查詢程式碼" },
  'query.delete_confirm': { en: "Delete \"{name}\"?", ja: "「{name}」を削除しますか？", 'zh-Hans': "要删除“{name}”吗？", 'zh-Hant': "要刪除「{name}」嗎？" },
  'query.deleted': { en: "Deleted", ja: "削除しました", 'zh-Hans': "已删除", 'zh-Hant': "已刪除" },
  'query.editor_split': { en: "Divider between the editor and the results", ja: "クエリエディタと結果の境目", 'zh-Hans': "编辑器与结果的分隔线", 'zh-Hant': "編輯器與結果的分隔線" },
  'query.err_api_missing': { en: "Saved queries are not available yet. Restart the app.", ja: "Saved Queries API が未反映です。アプリを再起動してください。", 'zh-Hans': "已保存查询的 API 尚未生效。请重启应用。", 'zh-Hant': "已儲存查詢的 API 尚未生效。請重新啟動應用程式。" },
  'query.err_array_items': { en: "Array items must be DocumentSnapshots (returning a QuerySnapshot is easier).", ja: "配列の要素は DocumentSnapshot である必要があります（QuerySnapshot を return する方が簡単です）", 'zh-Hans': "数组元素必须是 DocumentSnapshot（return QuerySnapshot 更简单）", 'zh-Hant': "陣列元素必須是 DocumentSnapshot（return QuerySnapshot 更簡單）" },
  'query.err_define_run': { en: "Define async function run().", ja: "async function run() を定義してください", 'zh-Hans': "请定义 async function run()", 'zh-Hant': "請定義 async function run()" },
  'query.err_delete_failed': { en: "Failed to delete.", ja: "削除に失敗しました", 'zh-Hans': "删除失败", 'zh-Hant': "刪除失敗" },
  'query.err_empty_code': { en: "The query code is empty.", ja: "クエリコードが空です", 'zh-Hans': "查询代码为空", 'zh-Hant': "查詢程式碼為空" },
  'query.err_list_failed': { en: "Failed to load saved queries.", ja: "保存クエリ一覧の取得に失敗しました", 'zh-Hans': "获取已保存的查询失败", 'zh-Hant': "取得已儲存的查詢失敗" },
  'query.err_name_required': { en: "Enter a name.", ja: "名前を入力してください", 'zh-Hans': "请输入名称", 'zh-Hant': "請輸入名稱" },
  'query.err_no_id': { en: "id is missing.", ja: "id がありません", 'zh-Hans': "缺少 id", 'zh-Hant': "缺少 id" },
  'query.err_no_project_id': { en: "projectId is missing.", ja: "projectId がありません", 'zh-Hans': "缺少 projectId", 'zh-Hant': "缺少 projectId" },
  'query.err_return_type': { en: "run() must return a QuerySnapshot, a DocumentSnapshot, or an array of them.", ja: "run() は QuerySnapshot / DocumentSnapshot / それらの配列を return してください", 'zh-Hans': "run() 必须 return QuerySnapshot / DocumentSnapshot / 它们的数组", 'zh-Hant': "run() 必須 return QuerySnapshot / DocumentSnapshot / 它們的陣列" },
  'query.err_run_failed': { en: "Failed to run the query.", ja: "Query の実行に失敗しました", 'zh-Hans': "执行查询失败", 'zh-Hant': "執行查詢失敗" },
  'query.err_save_failed': { en: "Failed to save.", ja: "保存に失敗しました", 'zh-Hans': "保存失败", 'zh-Hant': "儲存失敗" },
  'query.err_saved_not_found': { en: "Saved query not found.", ja: "保存クエリが見つかりません", 'zh-Hans': "未找到已保存的查询", 'zh-Hant': "找不到已儲存的查詢" },
  'query.err_timeout': { en: "The query timed out ({seconds} s).", ja: "クエリがタイムアウトしました（{seconds} 秒）", 'zh-Hans': "查询超时（{seconds} 秒）", 'zh-Hant': "查詢逾時（{seconds} 秒）" },
  'query.err_unevaluated': { en: "A Query object was returned. Return the result of .get() (a QuerySnapshot).", ja: "Query オブジェクトが返されました。.get() した結果（QuerySnapshot）を return してください", 'zh-Hans': "返回了 Query 对象。请 return .get() 的结果（QuerySnapshot）", 'zh-Hant': "回傳了 Query 物件。請 return .get() 的結果（QuerySnapshot）" },
  'query.group_tabs': { en: "Group tabs", ja: "グループタブ", 'zh-Hans': "分组标签页", 'zh-Hant': "群組分頁" },
  'query.hint': { en: "Filter with Run, then pick a row to save its JSON, or check rows for bulk actions. db and admin are available.", ja: "Run で絞り込み → 行を選んで JSON を保存、またはチェックして一括。db / admin が使えます。", 'zh-Hans': "用 Run 筛选 → 选中行保存 JSON，或勾选后批量操作。可使用 db / admin。", 'zh-Hant': "用 Run 篩選 → 選取列儲存 JSON，或勾選後批次操作。可使用 db / admin。" },
  'query.load': { en: "Load", ja: "読込", 'zh-Hans': "加载", 'zh-Hant': "載入" },
  'query.loaded': { en: "Loaded: {name}", ja: "読込: {name}", 'zh-Hans': "已加载：{name}", 'zh-Hant': "已載入：{name}" },
  'query.name': { en: "Name", ja: "名前", 'zh-Hans': "名称", 'zh-Hant': "名稱" },
  'query.new_or_select': { en: "(new / select)", ja: "（新規 / 選択）", 'zh-Hans': "（新建 / 选择）", 'zh-Hant': "（新增 / 選擇）" },
  'query.save_name': { en: "Save as", ja: "保存名", 'zh-Hans': "保存名称", 'zh-Hant': "儲存名稱" },
  'query.saved': { en: "Saved", ja: "保存しました", 'zh-Hans': "已保存", 'zh-Hant': "已儲存" },
  'query.saved_named': { en: "Saved: {name}", ja: "保存しました: {name}", 'zh-Hans': "已保存：{name}", 'zh-Hant': "已儲存：{name}" },
  'query.saved_queries': { en: "Saved queries", ja: "保存済みクエリ", 'zh-Hans': "已保存的查询", 'zh-Hant': "已儲存的查詢" }
})
