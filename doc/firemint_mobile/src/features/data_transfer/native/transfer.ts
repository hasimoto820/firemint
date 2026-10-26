import {NativeModules} from 'react-native';
import type {ExportTarget, QuickVerifyRow, VerifyRow} from '../shared/transfer';

type TransferNative = {
  exportDump: (
    projectId: string,
    kind: string,
    target: string,
    roots: string[],
    includeSubcollections: boolean,
    destUri: string,
    json: boolean,
  ) => Promise<{path: string}>;
  cancelTransfer: () => Promise<null>;
  verifyDumpQuick: (projectId: string, zipPath: string) => Promise<QuickVerifyRow[]>;
  verifyDumpDetailed: (projectId: string, zipPath: string) => Promise<VerifyRow[]>;
  importDump: (projectId: string, zipPath: string, overwrite: boolean) => Promise<ImportResult>;
  importSourceProject: (zipPath: string) => Promise<string>;
  pickImportFile: () => Promise<{path: string; name: string; displayPath: string}>;
  pickExportLocation: (
    suggestedName: string,
    json: boolean,
  ) => Promise<{uri: string; name: string; path: string; size: number}>;
  getProgress: () => Promise<{done: number; total: number}>;
  discardExportLocation: (destUri: string) => Promise<null>;
};

function native(): TransferNative {
  const mod = NativeModules.Transfer as TransferNative | undefined;
  if (!mod) {
    throw new Error('Transfer missing');
  }
  return mod;
}

// json: 公式ダンプ（zip）ではなく、JSON Lines（.jsonl）で書く（002_007 json）
export function exportDump(
  projectId: string,
  target: ExportTarget,
  destUri: string | null,
  json: boolean,
): Promise<{path: string}> {
  return native().exportDump(
    projectId,
    target.kind,
    target.kind === 'collection' ? target.path : target.kind === 'group' ? target.collectionId : '',
    target.kind === 'project' ? target.roots : [],
    target.kind === 'collection' && target.includeSubcollections,
    destUri ?? '',
    json,
  );
}

// 実行中のエクスポート・インポートを中止する
export function cancelTransfer(): Promise<null> {
  return native().cancelTransfer();
}

export function verifyDumpQuick(
  projectId: string,
  zipPath: string,
): Promise<QuickVerifyRow[]> {
  return native().verifyDumpQuick(projectId, zipPath);
}

export function verifyDumpDetailed(
  projectId: string,
  zipPath: string,
): Promise<VerifyRow[]> {
  return native().verifyDumpDetailed(projectId, zipPath);
}

// total: ファイルのレコード数（読み取れなかったものも含む）。total = imported + skipped + failed
// （途中で止まった時は、残りの分だけ少ない）
// skipped: 既にあったので書かなかった数 / failed: 書けなかった数（読み取れなかったレコードを含む）
// existingSamples: 既にあったドキュメントの例 / stoppedError: 途中で止まった理由（最後まで進んだ時は null）
export type ImportResult = {
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  existingSamples: string[];
  stoppedError: string | null;
  // 中止で止まった時 true
  cancelled: boolean;
};

// overwrite: 上書き（true）か追記（false）か（002_007 json）
export function importDump(
  projectId: string,
  zipPath: string,
  overwrite: boolean,
): Promise<ImportResult> {
  return native().importDump(projectId, zipPath, overwrite);
}

// インポートするファイル（公式ダンプ / JSON）のエクスポート元のプロジェクト。分からなければ空
export function importSourceProject(zipPath: string): Promise<string> {
  return native().importSourceProject(zipPath);
}

export function pickImportFile(): Promise<{path: string; name: string; displayPath: string}> {
  return native().pickImportFile();
}

export function pickExportLocation(
  suggestedName: string,
  json: boolean,
): Promise<{uri: string; name: string; path: string; size: number}> {
  return native().pickExportLocation(suggestedName, json);
}

export function getProgress(): Promise<{done: number; total: number}> {
  return native().getProgress();
}

// 保存先を選んだだけで、エクスポートしなかった時の空のファイルを消す。
// 中身がある（エクスポート済み）時は、何もしない
export function discardExportLocation(destUri: string): Promise<null> {
  return native().discardExportLocation(destUri);
}
