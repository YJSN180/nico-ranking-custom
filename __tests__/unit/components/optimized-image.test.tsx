import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OptimizedImage } from '@/components/optimized-image'

// Next.js Image コンポーネントのモック
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, width, height, fill, sizes, style, loading, priority, className, onClick, unoptimized, onError, ...props }: any) => {
    // テスト用のデータ属性を追加
    return (
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        style={style}
        loading={loading}
        className={className}
        onClick={onClick}
        onError={onError}
        data-fill={fill}
        data-sizes={sizes}
        data-priority={priority}
        data-unoptimized={unoptimized}
        {...props}
      />
    )
  }
}))

describe('OptimizedImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('ニコニコ動画CDN画像の特別な扱い', () => {
    it('ニコニコ動画CDNの画像は通常の<img>タグで表示されること', () => {
      const { container } = render(
        <OptimizedImage
          src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/1234567.jpg"
          alt="Nico CDN image"
          width={100}
          height={100}
          sizes="100px"
        />
      )

      const img = container.querySelector('img')
      expect(img).toBeTruthy()
      // ニコニコ動画CDNの画像でも next/image を使用しつつ最適化を無効化する
      expect(img?.getAttribute('data-sizes')).toBe('100px')
      expect(img?.getAttribute('data-fill')).toBeNull()
      expect(img?.getAttribute('data-priority')).toBeNull()
      expect(img?.getAttribute('data-unoptimized')).toBe('true')
    })

    it('ニコニコ動画の各種CDNドメインが正しく識別されること', () => {
      const nicoUrls = [
        'https://tn.smilevideo.jp/thumbnail.jpg',
        'https://nicovideo.cdn.nimg.jp/video.jpg',
        'https://secure-dcdn.cdn.nimg.jp/usericon.jpg'
      ]

      nicoUrls.forEach(url => {
        const { container } = render(
          <OptimizedImage
            src={url}
            alt="Nico image"
            width={100}
            height={100}
          />
        )

        const img = container.querySelector('img')
        expect(img).toBeTruthy()
        // 通常の<img>タグが使用されていることを確認
        expect(img?.getAttribute('data-unoptimized')).toBe('true')
      })
    })
  })

  describe('外部画像の最適化', () => {
    it('外部画像に対してもNext.jsの画像最適化が有効になること（unoptimized未設定）', () => {
      const { container } = render(
        <OptimizedImage
          src="https://example.com/image.jpg"
          alt="External image"
          width={100}
          height={100}
        />
      )

      const img = container.querySelector('img')
      expect(img).toBeTruthy()
      // unoptimized=false で Next.js の最適化が有効になる
      expect(img?.getAttribute('data-unoptimized')).toBe('false')
    })

    it('ローカル画像に対してNext.jsの画像最適化が有効になること（unoptimized未設定）', () => {
      const { container } = render(
        <OptimizedImage
          src="/local/image.jpg"
          alt="Local image"
          width={100}
          height={100}
        />
      )

      const img = container.querySelector('img')
      expect(img).toBeTruthy()
      // unoptimizedが設定されていないこと
      expect(img?.getAttribute('data-unoptimized')).toBe('false')
    })

    it('投稿者アイコンサイズ（18x18）でも最適化を無効化してレンダリングされること', () => {
      const { container } = render(
        <OptimizedImage
          src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/1234567.jpg"
          alt="Author icon"
          width={18}
          height={18}
          sizes="18px"
        />
      )

      const img = container.querySelector('img')
      expect(img).toBeTruthy()
      expect(img?.getAttribute('width')).toBe('18')
      expect(img?.getAttribute('height')).toBe('18')
      // ニコニコ動画CDNの画像でも指定したsizesがそのまま適用される
      expect(img?.getAttribute('data-sizes')).toBe('18px')
      // unoptimized=true で Next.js 最適化をバイパスする
      expect(img?.getAttribute('data-unoptimized')).toBe('true')
    })
  })

  describe('サイズ設定', () => {
    it('width=18, height=18で正しくレンダリングされること', () => {
      const { container } = render(
        <OptimizedImage
          src="/test.jpg"
          alt="Test image"
          width={18}
          height={18}
        />
      )

      const img = container.querySelector('img')
      expect(img).toBeTruthy()
      expect(img?.getAttribute('width')).toBe('18')
      expect(img?.getAttribute('height')).toBe('18')
    })

    it('fillプロパティが正しく設定されること', () => {
      const { container } = render(
        <OptimizedImage
          src="/test.jpg"
          alt="Test image"
          fill
        />
      )

      const img = container.querySelector('img')
      expect(img).toBeTruthy()
      expect(img?.getAttribute('data-fill')).toBe('true')
    })
  })

  describe('sizesプロパティ', () => {
    it('sizesプロパティが適切に設定されること', () => {
      const sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
      const { container } = render(
        <OptimizedImage
          src="/test.jpg"
          alt="Test image"
          width={100}
          height={100}
          sizes={sizes}
        />
      )

      const img = container.querySelector('img')
      expect(img).toBeTruthy()
      expect(img?.getAttribute('data-sizes')).toBe(sizes)
    })

    it('sizesプロパティが未指定の場合も正常にレンダリングされること', () => {
      const { container } = render(
        <OptimizedImage
          src="/test.jpg"
          alt="Test image"
          width={100}
          height={100}
        />
      )

      const img = container.querySelector('img')
      expect(img).toBeTruthy()
      expect(img?.getAttribute('data-sizes')).toBeNull()
    })
  })

  describe('画像フォーマットのサポート', () => {
    it('ローカル画像でWebP/AVIFフォーマットがサポートされること（最適化有効）', () => {
      // Next.jsの画像最適化が有効な場合、自動的にWebP/AVIFがサポートされる
      const { container } = render(
        <OptimizedImage
          src="/test.jpg"
          alt="Test image"
          width={100}
          height={100}
        />
      )

      const img = container.querySelector('img')
      expect(img).toBeTruthy()
      // unoptimizedが設定されていない = 最適化有効 = WebP/AVIFサポート
      expect(img?.getAttribute('data-unoptimized')).toBe('false')
    })

    it('外部画像でもWebP/AVIFフォーマットがサポートされること（最適化有効）', () => {
      const { container } = render(
        <OptimizedImage
          src="https://example.com/test.jpg"
          alt="Test image"
          width={100}
          height={100}
        />
      )

      const img = container.querySelector('img')
      expect(img).toBeTruthy()
      // unoptimizedが設定されていない = 最適化有効 = WebP/AVIFサポートあり
      expect(img?.getAttribute('data-unoptimized')).toBe('false')
    })
  })

  describe('loading属性', () => {
    it('loading="lazy"が設定されること', () => {
      const { container } = render(
        <OptimizedImage
          src="/test.jpg"
          alt="Test image"
          width={100}
          height={100}
          loading="lazy"
        />
      )

      const img = container.querySelector('img')
      expect(img).toBeTruthy()
      expect(img?.getAttribute('loading')).toBe('lazy')
    })

    it('loading="eager"が設定されること', () => {
      const { container } = render(
        <OptimizedImage
          src="/test.jpg"
          alt="Test image"
          width={100}
          height={100}
          loading="eager"
        />
      )

      const img = container.querySelector('img')
      expect(img).toBeTruthy()
      expect(img?.getAttribute('loading')).toBe('eager')
    })

    it('loading属性が未指定の場合、デフォルト値が使用されること', () => {
      const { container } = render(
        <OptimizedImage
          src="/test.jpg"
          alt="Test image"
          width={100}
          height={100}
        />
      )

      const img = container.querySelector('img')
      expect(img).toBeTruthy()
      // Next.jsのデフォルトではloadingは設定されない
      expect(img?.getAttribute('loading')).toBeNull()
    })

    it('priorityがtrueの場合、loading属性が無視されること', () => {
      const { container } = render(
        <OptimizedImage
          src="/test.jpg"
          alt="Test image"
          width={100}
          height={100}
          loading="lazy"
          priority
        />
      )

      const img = container.querySelector('img')
      expect(img).toBeTruthy()
      expect(img?.getAttribute('data-priority')).toBe('true')
      // priorityがtrueの場合、Next.jsはloading="eager"相当の動作をする
    })
  })

  describe('エラーハンドリング', () => {
    it('画像読み込みエラー時にフォールバック画像が表示されること', async () => {
      const onError = vi.fn()
      const { container } = render(
        <OptimizedImage
          src="/broken-image.jpg"
          alt="Broken image"
          width={100}
          height={100}
          fallbackSrc="/cantwatch.jpg"
          onError={onError}
        />
      )

      const img = container.querySelector('img')
      expect(img).toBeTruthy()
      expect(img?.getAttribute('src')).toBe('/broken-image.jpg')

      // エラーイベントを発火
      fireEvent.error(img!)

      await waitFor(() => {
        expect(img?.getAttribute('src')).toBe('/cantwatch.jpg')
        expect(img?.getAttribute('alt')).toBe('視聴できません')
        expect(onError).toHaveBeenCalled()
      })
    })

    it('カスタムフォールバック画像が使用されること', async () => {
      const { container } = render(
        <OptimizedImage
          src="/broken-image.jpg"
          alt="Broken image"
          width={100}
          height={100}
          fallbackSrc="/custom-fallback.jpg"
        />
      )

      const img = container.querySelector('img')
      fireEvent.error(img!)

      await waitFor(() => {
        expect(img?.getAttribute('src')).toBe('/custom-fallback.jpg')
      })
    })

    it('ニコ動サムネイルからフォールバックした場合は最適化が再有効化されること', async () => {
      const { container } = render(
        <OptimizedImage
          src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/1234567.jpg"
          alt="Broken image"
          width={100}
          height={100}
          fallbackSrc="/cantwatch.jpg"
        />
      )

      const img = container.querySelector('img')
      expect(img?.getAttribute('data-unoptimized')).toBe('true')

      fireEvent.error(img!)

      await waitFor(() => {
        expect(img?.getAttribute('src')).toBe('/cantwatch.jpg')
        // フォールバック画像ではNext.js最適化を再度有効化
        expect(img?.getAttribute('data-unoptimized')).toBe('false')
      })
    })
  })

  describe('その他のプロパティ', () => {
    it('classNameが正しく適用されること', () => {
      const { container } = render(
        <OptimizedImage
          src="/test.jpg"
          alt="Test image"
          width={100}
          height={100}
          className="custom-class"
        />
      )

      const img = container.querySelector('img')
      expect(img).toBeTruthy()
      expect(img?.className).toBe('custom-class')
    })

    it('styleが正しく適用されること', () => {
      const style = { borderRadius: '8px', opacity: 0.8 }
      const { container } = render(
        <OptimizedImage
          src="/test.jpg"
          alt="Test image"
          width={100}
          height={100}
          style={style}
        />
      )

      const img = container.querySelector('img')
      expect(img).toBeTruthy()
      expect(img?.style.borderRadius).toBe('8px')
      expect(img?.style.opacity).toBe('0.8')
    })

    it('onClickハンドラーが正しく動作すること', () => {
      const onClick = vi.fn()
      const { container } = render(
        <OptimizedImage
          src="/test.jpg"
          alt="Test image"
          width={100}
          height={100}
          onClick={onClick}
        />
      )

      const img = container.querySelector('img')
      fireEvent.click(img!)

      expect(onClick).toHaveBeenCalled()
    })
  })

  describe('統合テスト', () => {
    it('複数のプロパティを組み合わせて正しく動作すること', () => {
      const onClick = vi.fn()
      const { container } = render(
        <OptimizedImage
          src="/test.jpg"
          alt="Test image"
          width={18}
          height={18}
          sizes="18px"
          loading="lazy"
          className="thumbnail"
          style={{ borderRadius: '4px' }}
          onClick={onClick}
        />
      )

      const img = container.querySelector('img')
      expect(img).toBeTruthy()
      expect(img?.getAttribute('src')).toBe('/test.jpg')
      expect(img?.getAttribute('alt')).toBe('Test image')
      expect(img?.getAttribute('width')).toBe('18')
      expect(img?.getAttribute('height')).toBe('18')
      expect(img?.getAttribute('data-sizes')).toBe('18px')
      expect(img?.getAttribute('loading')).toBe('lazy')
      expect(img?.className).toBe('thumbnail')
      expect(img?.style.borderRadius).toBe('4px')
      expect(img?.getAttribute('data-unoptimized')).toBe('false') // ローカル画像なので最適化有効

      fireEvent.click(img!)
      expect(onClick).toHaveBeenCalled()
    })
  })
})
