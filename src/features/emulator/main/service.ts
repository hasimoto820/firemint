import { connectWithEmulator } from '@features/connection/main/service'
import { parseEmulatorHost } from '@features/connection/shared/emulator'
import { importDocumentsJson } from '@features/data_transfer/main/import_service'
import {
  importProject,
  peekProjectImportZip
} from '@features/data_transfer/main/project_import_service'
import type { ImportResult } from '@features/data_transfer/shared/types'
import { getWorkspaceEntry, removeEntry } from '@features/workspace/main/service'
import { logError, logInfo } from '@shared/logging/logger'
import type {
  DeleteEmulatorProjectInput,
  DeleteEmulatorProjectResult,
  ImportEmulatorCollectionJsonInput,
  ImportEmulatorProjectZipInput,
  ImportEmulatorProjectZipResult
} from '@features/emulator/shared/types'

export async function importEmulatorProjectZip(
  input: ImportEmulatorProjectZipInput
): Promise<ImportEmulatorProjectZipResult> {
  const startedAt = Date.now()
  logInfo('emulator', `importProjectZip start host=${input.host} file=${input.filePath}`)

  const peek = await peekProjectImportZip(input.filePath)

  if (!peek.ok) {
    return peek
  }

  const connected = await connectWithEmulator({
    host: input.host,
    projectId: peek.projectId
  })

  if (!connected.ok) {
    return { ok: false, error: connected.error }
  }

  const imported = await importProject({
    projectId: connected.projectId,
    filePath: input.filePath,
    acceptProjectIdMismatch: true
  })

  if (!imported.ok) {
    logError('emulator', `importProjectZip write failed in ${Date.now() - startedAt}ms`)
    return { ok: false, error: imported.error }
  }

  logInfo(
    'emulator',
    `importProjectZip success in ${Date.now() - startedAt}ms pool_id=${connected.projectId} source=${peek.projectId} written=${imported.data.writtenCount}`
  )

  return {
    ok: true,
    projectId: connected.projectId,
    sourceProjectId: peek.projectId,
    writtenCount: imported.data.writtenCount
  }
}

export async function importEmulatorCollectionJson(
  input: ImportEmulatorCollectionJsonInput
): Promise<ImportResult> {
  logInfo('emulator', `importCollectionJson project=${input.projectId} file=${input.filePath}`)
  return importDocumentsJson(input)
}

export async function deleteEmulatorProject(
  input: DeleteEmulatorProjectInput
): Promise<DeleteEmulatorProjectResult> {
  const startedAt = Date.now()
  logInfo('emulator', `deleteProject start pool_id=${input.projectId}`)

  try {
    const entry = getWorkspaceEntry(input.projectId)

    if (!entry || entry.authType !== 'emulator') {
      return { ok: false, error: 'エミュレーターのプロジェクトではありません' }
    }

    if (entry.readOnly) {
      return { ok: false, error: 'read-only プロジェクトのため書き込みできません' }
    }

    if (!entry.emulatorHost || !entry.emulatorProjectId) {
      return { ok: false, error: 'エミュレーターの接続情報が不足しています' }
    }

    const host = parseEmulatorHost(entry.emulatorHost)
    const projectId = encodeURIComponent(entry.emulatorProjectId)
    const url = `http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`

    const response = await fetch(url, { method: 'DELETE' })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      logError(
        'emulator',
        `deleteProject emulator clear failed status=${response.status} body=${body.slice(0, 200)}`
      )
      return {
        ok: false,
        error: `Emulator 上の削除に失敗しました（${response.status}）。プロセスが起動しているか確認してください`
      }
    }

    const removed = await removeEntry(input.projectId)

    if (!removed.ok) {
      return { ok: false, error: removed.error }
    }

    logInfo('emulator', `deleteProject success in ${Date.now() - startedAt}ms pool_id=${input.projectId}`)
    return { ok: true }
  } catch (error) {
    logError('emulator', `deleteProject failed in ${Date.now() - startedAt}ms`, error)
    const message = error instanceof Error ? error.message : 'Delete emulator project failed'

    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return {
        ok: false,
        error: 'Emulator に接続できません。プロセスが起動しているか確認してください'
      }
    }

    return { ok: false, error: message }
  }
}
