import { readdir, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { connectWithEmulator } from '@features/connection/main/service'
import {
  DEFAULT_EMULATOR_HUB,
  parseEmulatorHost
} from '@features/connection/shared/emulator'
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
  DiscoveredEmulator,
  DiscoverEmulatorsResult,
  ImportEmulatorCollectionJsonInput,
  ImportEmulatorProjectZipInput,
  ImportEmulatorProjectZipResult
} from '@features/emulator/shared/types'

const HUB_TIMEOUT_MS = 800
const MISSING_PROJECT_PLACEHOLDER = 'demo-no-project'

function connectableHost(raw: string): string {
  const parsed = parseEmulatorHost(raw)
  const separator = parsed.lastIndexOf(':')
  const hostname = parsed.slice(0, separator)
  const port = parsed.slice(separator + 1)

  if (hostname === '0.0.0.0' || hostname === '::' || hostname === '[::]') {
    return `127.0.0.1:${port}`
  }

  if (hostname === 'localhost') {
    return `127.0.0.1:${port}`
  }

  return parsed
}

function hubOrigin(host: string): string {
  return `http://${connectableHost(host)}`
}

function projectIdFromHubFile(fileName: string): string {
  const id = fileName.replace(/^hub-/, '').replace(/\.json$/i, '')
  if (!id || id === MISSING_PROJECT_PLACEHOLDER) {
    return ''
  }

  return id
}

function firestoreHostFromEmulators(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const firestore = (payload as Record<string, unknown>).firestore
  if (!firestore || typeof firestore !== 'object') {
    return null
  }

  const info = firestore as Record<string, unknown>
  if (typeof info.host === 'string' && typeof info.port === 'number') {
    return connectableHost(`${info.host}:${info.port}`)
  }

  if (typeof info.listen === 'string') {
    return connectableHost(info.listen)
  }

  if (Array.isArray(info.listen) && info.listen[0] && typeof info.listen[0] === 'object') {
    const first = info.listen[0] as Record<string, unknown>
    const address = typeof first.address === 'string' ? first.address : null
    const port = typeof first.port === 'number' ? first.port : null
    if (address && port !== null) {
      return connectableHost(`${address}:${port}`)
    }
  }

  return null
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(HUB_TIMEOUT_MS)
    })

    if (!response.ok) {
      return null
    }

    return await response.json()
  } catch {
    return null
  }
}

async function probeHub(hubHost: string, projectId: string): Promise<DiscoveredEmulator | null> {
  const origin = hubOrigin(hubHost)
  const payload = await fetchJson(`${origin}/emulators`)
  const firestoreHost = firestoreHostFromEmulators(payload)

  if (!firestoreHost) {
    return null
  }

  return {
    hubHost: connectableHost(hubHost),
    firestoreHost,
    projectId
  }
}

async function locatorHubs(): Promise<Array<{ hubHost: string; projectId: string }>> {
  const found: Array<{ hubHost: string; projectId: string }> = []

  try {
    const names = await readdir(tmpdir())

    for (const name of names) {
      if (!name.startsWith('hub-') || !name.endsWith('.json')) {
        continue
      }

      try {
        const raw = await readFile(join(tmpdir(), name), 'utf8')
        const locator = JSON.parse(raw) as { origins?: unknown }
        const origins = Array.isArray(locator.origins) ? locator.origins : []
        const projectId = projectIdFromHubFile(name)

        for (const origin of origins) {
          if (typeof origin !== 'string') {
            continue
          }

          found.push({
            hubHost: origin.replace(/^https?:\/\//i, ''),
            projectId
          })
        }
      } catch (error) {
        logError('emulator', `discover skipped locator ${name}`, error)
      }
    }
  } catch (error) {
    logError('emulator', 'discover could not read temp dir', error)
  }

  return found
}

function defaultHubTargets(): Array<{ hubHost: string; projectId: string }> {
  const fromEnv = process.env.FIREBASE_EMULATOR_HUB?.trim()
  const targets = [{ hubHost: DEFAULT_EMULATOR_HUB, projectId: '' }]

  if (fromEnv) {
    targets.push({ hubHost: fromEnv, projectId: '' })
  }

  return targets
}

export async function discoverEmulators(): Promise<DiscoverEmulatorsResult> {
  logInfo('emulator', 'discover start')

  try {
    const seeds = [...defaultHubTargets(), ...(await locatorHubs())]
    const seenHub = new Set<string>()
    const results: DiscoveredEmulator[] = []

    for (const seed of seeds) {
      let hubHost: string
      try {
        hubHost = connectableHost(seed.hubHost)
      } catch {
        continue
      }

      if (seenHub.has(hubHost)) {
        continue
      }

      seenHub.add(hubHost)
      const found = await probeHub(hubHost, seed.projectId)
      if (!found) {
        continue
      }

      if (results.some((entry) => entry.firestoreHost === found.firestoreHost)) {
        continue
      }

      results.push(found)
    }

    logInfo('emulator', `discover done count=${results.length}`)
    return { ok: true, data: results }
  } catch (error) {
    logError('emulator', 'discover failed', error)
    const message = error instanceof Error ? error.message : 'Discover failed'
    return { ok: false, error: message }
  }
}

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
