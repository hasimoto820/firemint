export const IPC_CHANNELS = {
  PING: 'app:ping',
  CONNECTION_SELECT_FILE: 'connection:select_service_account_file',
  CONNECTION_CONNECT: 'connection:connect',
  CONNECTION_DISCONNECT: 'connection:disconnect',
  CONNECTION_GET_STATUS: 'connection:get_status',
  EXPLORER_LIST_ROOT_COLLECTIONS: 'explorer:list_root_collections',
  EXPLORER_LIST_DOCUMENTS: 'explorer:list_documents',
  EXPLORER_GET_DOCUMENT: 'explorer:get_document',
  EXPLORER_CREATE_DOCUMENT: 'explorer:create_document',
  EXPLORER_UPDATE_DOCUMENT: 'explorer:update_document',
  EXPLORER_DELETE_DOCUMENT: 'explorer:delete_document',
  EXPLORER_LIST_SUBCOLLECTIONS: 'explorer:list_subcollections',
  QUERY_EXECUTE: 'query:execute',
  BULK_PREVIEW_UPDATE: 'bulk:preview_update',
  BULK_UPDATE_FIELD: 'bulk:update_field',
  BULK_DELETE: 'bulk:delete',
  DATA_TRANSFER_EXPORT_COLLECTION_JSON: 'data_transfer:export_collection_json',
  DATA_TRANSFER_EXPORT_DOCUMENTS_JSON: 'data_transfer:export_documents_json',
  DATA_TRANSFER_EXPORT_DOCUMENTS_CSV: 'data_transfer:export_documents_csv'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
