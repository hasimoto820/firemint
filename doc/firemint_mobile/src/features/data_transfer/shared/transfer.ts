export type ExportScope = 'project' | 'collection' | 'group';

// エクスポートの範囲（001_008_todo 項目 6）
// project: 選んだルートコレクション（サブコレクションは常に含む）
// collection: コレクションのパス / group: コレクション ID（サブコレクションは含まない）
export type ExportTarget =
  | {kind: 'project'; roots: string[]}
  | {kind: 'collection'; path: string; includeSubcollections: boolean}
  | {kind: 'group'; collectionId: string};

export type VerifySide = {
  total: number;
  only: number;
};

export type VerifyRow = {
  collectionId: string;
  cloud: VerifySide | null;
  file: VerifySide | null;
};

export type QuickVerifyRow = {
  collectionId: string;
  cloud: number | null;
  file: number | null;
};
