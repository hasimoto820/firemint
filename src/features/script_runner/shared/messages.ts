import { defineMessages } from '@shared/i18n/shared/messages'

// 1 行に 1 キー（4 言語）で並べる。i18n_apply が読み書きするので、整形しない
// prettier-ignore
export const scriptRunnerMessages = defineMessages({
  'sr.busy': { en: "Another import / export is running", ja: "別の Import / Export が実行中です", 'zh-Hans': "另一个导入 / 导出正在运行", 'zh-Hant': "另一個匯入 / 匯出正在執行" },
  'sr.cancel_requested': { en: "Stop requested", ja: "中止を要求しました", 'zh-Hans': "已请求中止", 'zh-Hant': "已請求中止" },
  'sr.canceled': { en: "Stopped", ja: "中止しました", 'zh-Hans': "已中止", 'zh-Hant': "已中止" },
  'sr.canceled_written': { en: "Stopped. What was already written to Firestore stays ({count} documents). It cannot be rolled back.", ja: "中止しました。Firestore に書いた分は残っています（{count} 件）。ロールバックできません。", 'zh-Hans': "已中止。已写入 Firestore 的部分会保留（{count} 个），无法回滚。", 'zh-Hant': "已中止。已寫入 Firestore 的部分會保留（{count} 筆），無法回復。" },
  'sr.count': { en: "{count} items", ja: "{count} 件", 'zh-Hans': "{count} 个", 'zh-Hant': "{count} 筆" },
  'sr.done': { en: "Done: {summary}", ja: "完了: {summary}", 'zh-Hans': "完成：{summary}", 'zh-Hant': "完成：{summary}" },
  'sr.err_failed': { en: "Import / export failed", ja: "Import / Export に失敗しました", 'zh-Hans': "导入 / 导出失败", 'zh-Hant': "匯入 / 匯出失敗" },
  'sr.exported': { en: "Saved {count} documents to {path}", ja: "{count} 件を {path} に保存しました", 'zh-Hans': "已将 {count} 个文档保存到 {path}", 'zh-Hant': "已將 {count} 筆文件儲存到 {path}" },
  'sr.failed_samples': { en: "Failed: {count} (examples)", ja: "書けなかった: {count} 件（例）", 'zh-Hans': "写入失败：{count} 个（示例）", 'zh-Hant': "寫入失敗：{count} 筆（範例）" },
  'sr.failed_written': { en: "Failed. What was already written to Firestore stays ({count} documents). It cannot be rolled back.", ja: "失敗しました。Firestore に書いた分は残っています（{count} 件）。ロールバックできません。", 'zh-Hans': "失败。已写入 Firestore 的部分会保留（{count} 个），无法回滚。", 'zh-Hant': "失敗。已寫入 Firestore 的部分會保留（{count} 筆），無法回復。" },
  'sr.file_total': { en: " (file: {count})", ja: "（ファイル {count} 件）", 'zh-Hans': "（文件 {count} 个）", 'zh-Hant': "（檔案 {count} 筆）" },
  'sr.import_counts': { en: "written {written} / skipped {skipped} / failed {failed}", ja: "書いた {written} / 飛ばした {skipped} / 書けなかった {failed}", 'zh-Hans': "已写入 {written} / 已跳过 {skipped} / 写入失败 {failed}", 'zh-Hant': "已寫入 {written} / 已略過 {skipped} / 寫入失敗 {failed}" },
  'sr.project_flow': { en: "Project {source} → {target} ({mode})", ja: "プロジェクト {source} → {target}（{mode}）", 'zh-Hans': "项目 {source} → {target}（{mode}）", 'zh-Hant': "專案 {source} → {target}（{mode}）" },
  'sr.samples': { en: "{reason}: {count} (examples)", ja: "{reason}: {count} 件（例）", 'zh-Hans': "{reason}：{count} 个（示例）", 'zh-Hant': "{reason}：{count} 筆（範例）" },
  'sr.skipped': { en: "Skipped", ja: "飛ばした", 'zh-Hans': "已跳过", 'zh-Hant': "已略過" },
  'sr.skipped_existing': { en: "Skipped (already exists)", ja: "既存のためスキップ", 'zh-Hans': "因已存在而跳过", 'zh-Hant': "因已存在而略過" },
  'sr.started': { en: "Started {title}", ja: "{title} を開始しました", 'zh-Hans': "已开始 {title}", 'zh-Hant': "已開始 {title}" },
  'sr.starting': { en: "Starting…", ja: "開始…", 'zh-Hans': "开始…", 'zh-Hant': "開始…" },
  'sr.stopped_reason': { en: "Stopped because: {reason}", ja: "途中で止まった理由: {reason}", 'zh-Hans': "中途停止原因：{reason}", 'zh-Hant': "中途停止原因：{reason}" },
  'sr.transport_summary': { en: "Succeeded {written} / skipped {skipped} / total {total}", ja: "成功 {written} / スキップ {skipped} / 対象 {total}", 'zh-Hans': "成功 {written} / 跳过 {skipped} / 对象 {total}", 'zh-Hant': "成功 {written} / 略過 {skipped} / 對象 {total}" },
  'sr.write_progress': { en: "{count} items / written {written} / skipped {skipped}", ja: "{count} 件 / 書込 {written} / スキップ {skipped}", 'zh-Hans': "{count} 个 / 写入 {written} / 跳过 {skipped}", 'zh-Hant': "{count} 筆 / 寫入 {written} / 略過 {skipped}" }
})
