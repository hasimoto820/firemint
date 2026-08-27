export const LOGS_DIR_NAME = 'logs'

export const APP_LOG_PREFIX = 'firemint_app'
export const JOB_LOG_PREFIX = 'firemint_job'

/** 1 ファイルあたりの上限（超えたら同日の続きファイル） */
export const LOG_MAX_BYTES = 5 * 1024 * 1024

/** これより古い日付のログファイルを削除 */
export const LOG_RETENTION_DAYS = 14

export type LogFileKind = 'app' | 'job'

export function logPrefixForKind(kind: LogFileKind): string {
  return kind === 'app' ? APP_LOG_PREFIX : JOB_LOG_PREFIX
}
