/**
 * 取り込むバックアップファイルの大きさの上限。
 * 間違えて選んだ大きなファイルを丸ごと文字列にして JSON.parse すると、タブが固まったり落ちたりする。
 * 実際のバックアップ（動画 10 万件でも数十 MB 程度）は収まる大きさにしている
 */
export const MAX_BACKUP_FILE_BYTES = 50 * 1024 * 1024

export const BACKUP_FILE_TOO_LARGE_MESSAGE = 'ファイルが大きすぎます（50MBまで）。バックアップファイルを選んでください'

export function isBackupFileTooLarge(file: File): boolean {
  return file.size > MAX_BACKUP_FILE_BYTES
}
