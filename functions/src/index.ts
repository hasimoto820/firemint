import { setGlobalOptions } from "firebase-functions/v2";

// Windows 版の関数（codebase windows）。名前の頭に windows_ を付ける（002_004 の 4）。
// モバイル版の関数（codebase android、firemint_m リポジトリ）は変えない。
// Firestore(asia-northeast1 / Tokyo)とリージョンを揃える
setGlobalOptions({ region: "asia-northeast1" });

export { windows_registerDevice } from "./account/windows_registerDevice";
