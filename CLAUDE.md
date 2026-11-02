# FireMint デスクトップ版

## トライアルのテスト

### モードの切り替え（PowerShell）

ローカルキャッシュだけを読む:

```powershell
$env:FIREMINT_ACCOUNT_CACHE_ONLY="1"
```

元に戻す（サーバーの値を読む）:

```powershell
Remove-Item Env:FIREMINT_ACCOUNT_CACHE_ONLY
```

切り替えた後に `npm run dev` で起動する。

### 値を変える場所

アプリを閉じてから、次のファイルの `firstUseDate` を書き換える。

```
C:\Users\<ユーザー名>\AppData\Roaming\firemint\account_cache.json
```

| 状態 | 値 |
| --- | --- |
| 期限切れ（過去の日付: 2023-11-15） | `1700000000000` |
| トライアル中（2026-11-02 11:00） | `1793584800000` |

## Hosting

Google の OAuth 審査中は、`hosting/` をデプロイしない。デプロイ先は審査の対象の `firemint-e801f.web.app` で、モバイル版のサイトが丸ごと置き換わる。

## Cloud Functions のデプロイ

```powershell
$env:NODE_OPTIONS="--use-system-ca"
$env:FUNCTIONS_DISCOVERY_TIMEOUT="60"
firebase deploy --only functions:windows
```

デプロイの後、同じ画面で `npm run dev` を実行する時は、先に `Remove-Item Env:NODE_OPTIONS` を実行する。
