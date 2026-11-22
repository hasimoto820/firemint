import { defineMessages } from '@shared/i18n/shared/messages'

// 1 行に 1 キー（4 言語）で並べる。i18n_apply が読み書きするので、整形しない
// prettier-ignore
export const emulatorMessages = defineMessages({
  'emu.append_confirm': { en: "Only documents missing from {name} will be created. Existing documents are left alone.", ja: "{name} の、Emulator に無いドキュメントだけを作ります。既にあるドキュメントには触れません。", 'zh-Hans': "只会创建 {name} 中不存在的文档。已有的文档不受影响。", 'zh-Hant': "只會建立 {name} 中不存在的文件。已有的文件不受影響。" },
  'emu.err_delete': { en: "Failed to delete on the emulator ({status}). Check that it is running.", ja: "Emulator 上の削除に失敗しました（{status}）。プロセスが起動しているか確認してください", 'zh-Hans': "在 Emulator 上删除失败（{status}）。请确认进程是否已启动", 'zh-Hant': "在 Emulator 上刪除失敗（{status}）。請確認程序是否已啟動" },
  'emu.err_id_format': { en: "Use lowercase letters, numbers, and hyphens for the ID.", ja: "ID は英小文字・数字・ハイフンで入れてください", 'zh-Hans': "ID 请使用小写英文字母、数字和连字符", 'zh-Hant': "ID 請使用小寫英文字母、數字和連字號" },
  'emu.err_info_missing': { en: "Emulator connection details are missing.", ja: "エミュレーターの接続情報が不足しています", 'zh-Hans': "Emulator 连接信息不足", 'zh-Hant': "Emulator 連線資訊不足" },
  'emu.err_no_project_in_dump': { en: "The dump has no projectId, so it cannot be added to the emulator as a project.", ja: "ダンプから projectId が取れません。Emulator にプロジェクトとして入れられません。", 'zh-Hans': "无法从转储中获取 projectId，因此无法作为项目导入 Emulator。", 'zh-Hant': "無法從傾印取得 projectId，因此無法作為專案匯入 Emulator。" },
  'emu.err_not_emulator': { en: "This is not an emulator project.", ja: "エミュレーターのプロジェクトではありません", 'zh-Hans': "这不是 Emulator 项目", 'zh-Hant': "這不是 Emulator 專案" },
  'emu.err_unreachable': { en: "Cannot connect to the emulator. Check that it is running.", ja: "Emulator に接続できません。プロセスが起動しているか確認してください", 'zh-Hans': "无法连接 Emulator。请确认进程是否已启动", 'zh-Hant': "無法連線 Emulator。請確認程序是否已啟動" },
  'emu.id_exists': { en: "A project with this ID already exists. Data will go into it.", ja: "この ID のプロジェクトはもうあります。そこに入れます。", 'zh-Hans': "已存在此 ID 的项目，将导入其中。", 'zh-Hant': "已存在此 ID 的專案，將匯入其中。" },
  'emu.new_id': { en: "New ID", ja: "新規 ID", 'zh-Hans': "新 ID", 'zh-Hant': "新 ID" },
  'emu.new_project_id': { en: "New project ID", ja: "新しいプロジェクトの ID", 'zh-Hans': "新项目的 ID", 'zh-Hant': "新專案的 ID" },
  'emu.no_projects_with_data': { en: "No projects have data", ja: "データのあるプロジェクトがありません", 'zh-Hans': "没有包含数据的项目", 'zh-Hant': "沒有包含資料的專案" },
  'emu.not_validated_detail': { en: "Validation writes nothing. It shows the document counts in the emulator and in the file before you run.", ja: "検証は書き込みをしません。実行前に、Emulator とファイルの件数を見られます。", 'zh-Hans': "验证不会写入任何内容。执行前可以查看 Emulator 和文件中的文档数。", 'zh-Hant': "驗證不會寫入任何內容。執行前可以查看 Emulator 和檔案中的文件數。" },
  'emu.overwrite_detail': { en: "Fields that exist only in the emulator are removed. Documents not in the file are left alone. Stopping partway does not undo what was written.", ja: "Emulator にだけあるフィールドは消えます。ファイルに無いドキュメントには触れません。途中で止めても、書いた分は戻りません。", 'zh-Hans': "仅存在于 Emulator 的字段将被删除。不在文件中的文档不受影响。中途停止也不会撤销已写入的内容。", 'zh-Hant': "僅存在於 Emulator 的欄位將被刪除。不在檔案中的文件不受影響。中途停止也不會復原已寫入的內容。" },
  'emu.target_name': { en: "{name} on the emulator", ja: "Emulator の {name}", 'zh-Hans': "Emulator 上的 {name}", 'zh-Hant': "Emulator 上的 {name}" }
})
