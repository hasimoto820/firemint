import {NativeModules} from 'react-native';
import type {
  AuthUser,
  ListAuthUsersResult,
  UpdateAuthUserInput,
} from '../shared/auth_users';

type AuthUsersNative = {
  listUsers: (projectId: string, pageToken: string) => Promise<ListAuthUsersResult>;
  getUser: (projectId: string, uid: string) => Promise<AuthUser>;
  updateUser: (
    projectId: string,
    uid: string,
    email: string,
    displayName: string,
    phoneNumber: string,
    password: string,
    emailVerified: boolean,
    customAttributesJson: string,
  ) => Promise<AuthUser>;
  setDisabled: (projectId: string, uid: string, disabled: boolean) => Promise<AuthUser>;
  deleteUser: (projectId: string, uid: string) => Promise<void>;
  enableIdentityToolkit: (projectId: string) => Promise<void>;
  pickExportLocation: (suggestedName: string) => Promise<{uri: string; name: string; path: string}>;
  writeExport: (destUri: string, content: string) => Promise<void>;
};

function native(): AuthUsersNative {
  const mod = NativeModules.AuthUsers as AuthUsersNative | undefined;
  if (!mod) {
    throw new Error('AuthUsers missing');
  }
  return mod;
}

// ユーザーを変えた時（保存・無効化/有効化・削除）に知らせる。
// 一覧は、詳細を開いている間も裏で開いたままになるので、これで該当の行だけを合わせる。
// user: 変えた後の値。削除した時は null
export type AuthUserChange = {
  projectId: string;
  uid: string;
  user: AuthUser | null;
};

type AuthUserChangeListener = (change: AuthUserChange) => void;

const listeners = new Set<AuthUserChangeListener>();

export function onAuthUserChange(listener: AuthUserChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(change: AuthUserChange) {
  listeners.forEach(listener => listener(change));
}

export function listUsers(
  projectId: string,
  pageToken: string,
): Promise<ListAuthUsersResult> {
  return native().listUsers(projectId, pageToken);
}

export function getUser(projectId: string, uid: string): Promise<AuthUser> {
  return native().getUser(projectId, uid);
}

export async function updateUser(
  projectId: string,
  uid: string,
  input: UpdateAuthUserInput,
): Promise<AuthUser> {
  const user = await native().updateUser(
    projectId,
    uid,
    input.email,
    input.displayName,
    input.phoneNumber,
    input.password,
    input.emailVerified,
    input.customAttributesJson,
  );
  notify({projectId, uid, user});
  return user;
}

export async function setDisabled(
  projectId: string,
  uid: string,
  disabled: boolean,
): Promise<AuthUser> {
  const user = await native().setDisabled(projectId, uid, disabled);
  notify({projectId, uid, user});
  return user;
}

export async function deleteUser(projectId: string, uid: string): Promise<void> {
  await native().deleteUser(projectId, uid);
  notify({projectId, uid, user: null});
}

export function enableIdentityToolkit(projectId: string): Promise<void> {
  return native().enableIdentityToolkit(projectId);
}

export function pickExportLocation(
  suggestedName: string,
): Promise<{uri: string; name: string; path: string}> {
  return native().pickExportLocation(suggestedName);
}

export function writeExport(destUri: string, content: string): Promise<void> {
  return native().writeExport(destUri, content);
}
