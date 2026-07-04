import type {
  ConnectResult,
  ConnectionStatus
} from '@features/connection/shared/types'

export type PingResult = {
  message: string
}

export type ConnectionIpcApi = {
  selectServiceAccountFile: () => Promise<string | null>
  connect: (filePath: string) => Promise<ConnectResult>
  disconnect: () => Promise<void>
  getStatus: () => Promise<ConnectionStatus | null>
}

export interface IpcApi {
  ping: () => Promise<PingResult>
  connection: ConnectionIpcApi
}
