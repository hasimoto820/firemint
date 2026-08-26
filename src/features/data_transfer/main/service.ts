import type { BrowserWindow } from 'electron'
import { dialog } from 'electron'

export async function promptIncludeSubcollections(
  window: BrowserWindow | null,
  collectionPath: string
): Promise<{ canceled: boolean; includeSubcollections: boolean }> {
  const options = {
    type: 'question' as const,
    title: 'コレクションをエクスポート',
    message: `「${collectionPath}」を zip に出します。`,
    detail: 'サブコレクションを含めると、配下のドキュメントもすべて書き出します（件数・時間が増えます）。',
    checkboxLabel: 'サブコレクションを含む',
    checkboxChecked: false,
    buttons: ['エクスポート', 'キャンセル'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  }

  const result = window
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options)

  if (result.response === 1) {
    return { canceled: true, includeSubcollections: false }
  }

  return { canceled: false, includeSubcollections: result.checkboxChecked }
}
