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

## サーバー側（Functions・Firestore ルール・Hosting）

すべて `firemint_m` で変更し、デプロイする。Windows 用の関数（`windows_*`）も `firemint_m/functions/` にある。

このリポジトリの `hosting/` と `functions/` は使わない。ここからデプロイしない。

公式サイト: https://hydrangy.com/firemint/
