// ニコニコ動画のサムネイル画像を配る CDN のホスト。
// /api/thumbnail-proxy が代理取得を許すホストで、/api/hd-thumbnail が返してよい URL もこれに限る
// （HD サムネイルの保存は、その URL をプロキシ経由でダウンロードする）
export const THUMBNAIL_HOSTS: ReadonlySet<string> = new Set([
  'nicovideo.cdn.nimg.jp',
  'img.cdn.nimg.jp',
  'goptim.video.nimg.jp', // ショート動画（ss）の公式サムネイル
  'tn.smilevideo.jp',
  'tn-skr1.smilevideo.jp',
  'tn-skr2.smilevideo.jp',
  'tn-skr3.smilevideo.jp',
  'tn-skr4.smilevideo.jp',
])

/** https で、サムネイルの CDN を指す URL か（外部から得た URL を利用者へ返す前に確かめる） */
export function isThumbnailCdnUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  return url.protocol === 'https:' && THUMBNAIL_HOSTS.has(url.hostname)
}
