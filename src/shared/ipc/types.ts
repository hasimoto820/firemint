import type {
  ConnectResult,
  ConnectionStatus
} from '@features/connection/shared/types'
import type {
  CreateDocumentInput,
  DocumentDetail,
  DocumentSummary,
  DuplicateCollectionInput,
  DuplicateCollectionResult,
  DuplicateDocumentInput,
  ExplorerResult,
  UpdateDocumentInput
} from '@features/explorer/shared/types'

import type {
  QueryExecuteResult,
  JsQueryInput,
  SavedQuery,
  SavedQueryResult,
  SaveSavedQueryInput
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
  ExportProjectInput,
  ExportProjectProgress,
  ExportProjectResult,
  ExportResult,
  ImportCollectionJsonInput,
  ImportCollectionProgress,
  ImportCollectionValidationResult,
  ImportProjectInput,
  ImportProjectProgress,
  ImportProjectResult,
  ImportProjectValidationResult,
  ImportResult
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

export type AppAboutInfo = {
  name: string
  version: string
  description: string
}

export type AppIpcApi = {
  quit: () => Promise<void>
  getAbout: () => Promise<AppAboutInfo>
  openExternal: (url: string) => Promise<void>
}

export type WindowIpcApi = {
  minimize: () => Promise<void>
  maximizeToggle: () => Promise<boolean>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
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
  duplicateDocument: (input: DuplicateDocumentInput) => Promise<ExplorerResult<string>>
  duplicateCollection: (
    input: DuplicateCollectionInput
  ) => Promise<ExplorerResult<DuplicateCollectionResult>>
}

export type QueryIpcApi = {
  execute: (input: JsQueryInput) => Promise<QueryExecuteResult>
  listSaved: (projectId?: string) => Promise<SavedQueryResult<SavedQuery[]>>
  saveSaved: (input: SaveSavedQueryInput) => Promise<SavedQueryResult<SavedQuery>>
  deleteSaved: (id: string) => Promise<SavedQueryResult<null>>
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
  selectCollectionImportJson: () => Promise<{ canceled: boolean; filePath: string | null }>
  validateCollectionImport: (
    input: ImportCollectionJsonInput
  ) => Promise<ImportCollectionValidationResult>
  importCollectionJson: (input: ImportCollectionJsonInput) => Promise<ImportResult>
  onImportCollectionProgress: (
    listener: (progress: ImportCollectionProgress) => void
  ) => () => void
  exportProject: (input: ExportProjectInput) => Promise<ExportProjectResult>
  onExportProjectProgress: (
    listener: (progress: ExportProjectProgress) => void
  ) => () => void
  selectProjectImportZip: () => Promise<{ canceled: boolean; filePath: string | null }>
  validateProjectImport: (
    input: ImportProjectInput
  ) => Promise<ImportProjectValidationResult>
  importProject: (input: ImportProjectInput) => Promise<ImportProjectResult>
  onImportProjectProgress: (
    listener: (progress: ImportProjectProgress) => void
  ) => () => void
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
  app: AppIpcApi
  window: WindowIpcApi
  connection: ConnectionIpcApi
  workspace: WorkspaceIpcApi
  explorer: ExplorerIpcApi
  query: QueryIpcApi
  bulk: BulkOperationsIpcApi
  dataTransfer: DataTransferIpcApi
}
