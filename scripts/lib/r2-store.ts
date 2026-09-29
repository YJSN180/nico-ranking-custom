import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { parseBufferAsJSON } from '../../lib/unified-compression'
import { retry, withDeadline } from '../../lib/pipeline/retry'
import type { PublicationStore } from '../../lib/pipeline/publish-ranking'

const R2_REQUEST_TIMEOUT_MS = 20_000
// Bounds one attempt as a whole, including body collection the request abort cannot end.
const R2_ATTEMPT_DEADLINE_MS = 30_000

export function createR2Client(): S3Client {
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
    // With response checksum validation the SDK pipes GetObject bodies through a stream
    // that never ends after an abort or reset, so the attempt would hang instead of failing.
    // gzip's CRC and JSON parsing still reject corrupted objects.
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
}

let sharedClient: S3Client | null = null

function getSharedR2Client(): S3Client {
  sharedClient ??= createR2Client()
  return sharedClient
}

export function closeR2Client(): void {
  sharedClient?.destroy()
  sharedClient = null
}

function httpStatusOf(error: unknown): number | undefined {
  const metadata = typeof error === 'object' && error !== null ? Reflect.get(error, '$metadata') : undefined
  const status = typeof metadata === 'object' && metadata !== null ? Reflect.get(metadata, 'httpStatusCode') : undefined
  return typeof status === 'number' ? status : undefined
}

async function readBody(body: { transformToByteArray: () => Promise<Uint8Array> } | undefined, Key: string): Promise<Uint8Array> {
  // A TypeError stays retryable, as the former non-null assertion failure was.
  if (!body) throw new TypeError(`Missing R2 response body: ${Key}`)
  return body.transformToByteArray()
}

function bounded<T>(operation: Promise<T>, action: string, Key: string): Promise<T> {
  return withDeadline(operation, R2_ATTEMPT_DEADLINE_MS, `R2 ${action} exceeded ${R2_ATTEMPT_DEADLINE_MS / 1000}s: ${Key}`)
}

export function createR2Store(): PublicationStore {
  const client = getSharedR2Client()
  const Bucket = process.env.R2_BUCKET_NAME || 'nico-ranking'

  const readOnce = async (Key: string): Promise<{ data: unknown; etag: string } | null> => {
    try {
      const response = await client.send(
        new GetObjectCommand({ Bucket, Key }),
        { abortSignal: AbortSignal.timeout(R2_REQUEST_TIMEOUT_MS) },
      )
      const bytes = await readBody(response.Body, Key)
      const data = await parseBufferAsJSON(new Uint8Array(bytes).buffer)
      if (!data || !response.ETag)
        throw new Error(`Invalid R2 JSON: ${Key}`)
      return { data, etag: response.ETag }
    } catch (error: unknown) {
      if (httpStatusOf(error) === 404) return null
      throw error
    }
  }

  const storedBytesMatch = async (Key: string, bytes: Uint8Array): Promise<boolean> => {
    const response = await client.send(
      new GetObjectCommand({ Bucket, Key }),
      { abortSignal: AbortSignal.timeout(R2_REQUEST_TIMEOUT_MS) },
    )
    const existing = await readBody(response.Body, Key)
    return Buffer.from(existing).equals(Buffer.from(bytes))
  }

  return {
    async read(Key) {
      return retry(() => bounded(readOnce(Key), 'read', Key))
    },
    async write(Key, bytes, options) {
      await retry(async () => {
        try {
          await bounded(
            client.send(
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
              { abortSignal: AbortSignal.timeout(R2_REQUEST_TIMEOUT_MS) },
            ),
            'write',
            Key,
          )
        } catch (error: unknown) {
          // A successful write with a lost response is idempotent, not a new publication.
          if (
            httpStatusOf(error) === 412 &&
            (await bounded(storedBytesMatch(Key, bytes), 'read', Key))
          )
            return
          throw error
        }
      })
    },
  }
}
