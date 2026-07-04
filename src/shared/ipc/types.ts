import type {
  ConnectResult,
  ConnectionStatus
} from '@features/connection/shared/types'
import type {
  CreateDocumentInput,
  DocumentDetail,
  DocumentSummary,
  ExplorerResult,
  UpdateDocumentInput
} from '@features/explorer/shared/types'

export type PingResult = {
  message: string
}

export type ConnectionIpcApi = {
  selectServiceAccountFile: () => Promise<string | null>
  connect: (filePath: string) => Promise<ConnectResult>
  disconnect: () => Promise<void>
  getStatus: () => Promise<ConnectionStatus | null>
}

export type ExplorerIpcApi = {
  listRootCollections: () => Promise<ExplorerResult<string[]>>
  listDocuments: (collectionPath: string) => Promise<ExplorerResult<DocumentSummary[]>>
  getDocument: (documentPath: string) => Promise<ExplorerResult<DocumentDetail>>
  createDocument: (input: CreateDocumentInput) => Promise<ExplorerResult<string>>
  updateDocument: (input: UpdateDocumentInput) => Promise<ExplorerResult<null>>
  deleteDocument: (documentPath: string) => Promise<ExplorerResult<null>>
  listSubcollections: (documentPath: string) => Promise<ExplorerResult<string[]>>
}

export interface IpcApi {
  ping: () => Promise<PingResult>
  connection: ConnectionIpcApi
  explorer: ExplorerIpcApi
}
