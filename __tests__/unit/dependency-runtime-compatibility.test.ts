// @vitest-environment node
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { SourceMapConsumer, SourceMapGenerator } from 'source-map-js'

describe('patched dependency compatibility', () => {
  it('decodes SVG and produces a resized WebP image', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="blue"/></svg>',
    )
    const { data, info } = await sharp(svg)
      .resize(16, 16)
      .webp()
      .toBuffer({ resolveWithObject: true })

    expect(info).toMatchObject({ width: 16, height: 16, format: 'webp' })
    expect(await sharp(data).metadata()).toMatchObject({
      width: 16,
      height: 16,
      format: 'webp',
    })
  })

  it('preserves source positions through a generated map', () => {
    const map = new SourceMapGenerator({ file: 'bundle.js' })
    map.addMapping({
      generated: { line: 1, column: 0 },
      original: { line: 4, column: 2 },
      source: 'input.js',
      name: 'render',
    })
    const consumer = new SourceMapConsumer(map.toString())
    expect(consumer.originalPositionFor({ line: 1, column: 0 })).toEqual({
      source: 'input.js',
      line: 4,
      column: 2,
      name: 'render',
    })
  })

  it('rejects oversized indexed offsets before mapping work begins', () => {
    const map = JSON.stringify({
      version: 3,
      sections: [
        {
          offset: { line: Number.MAX_SAFE_INTEGER, column: 0 },
          map: {
            version: 3,
            sources: ['input.js'],
            names: [],
            mappings: 'AAAA',
          },
        },
      ],
    })
    expect(() => new SourceMapConsumer(map)).toThrow(/offset/i)
  })
})
