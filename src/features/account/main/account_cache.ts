import { app } from 'electron'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

const STORE_FILE_NAME = 'account_cache.json'

/** 002_005_flow.txt「起動時の判定順」のキャッシュ。uid の正は Firebase Auth。 */
export type AccountCache = {
  uid: string
  accountId: string | null
  firstUseDate: number
}

type AccountCacheFile = AccountCache & {
  version: 1
}

function getStorePath(): string {
  return join(app.getPath('userData'), STORE_FILE_NAME)
}

/** この uid の写しを返す。無い・壊れている・uid が食い違う時は null。 */
export async function loadAccountCache(uid: string): Promise<AccountCache | null> {
  try {
    const raw = await readFile(getStorePath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AccountCacheFile>

    if (
      parsed.version !== 1 ||
      parsed.uid !== uid ||
      typeof parsed.firstUseDate !== 'number' ||
      (parsed.accountId !== null && typeof parsed.accountId !== 'string')
    ) {
      return null
    }

    return { uid, accountId: parsed.accountId, firstUseDate: parsed.firstUseDate }
  } catch {
    return null
  }
}

export async function saveAccountCache(cache: AccountCache): Promise<void> {
  const storePath = getStorePath()
  const file: AccountCacheFile = { version: 1, ...cache }
  await mkdir(dirname(storePath), { recursive: true })
  await writeFile(storePath, `${JSON.stringify(file, null, 2)}\n`, 'utf-8')
}

export async function clearAccountCache(): Promise<void> {
  await rm(getStorePath(), { force: true })
}
