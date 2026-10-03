import https from 'node:https'
import {
  HOST,
  PREFIXES,
  staticPaths,
  compareAsset,
  sha256,
} from './static-asset-routing.mjs'

// TCP may target Vercel, but Host, SNI and certificate verification stay on the public hostname.
// Never send cookies, credentials, bypass headers, or follow authentication redirects.
export function request(path, origin, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: origin || HOST,
        servername: HOST,
        rejectUnauthorized: true,
        path,
        method,
        headers: {
          Host: HOST,
          'User-Agent': 'nico-ranking-verification/1.0',
          'Accept-Encoding': 'identity',
        },
        timeout: 15000,
        signal: AbortSignal.timeout(15000),
      },
      (res) => {
        const chunks = []
        let size = 0
        res.on('data', (chunk) => {
          size += chunk.length
          if (size > 8 * 1024 * 1024)
            req.destroy(new Error('Response exceeds 8 MiB'))
          else chunks.push(chunk)
        })
        res.on('error', reject)
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        )
      },
    )
    req.on('timeout', () => req.destroy(new Error('Request timed out')))
    req.on('error', reject)
    req.end()
  })
}

const check = (condition, message) => {
  if (!condition) throw new Error(message)
}
export async function checkPublic() {
  let html
  for (const path of ['/', '/?genre=game&period=24h']) {
    const result = await request(path)
    const body = result.body.toString()
    check(
      result.status === 200 &&
        body.includes('nicovideo.jp/watch/') &&
        !body.includes('ランキングデータがありません'),
      `Public ranking is not healthy: ${path} (${result.status})`,
    )
    if (path === '/') html = body
  }
  const admin = await request('/api/admin/ng-list', undefined, 'HEAD')
  check(
    admin.status === 401 &&
      admin.headers['www-authenticate'] &&
      admin.headers['cache-control']?.includes('no-store'),
    'Admin authentication/no-store check failed',
  )
  const api = await request('/api/ranking?genre=game&period=24h')
  check(
    api.status === 200 &&
      JSON.parse(api.body).items?.length > 0 &&
      ['green', 'blue'].includes(api.headers['x-active-worker']),
    'Public ranking API is not healthy',
  )
  return html
}

async function mapLimited(paths, fn) {
  const results = new Array(paths.length)
  let index = 0
  let failed = false
  await Promise.all(
    Array.from({ length: Math.min(4, paths.length) }, async () => {
      for (;;) {
        const i = index++
        if (failed || i >= paths.length) return
        try {
          results[i] = await fn(paths[i])
        } catch (error) {
          failed = true
          throw error
        }
      }
    }),
  )
  return results
}

export async function probeOrigin(origin) {
  const html = await checkPublic()
  const deploymentIds = [...new Set(html.match(/dpl_[a-zA-Z0-9]+/g))]
  check(
    deploymentIds.length === 1,
    'Expected exactly one deployment ID in production HTML',
  )
  const paths = staticPaths(html)
  // Fail on TLS errors with a single request before checking every asset.
  await request(paths[0], origin)
  const assets = await mapLimited(paths, async (path) => {
    const [current, direct] = await Promise.all([
      request(path),
      request(path, origin),
    ])
    return compareAsset(path, current, direct)
  })
  return { deploymentId: deploymentIds[0], assets }
}

export async function verifyBypass(evidence) {
  const html = await checkPublic()
  const deployments = [...new Set(html.match(/dpl_[a-zA-Z0-9]+/g))]
  check(
    deployments.length === 1 && deployments[0] === evidence.deploymentId,
    'Production deployment changed during activation',
  )
  await mapLimited(
    evidence.assets,
    async ({ path, sha256: hash, contentType }) => {
      const response = await request(path)
      compareAsset(path, response, response)
      check(
        response.status === 200 && sha256(response.body) === hash,
        `Public asset changed: ${path}`,
      )
      check(
        response.headers['content-type'] === contentType,
        `Public MIME changed: ${path}`,
      )
      check(
        !response.headers['x-router-version'],
        `Asset still goes through Router: ${path}`,
      )
    },
  )
  // Check cache eligibility with repeated ordinary requests, never purge/warm at scale.
  for (const prefix of PREFIXES) {
    const sample = evidence.assets.find((asset) =>
      asset.path.startsWith(prefix),
    )
    check(sample, `No ${prefix} sample was verified`)
    const repeat = await request(sample.path)
    check(
      repeat.headers['cf-cache-status'] === 'HIT',
      `CDN cache is not hitting for ${prefix}; refusing possible Vercel cost increase`,
    )
  }
}
