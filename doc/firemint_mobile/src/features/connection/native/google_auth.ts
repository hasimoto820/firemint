import {NativeModules} from 'react-native';
import type {GoogleSession} from '../shared/session';

type GoogleAuthNative = {
  signIn: () => Promise<GoogleSession>;
  switchAccount: () => Promise<GoogleSession>;
  getSession: () => Promise<GoogleSession | null>;
  signOut: () => Promise<void>;
  ensureCloudAccess: () => Promise<void>;
  ensureAuthUsersAccess: () => Promise<void>;
  ensureServiceManagementAccess: () => Promise<void>;
};

function native(): GoogleAuthNative {
  const mod = NativeModules.GoogleAuth as GoogleAuthNative | undefined;
  if (!mod) {
    throw new Error('GoogleAuth missing');
  }
  return mod;
}

// いまの firestoreアカウントが変わった時（サインイン・切り替え・サインアウト）に知らせる。
// ホームとプロジェクト一覧は、タブの裏で開いたままになるので、これで表示を合わせる。
type SessionListener = (session: GoogleSession | null) => void;

const listeners = new Set<SessionListener>();

export function onSessionChange(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(session: GoogleSession | null) {
  listeners.forEach(listener => listener(session));
}

export async function signIn(): Promise<GoogleSession> {
  const session = await native().signIn();
  notify(session);
  return session;
}

// Googleの画面でアカウントを選び直す。キャンセルした時は、今のアカウントのまま（CANCELLED）。
export async function switchAccount(): Promise<GoogleSession> {
  const session = await native().switchAccount();
  notify(session);
  return session;
}

export function getSession(): Promise<GoogleSession | null> {
  return native().getSession();
}

export async function signOut(): Promise<void> {
  await native().signOut();
  notify(null);
}

export function ensureCloudAccess(): Promise<void> {
  return native().ensureCloudAccess();
}

export function ensureAuthUsersAccess(): Promise<void> {
  return native().ensureAuthUsersAccess();
}

export function ensureServiceManagementAccess(): Promise<void> {
  return native().ensureServiceManagementAccess();
}
