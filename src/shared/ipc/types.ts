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

import type {
  QueryExecuteResult,
  SimpleQueryInput
} from '@features/query/shared/types'

import type {
  BulkDeleteInput,
  BulkOperationSummary,
  BulkResult,
  BulkUpdateFieldInput,
  DiffPreviewItem
} from '@features/bulk_operations/shared/types'

import type {
  ExportCollectionJsonInput,
  ExportDocumentsInput,
  ExportResult
} from '@features/data_transfer/shared/types'

import type {
  AddWorkspaceEntryInput,
  UpdateWorkspaceEntryInput,
  WorkspaceEntry,
  WorkspaceResult,
  WorkspaceState
} from '@features/workspace/shared/types'

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
  listRootCollections: (projectId: string) => Promise<ExplorerResult<string[]>>
  listDocuments: (
    projectId: string,
    collectionPath: string
  ) => Promise<ExplorerResult<DocumentSummary[]>>
  getDocument: (projectId: string, documentPath: string) => Promise<ExplorerResult<DocumentDetail>>
  createDocument: (input: CreateDocumentInput) => Promise<ExplorerResult<string>>
  updateDocument: (input: UpdateDocumentInput) => Promise<ExplorerResult<null>>
  deleteDocument: (projectId: string, documentPath: string) => Promise<ExplorerResult<null>>
  listSubcollections: (projectId: string, documentPath: string) => Promise<ExplorerResult<string[]>>
}

export type QueryIpcApi = {
  execute: (input: SimpleQueryInput) => Promise<QueryExecuteResult>
}

export type BulkOperationsIpcApi = {
  previewUpdate: (input: BulkUpdateFieldInput) => Promise<BulkResult<DiffPreviewItem[]>>
  updateField: (input: BulkUpdateFieldInput) => Promise<BulkResult<BulkOperationSummary>>
  delete: (input: BulkDeleteInput) => Promise<BulkResult<BulkOperationSummary>>
}

export type DataTransferIpcApi = {
  exportCollectionJson: (input: ExportCollectionJsonInput) => Promise<ExportResult>
  exportDocumentsJson: (input: ExportDocumentsInput) => Promise<ExportResult>
  exportDocumentsCsv: (input: ExportDocumentsInput) => Promise<ExportResult>
}

export type WorkspaceIpcApi = {
  getState: () => Promise<WorkspaceState>
  addEntry: (input: AddWorkspaceEntryInput) => Promise<WorkspaceResult<WorkspaceEntry>>
  removeEntry: (projectId: string) => Promise<WorkspaceResult<null>>
  updateEntry: (
    projectId: string,
    input: UpdateWorkspaceEntryInput
  ) => Promise<WorkspaceResult<WorkspaceEntry>>
  loadProject: (projectId: string) => Promise<WorkspaceResult<WorkspaceEntry>>
  unloadProject: (projectId: string) => Promise<WorkspaceResult<null>>
  setFocused: (projectId: string) => Promise<WorkspaceResult<WorkspaceEntry>>
}

export interface IpcApi {
  ping: () => Promise<PingResult>
  connection: ConnectionIpcApi
  workspace: WorkspaceIpcApi
  explorer: ExplorerIpcApi
  query: QueryIpcApi
  bulk: BulkOperationsIpcApi
  dataTransfer: DataTransferIpcApi
}
