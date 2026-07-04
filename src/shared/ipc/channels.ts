export const IPC_CHANNELS = {
  PING: 'app:ping',
  CONNECTION_SELECT_FILE: 'connection:select_service_account_file',
  CONNECTION_CONNECT: 'connection:connect',
  CONNECTION_DISCONNECT: 'connection:disconnect',
  CONNECTION_GET_STATUS: 'connection:get_status'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
