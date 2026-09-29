import { describe, expect, it } from 'vitest'
import sitemap from '@/app/sitemap'

function listedUrls(): string[] {
  return sitemap().map((entry) => entry.url)
}

describe('sitemap.xml', () => {
  it('leaves out pages whose content is stored on each visitor device', () => {
    const urls = listedUrls()

    // マイリストとカスタムランキングは端末ごとの保存なので、クローラーには空に見える
    expect(urls.filter((url) => url.includes('/mylists'))).toEqual([])
    expect(urls.filter((url) => url.includes('genre=custom'))).toEqual([])
  })

  it('lists each ranking page once, in the form the site links to', () => {
    const urls = listedUrls()

    expect(new Set(urls).size).toBe(urls.length)
    // 総合・24時間は既定値なので、サイト内のリンクと同じく URL に書かない
    expect(urls.filter((url) => url.includes('genre=all') || url.includes('period=24h'))).toEqual([])
    expect(urls).toEqual(
      expect.arrayContaining([
        'https://nico-rank.com',
        'https://nico-rank.com?period=hour',
        'https://nico-rank.com?genre=game',
        'https://nico-rank.com?genre=game&amp;period=hour',
      ]),
    )
  })
})
