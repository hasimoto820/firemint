import type {StringKey} from '../../../shared/i18n/i18n';

type TranslateFn = (key: StringKey, vars?: Record<string, string | number>) => string;

export type ExplorerDoc = {
  id: string;
  path: string;
};

export type DocumentPage = {
  documents: ExplorerDoc[];
  nextPageToken: string;
};

export function joinPath(...parts: string[]): string {
  return parts.filter(p => p.length > 0).join('/');
}

// パスの末尾（いまのページの対象）
export function lastSegment(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

// ヘッダーを開いた時に見せるフルパス（プロジェクト / コレクション / ドキュメント / …）
export function fullPath(projectName: string, path: string): string {
  return [projectName, ...path.split('/')].join(' / ');
}

export function assertSegment(t: TranslateFn, value: string, label: string): string {
  const id = value.trim();
  if (!id) {
    throw new Error(t('common.fieldRequired', {label}));
  }
  if (id.includes('/')) {
    throw new Error(t('common.noSlash', {label}));
  }
  return id;
}
