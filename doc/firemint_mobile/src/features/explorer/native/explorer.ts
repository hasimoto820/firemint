import {NativeModules} from 'react-native';
import {ensureCloudAccess} from '../../connection/native/google_auth';
import type {DocumentPage} from '../shared/paths';

type ExplorerNative = {
  listCollections: (
    projectId: string,
    parentPath: string,
  ) => Promise<string[]>;
  listDocuments: (
    projectId: string,
    collectionPath: string,
    pageToken: string,
  ) => Promise<DocumentPage>;
  getDocument: (projectId: string, documentPath: string) => Promise<string>;
  saveDocument: (
    projectId: string,
    documentPath: string,
    fieldsJson: string,
  ) => Promise<void>;
  createDocument: (
    projectId: string,
    collectionPath: string,
    documentId: string,
    fieldsJson: string,
  ) => Promise<void>;
  deleteDocument: (projectId: string, documentPath: string) => Promise<void>;
};

function native(): ExplorerNative {
  const mod = NativeModules.Explorer as ExplorerNative | undefined;
  if (!mod) {
    throw new Error('Explorer missing');
  }
  return mod;
}

async function withToken<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const err = e as {code?: string};
    if (err.code !== 'NEED_TOKEN') {
      throw e;
    }
    await ensureCloudAccess();
    return fn();
  }
}

// ドキュメントを変えた時（保存・削除）に知らせる。
// 一覧は、詳細を開いている間も裏で開いたままになるので、これで該当の行だけを合わせる
// （別のタブで開いている一覧にも届く）。
// fieldsJson: 保存した後の中身。削除した時は null
export type DocumentChange = {
  projectId: string;
  documentPath: string;
  fieldsJson: string | null;
};

type DocumentChangeListener = (change: DocumentChange) => void;

const listeners = new Set<DocumentChangeListener>();

export function onDocumentChange(listener: DocumentChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(change: DocumentChange) {
  listeners.forEach(listener => listener(change));
}

export function listCollections(
  projectId: string,
  parentPath: string,
): Promise<string[]> {
  return withToken(() => native().listCollections(projectId, parentPath));
}

export function listDocuments(
  projectId: string,
  collectionPath: string,
  pageToken = '',
): Promise<DocumentPage> {
  return withToken(() =>
    native().listDocuments(projectId, collectionPath, pageToken),
  );
}

export function getDocument(
  projectId: string,
  documentPath: string,
): Promise<string> {
  return withToken(() => native().getDocument(projectId, documentPath));
}

export async function saveDocument(
  projectId: string,
  documentPath: string,
  fieldsJson: string,
): Promise<void> {
  await withToken(() =>
    native().saveDocument(projectId, documentPath, fieldsJson),
  );
  notify({projectId, documentPath, fieldsJson});
}

export function createDocument(
  projectId: string,
  collectionPath: string,
  documentId: string,
  fieldsJson: string,
): Promise<void> {
  return withToken(() =>
    native().createDocument(projectId, collectionPath, documentId, fieldsJson),
  );
}

export async function deleteDocument(
  projectId: string,
  documentPath: string,
): Promise<void> {
  await withToken(() => native().deleteDocument(projectId, documentPath));
  notify({projectId, documentPath, fieldsJson: null});
}
