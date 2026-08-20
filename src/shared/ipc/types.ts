import type {
  ConnectResult,
  ConnectionStatus,
  EmulatorConnectInput,
  GoogleConnectAccountInput,
  GoogleConnectProjectInput,
  GoogleSignInResult
} from '@features/connection/shared/types'
import type {
  CreateCollectionInput,
  CreateCollectionResult,
  CreateDocumentInput,
  DocumentDetail,
  ListDocumentsOptions,
  ListDocumentsPage,
  CreateSubcollectionInput,
  CreateSubcollectionResult,
  DeleteCollectionInput,
  DeleteCollectionResult,
  DuplicateCollectionInput,
  DuplicateCollectionResult,
  DuplicateDocumentInput,
  ExplorerResult,
  RenameCollectionInput,
  RenameCollectionResult,
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
  BulkCreateFieldInput,
  BulkDeleteFieldInput,
  BulkDeleteInput,
  BulkFieldPreview,
  BulkFieldWriteResult,
  BulkOperationSummary,
  BulkRenameFieldInput,
  BulkResult,
  BulkUpdateFieldInput,
  BulkUpdateFieldValueInput,
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
  ImportDocumentsJsonInput,
  ImportCollectionProgress,
  ImportCollectionValidationResult,
  ImportProjectInput,
  ImportProjectProgress,
  ImportProjectResult,
  ImportProjectValidationResult,
  ImportResult,
  PeekCollectionImportResult
} from '@features/data_transfer/shared/types'

import type {
  CancelScriptJobResult,
  ScriptJobSnapshot,
  StartScriptJobInput,
  StartScriptJobResult
} from '@features/script_runner/shared/types'

import type {
  ImportEmulatorCollectionJsonInput,
  ImportEmulatorProjectZipInput,
  ImportEmulatorProjectZipResult,
  DeleteEmulatorProjectInput,
  DeleteEmulatorProjectResult
} from '@features/emulator/shared/types'

import type {
  AddWorkspaceEntryInput,
  SetFocusedProjectOptions,
  UpdateWorkspaceEntryInput,
  WorkspaceEntry,
  WorkspaceResult,
  WorkspaceState
} from '@features/workspace/shared/types'

import type {
  AuthUser,
  AuthUsersMutationSummary,
  AuthUsersResult,
  DeleteAuthUsersInput,
  ExportAuthUsersInput,
  ExportAuthUsersResult,
  ListAuthUsersInput,
  ListAuthUsersResult,
  SetAuthUsersDisabledInput,
  UpdateAuthUserInput
} from '@features/auth_users/shared/types'

import type { AppSettings, Theme } from '@shared/settings/shared/types'
import type { Locale } from '@shared/i18n/shared/types'

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

export type WindowConfirmInput = {
  message: string
  confirmLabel?: string
  cancelLabel?: string
  detail?: string
  checkboxLabel?: string
  checkboxChecked?: boolean
}

export type WindowConfirmResult = {
  confirmed: boolean
  checkboxChecked: boolean
}

export type WindowIpcApi = {
  minimize: () => Promise<void>
  maximizeToggle: () => Promise<boolean>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
  confirm: (input: WindowConfirmInput) => Promise<WindowConfirmResult>
}

export type ConnectionIpcApi = {
  selectServiceAccountFile: () => Promise<string | null>
  connect: (filePath: string) => Promise<ConnectResult>
  googleSignIn: () => Promise<GoogleSignInResult>
  googleCancelSignIn: () => Promise<void>
  googleConnectProject: (input: GoogleConnectProjectInput) => Promise<ConnectResult>
  googleConnectAccount: (input: GoogleConnectAccountInput) => Promise<ConnectResult>
  connectEmulator: (input: EmulatorConnectInput) => Promise<ConnectResult>
  disconnect: () => Promise<void>
  getStatus: () => Promise<ConnectionStatus | null>
}

export type ExplorerIpcApi = {
  listRootCollections: (projectId: string) => Promise<ExplorerResult<string[]>>
  listDocuments: (
    projectId: string,
    collectionPath: string,
    options?: ListDocumentsOptions
  ) => Promise<ExplorerResult<ListDocumentsPage>>
  countDocuments: (
    projectId: string,
    collectionPath: string
  ) => Promise<ExplorerResult<number>>
  getDocument: (projectId: string, documentPath: string) => Promise<ExplorerResult<DocumentDetail>>
  createDocument: (input: CreateDocumentInput) => Promise<ExplorerResult<string>>
  updateDocument: (input: UpdateDocumentInput) => Promise<ExplorerResult<null>>
  deleteDocument: (projectId: string, documentPath: string) => Promise<ExplorerResult<null>>
  listSubcollections: (projectId: string, documentPath: string) => Promise<ExplorerResult<string[]>>
  duplicateDocument: (input: DuplicateDocumentInput) => Promise<ExplorerResult<string>>
  duplicateCollection: (
    input: DuplicateCollectionInput
  ) => Promise<ExplorerResult<DuplicateCollectionResult>>
  renameCollection: (
    input: RenameCollectionInput
  ) => Promise<ExplorerResult<RenameCollectionResult>>
  createCollection: (
    input: CreateCollectionInput
  ) => Promise<ExplorerResult<CreateCollectionResult>>
  createSubcollection: (
    input: CreateSubcollectionInput
  ) => Promise<ExplorerResult<CreateSubcollectionResult>>
  deleteCollection: (
    input: DeleteCollectionInput
  ) => Promise<ExplorerResult<DeleteCollectionResult>>
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
  previewCreateField: (input: BulkCreateFieldInput) => Promise<BulkResult<BulkFieldPreview>>
  createField: (input: BulkCreateFieldInput) => Promise<BulkResult<BulkFieldWriteResult>>
  previewUpdateFieldValue: (
    input: BulkUpdateFieldValueInput
  ) => Promise<BulkResult<BulkFieldPreview>>
  updateFieldValue: (
    input: BulkUpdateFieldValueInput
  ) => Promise<BulkResult<BulkFieldWriteResult>>
  previewRenameField: (input: BulkRenameFieldInput) => Promise<BulkResult<BulkFieldPreview>>
  renameField: (input: BulkRenameFieldInput) => Promise<BulkResult<BulkFieldWriteResult>>
  previewDeleteField: (input: BulkDeleteFieldInput) => Promise<BulkResult<BulkFieldPreview>>
  deleteField: (input: BulkDeleteFieldInput) => Promise<BulkResult<BulkFieldWriteResult>>
  delete: (input: BulkDeleteInput) => Promise<BulkResult<BulkOperationSummary>>
}

export type DataTransferIpcApi = {
  exportCollectionJson: (input: ExportCollectionJsonInput) => Promise<ExportResult>
  exportDocumentsJson: (input: ExportDocumentsInput) => Promise<ExportResult>
  exportDocumentsCsv: (input: ExportDocumentsInput) => Promise<ExportResult>
  selectCollectionImportJson: () => Promise<{ canceled: boolean; filePath: string | null }>
  peekCollectionImportJson: (filePath: string) => Promise<PeekCollectionImportResult>
  validateCollectionImport: (
    input: ImportCollectionJsonInput
  ) => Promise<ImportCollectionValidationResult>
  importCollectionJson: (input: ImportCollectionJsonInput) => Promise<ImportResult>
  importDocumentsJson: (input: ImportDocumentsJsonInput) => Promise<ImportResult>
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

export type ScriptRunnerIpcApi = {
  start: (input: StartScriptJobInput) => Promise<StartScriptJobResult>
  cancel: () => Promise<CancelScriptJobResult>
  getSnapshot: () => Promise<ScriptJobSnapshot | null>
  onSnapshot: (listener: (snapshot: ScriptJobSnapshot) => void) => () => void
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
  setFocused: (
    projectId: string,
    options?: SetFocusedProjectOptions
  ) => Promise<WorkspaceResult<WorkspaceEntry>>
}

export type AuthUsersIpcApi = {
  listUsers: (input: ListAuthUsersInput) => Promise<AuthUsersResult<ListAuthUsersResult>>
  getUser: (projectId: string, uid: string) => Promise<AuthUsersResult<AuthUser>>
  updateUser: (input: UpdateAuthUserInput) => Promise<AuthUsersResult<AuthUser>>
  setUsersDisabled: (
    input: SetAuthUsersDisabledInput
  ) => Promise<AuthUsersResult<AuthUsersMutationSummary>>
  deleteUsers: (
    input: DeleteAuthUsersInput
  ) => Promise<AuthUsersResult<AuthUsersMutationSummary>>
  exportUsers: (
    input: ExportAuthUsersInput
  ) => Promise<AuthUsersResult<ExportAuthUsersResult>>
}

export type EmulatorIpcApi = {
  importProjectZip: (
    input: ImportEmulatorProjectZipInput
  ) => Promise<ImportEmulatorProjectZipResult>
  importCollectionJson: (input: ImportEmulatorCollectionJsonInput) => Promise<ImportResult>
  deleteProject: (input: DeleteEmulatorProjectInput) => Promise<DeleteEmulatorProjectResult>
}

export type SettingsIpcApi = {
  get: () => Promise<AppSettings>
  setLocale: (locale: Locale) => Promise<AppSettings>
  setTheme: (theme: Theme) => Promise<AppSettings>
  openWindow: () => Promise<null>
  onChanged: (listener: (settings: AppSettings) => void) => () => void
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
  emulator: EmulatorIpcApi
  scriptRunner: ScriptRunnerIpcApi
  authUsers: AuthUsersIpcApi
  settings: SettingsIpcApi
}
