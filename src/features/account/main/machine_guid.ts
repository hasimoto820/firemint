import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const REGISTRY_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Cryptography'

/**
 * Windows の MachineGuid。関数に渡す時の名前は deviceId（002_004 の 2）。
 * サーバーがハッシュにして devices のドキュメントID にする。端末には保存しない。
 */
export async function readMachineGuid(): Promise<string> {
  const { stdout } = await execFileAsync('reg', ['query', REGISTRY_KEY, '/v', 'MachineGuid'], {
    windowsHide: true
  })
  const guid = stdout.match(/MachineGuid\s+REG_SZ\s+(\S+)/)?.[1]

  if (!guid) {
    throw new Error('MachineGuid を読み取れませんでした')
  }

  return guid
}
