import { defineMessages } from '@shared/i18n/shared/messages'

// 1 行に 1 キー（4 言語）で並べる。i18n_apply が読み書きするので、整形しない
// prettier-ignore
export const workspaceMessages = defineMessages({
  'bulk.err_boolean': { en: "A boolean must be true or false.", ja: "boolean は true または false を指定してください", 'zh-Hans': "boolean 请指定 true 或 false", 'zh-Hant': "boolean 請指定 true 或 false" },
  'bulk.err_field_required': { en: "Enter the field name to update.", ja: "更新フィールド名を入力してください", 'zh-Hans': "请输入要更新的字段名", 'zh-Hant': "請輸入要更新的欄位名稱" },
  'bulk.err_no_delete_target': { en: "No documents have the field to delete.", ja: "削除対象のフィールドを持つドキュメントがありません", 'zh-Hans': "没有包含要删除字段的文档", 'zh-Hant': "沒有包含要刪除欄位的文件" },
  'bulk.err_no_docs': { en: "There are no target documents.", ja: "対象ドキュメントがありません", 'zh-Hans': "没有目标文档", 'zh-Hant': "沒有目標文件" },
  'bulk.err_no_rename_target': { en: "No documents have the field to rename.", ja: "リネーム対象のフィールドを持つドキュメントがありません", 'zh-Hans': "没有包含要重命名字段的文档", 'zh-Hant': "沒有包含要重新命名欄位的文件" },
  'bulk.err_number': { en: "Invalid number.", ja: "number の値が不正です", 'zh-Hans': "number 的值无效", 'zh-Hant': "number 的值無效" },
  'bulk.err_preview_not_found': { en: "No documents found to preview.", ja: "プレビュー対象のドキュメントが見つかりません", 'zh-Hans': "未找到要预览的文档", 'zh-Hant': "找不到要預覽的文件" },
  'bulk.err_same_field': { en: "Choose a different name for the new field.", ja: "変更先フィールド名は別の名前を指定してください", 'zh-Hans': "新字段名请指定不同的名称", 'zh-Hant': "新欄位名稱請指定不同的名稱" },
  'bulk.err_select_docs': { en: "Select the target documents.", ja: "対象ドキュメントを選択してください", 'zh-Hans': "请选择目标文档", 'zh-Hant': "請選擇目標文件" },
  'bulk.err_timestamp': { en: "Invalid timestamp.", ja: "timestamp の値が不正です", 'zh-Hans': "timestamp 的值无效", 'zh-Hant': "timestamp 的值無效" },
  'workspace.add': { en: "Add", ja: "追加", 'zh-Hans': "添加", 'zh-Hant': "新增" },
  'workspace.err_not_registered': { en: "The project is not registered.", ja: "プロジェクトが登録されていません", 'zh-Hans': "项目未登记", 'zh-Hant': "專案未登錄" },
  'workspace.err_read_only': { en: "This project is read-only, so it cannot be written to.", ja: "read-only プロジェクトのため書き込みできません", 'zh-Hans': "此项目为只读，无法写入", 'zh-Hant': "此專案為唯讀，無法寫入" },
  'workspace.list_height': { en: "Project list height", ja: "プロジェクト一覧の高さ", 'zh-Hans': "项目列表高度", 'zh-Hant': "專案列表高度" },
  'workspace.no_projects': { en: "No projects", ja: "プロジェクトがありません", 'zh-Hans': "没有项目", 'zh-Hant': "沒有專案" },
  'workspace.project_settings': { en: "Project settings", ja: "プロジェクト設定", 'zh-Hans': "项目设置", 'zh-Hant': "專案設定" }
})
