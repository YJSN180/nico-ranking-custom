import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { parseBufferAsJSON } from '../../lib/unified-compression'
import { retry } from '../../lib/pipeline/retry'
import type { PublicationStore } from '../../lib/pipeline/publish-ranking'

export function createR2Client() {
  for (const key of [
    'CLOUDFLARE_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
  ]) {
    if (!process.env[key]) throw new Error(`Missing ${key}`)
  }
  return new S3Client({
    region: 'auto',
    maxAttempts: 1,
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
}

export function createR2Store(): PublicationStore {
  const client = createR2Client()
  const Bucket = process.env.R2_BUCKET_NAME || 'nico-ranking'
  return {
    async read(Key) {
      return retry(async () => {
        try {
          const response = await client.send(
            new GetObjectCommand({ Bucket, Key }),
            { abortSignal: AbortSignal.timeout(20_000) },
          )
          const bytes = await response.Body!.transformToByteArray()
          const data = await parseBufferAsJSON(new Uint8Array(bytes).buffer)
          if (!data || !response.ETag)
            throw new Error(`Invalid R2 JSON: ${Key}`)
          return { data, etag: response.ETag }
        } catch (error: any) {
          if (error.$metadata?.httpStatusCode === 404) return null
          throw error
        }
      })
    },
    async write(Key, bytes, options) {
      await retry(async () => {
        try {
          await client.send(
            new PutObjectCommand({
              Bucket,
              Key,
              Body: bytes,
              ContentType: 'application/json',
              ContentEncoding: options.gzip ? 'gzip' : undefined,
              CacheControl:
                Key === 'rankings/current.json'
                  ? 'no-store'
                  : 'public, max-age=300',
              IfMatch: options.ifMatch,
              IfNoneMatch: options.ifNoneMatch,
            }),
            { abortSignal: AbortSignal.timeout(20_000) },
          )
        } catch (error: any) {
          // A successful write with a lost response is idempotent, not a new publication.
          if (error.$metadata?.httpStatusCode === 412) {
            const response = await client.send(
              new GetObjectCommand({ Bucket, Key }),
              { abortSignal: AbortSignal.timeout(20_000) },
            )
            const existing = await response.Body!.transformToByteArray()
            if (Buffer.from(existing).equals(Buffer.from(bytes))) return
          }
          throw error
        }
      })
    },
  }
}
