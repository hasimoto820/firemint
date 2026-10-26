import {NativeModules} from 'react-native';
import type {Snippet, SnippetGroup, SnippetStore} from '../shared/snippet';

type SnippetNative = {
  list: () => Promise<SnippetStore>;
  addGroup: (name: string) => Promise<SnippetGroup>;
  updateGroup: (id: number, name: string) => Promise<SnippetGroup>;
  removeGroup: (id: number) => Promise<void>;
  addSnippet: (groupId: number, name: string, body: string) => Promise<Snippet>;
  updateSnippet: (
    id: number,
    groupId: number,
    name: string,
    body: string,
  ) => Promise<Snippet>;
  removeSnippet: (id: number) => Promise<void>;
  copyBody: (id: number) => Promise<{body: string}>;
};

function native(): SnippetNative {
  const mod = NativeModules.Snippet as SnippetNative | undefined;
  if (!mod) {
    throw new Error('Snippet missing');
  }
  return mod;
}

export function listSnippets(): Promise<SnippetStore> {
  return native().list();
}

export function addGroup(name: string): Promise<SnippetGroup> {
  return native().addGroup(name);
}

export function updateGroup(id: number, name: string): Promise<SnippetGroup> {
  return native().updateGroup(id, name);
}

export function removeGroup(id: number): Promise<void> {
  return native().removeGroup(id);
}

export function addSnippet(
  groupId: number | null,
  name: string,
  body: string,
): Promise<Snippet> {
  return native().addSnippet(groupId ?? 0, name, body);
}

export function updateSnippet(
  id: number,
  groupId: number | null,
  name: string,
  body: string,
): Promise<Snippet> {
  return native().updateSnippet(id, groupId ?? 0, name, body);
}

export function removeSnippet(id: number): Promise<void> {
  return native().removeSnippet(id);
}

export function copySnippet(id: number): Promise<string> {
  return native().copyBody(id).then(r => r.body);
}
