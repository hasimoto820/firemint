import { tr } from '@shared/i18n/shared/current'
import type { BrowserWindow } from 'electron'
import { dialog } from 'electron'

export async function promptIncludeSubcollections(
  window: BrowserWindow | null,
  collectionPath: string
): Promise<{ canceled: boolean; includeSubcollections: boolean }> {
  const options = {
    type: 'question' as const,
    title: tr('dt.export_collection_title'),
    message: tr('dt.export_collection_message', { path: collectionPath }),
    detail: tr('dt.export_subcollections_detail'),
    checkboxLabel: tr('explorer.include_subcollections'),
    checkboxChecked: false,
    buttons: [tr('dt.export'), tr('common.cancel')],
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
