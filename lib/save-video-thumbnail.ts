import type { RankingItem } from '@/types/ranking'
import { isThumbnailCdnUrl } from '@/lib/thumbnail-hosts'

/** クリック時のみ取得。HDが取得できなければ現在表示中の画像を保存する。 */
export async function saveVideoThumbnail(
  video: Pick<RankingItem, 'id' | 'thumbURL'>,
) {
  let hdUrl: string | undefined
  try {
    const response = await fetch(
      `/api/hd-thumbnail/${encodeURIComponent(video.id)}`,
    )
    if (response.ok) {
      const data = await response.json()
      if (
        typeof data.thumbnail === 'string' &&
        isThumbnailCdnUrl(data.thumbnail)
      ) {
        hdUrl = data.thumbnail
      }
    }
  } catch {
    // HD照会が失敗しても、一覧で表示できている画像を試す。
  }

  const urls = [
    ...new Set(
      [hdUrl, video.thumbURL].filter(
        (url): url is string => !!url && isThumbnailCdnUrl(url),
      ),
    ),
  ]
  for (const thumbnailUrl of urls) {
    try {
      const response = await fetch(
        `/api/thumbnail-proxy?url=${encodeURIComponent(thumbnailUrl)}`,
      )
      if (!response.ok) continue
      const blob = await response.blob()
      if (!blob.type.startsWith('image/') || blob.size === 0) continue
      const extension =
        (
          {
            'image/png': 'png',
            'image/webp': 'webp',
            'image/gif': 'gif',
            'image/avif': 'avif',
          } as Record<string, string>
        )[blob.type] || 'jpg'
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${video.id}.${extension}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      // Safariもダウンロードを開始できるよう、クリック直後には解放しない。
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      return
    } catch {
      // 次の候補があれば試す。
    }
  }
  throw new Error('Thumbnail download failed')
}
