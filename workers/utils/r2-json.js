const GZIP_MAGIC_FIRST_BYTE = 0x1f
const GZIP_MAGIC_SECOND_BYTE = 0x8b

export function isGzipMagicNumber(bytes) {
  return bytes.length >= 2 && bytes[0] === GZIP_MAGIC_FIRST_BYTE && bytes[1] === GZIP_MAGIC_SECOND_BYTE
}

export function detectR2ContentEncoding(r2Object, bytes) {
  const declaredEncoding = r2Object?.httpMetadata?.contentEncoding?.toLowerCase()

  if (declaredEncoding === 'gzip') {
    return 'gzip'
  }

  if (bytes && isGzipMagicNumber(bytes)) {
    return 'gzip'
  }

  return declaredEncoding || 'identity'
}

async function decompressGzip(buffer) {
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
  return await new Response(stream).text()
}

export async function readR2Text(r2Object) {
  const buffer = await r2Object.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const contentEncodingDetected = detectR2ContentEncoding(r2Object, bytes)

  const text = contentEncodingDetected === 'gzip'
    ? await decompressGzip(buffer)
    : new TextDecoder().decode(bytes)

  return {
    buffer,
    bytes,
    text,
    contentEncodingDetected,
  }
}

export async function readR2Json(r2Object) {
  const { text, contentEncodingDetected } = await readR2Text(r2Object)

  return {
    data: JSON.parse(text),
    text,
    contentEncodingDetected,
  }
}
