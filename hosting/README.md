# FireMint hosting（Firebase Hosting）

デスクトップアプリ本体（`src/`）とは独立した紹介サイトです。

## 開発

```bash
cd hosting
npm install
npm run dev
```

## ビルド

```bash
cd hosting
npm run build
```

## Firebase Hosting へデプロイ

対象プロジェクトは `firemint-e801f` のみ。鍵は `hosting/secrets/` に閉じる（Git 対象外）。手順は `hosting/secrets/README.txt`。

手元ログイン:

```bash
cd hosting
npx firebase-tools login
npm run build
npx firebase-tools deploy --only hosting
```

サービスアカウント（このプロジェクトで新規発行した JSON）:

```powershell
cd F:\FireMint\sys\firemint\hosting
$env:GOOGLE_APPLICATION_CREDENTIALS = "$PWD\secrets\firebase-adminsdk.json"
npm run build
npx firebase-tools deploy --only hosting
```

## ルーティング

| パス | 内容 |
|------|------|
| `/` | ランディング |
| `/contact` | お問い合わせ（プレースホルダ） |
| `/privacy` | プライバシー（プレースホルダ） |

将来 `/pricing` などを `App.tsx` に追加する想定です。
