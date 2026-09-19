import { createPrivateKey, sign } from 'node:crypto'

export const REPOSITORY = 'YJSN180/nico-ranking-custom'
export const WORKFLOW = 'update-ranking-parallel.yml'

export async function githubClient(env) {
  if (
    !env.GITHUB_APP_ID ||
    !env.GITHUB_INSTALLATION_ID ||
    !env.GITHUB_APP_PRIVATE_KEY
  )
    throw new Error('Missing GitHub App configuration')
  const now = Math.floor(Date.now() / 1000)
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  const input = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iat: now - 60, exp: now + 540, iss: env.GITHUB_APP_ID })}`
  const jwt = `${input}.${sign('RSA-SHA256', Buffer.from(input), createPrivateKey(env.GITHUB_APP_PRIVATE_KEY)).toString('base64url')}`
  const request = async (path, token, method = 'GET', body) => {
    const response = await fetch(`https://api.github.com/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'nico-ranking-scheduler',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok)
      throw new Error(`GitHub request failed: ${response.status}`)
    return response.status === 204 ? null : response.json()
  }
  const installation = await request(
    `app/installations/${env.GITHUB_INSTALLATION_ID}/access_tokens`,
    jwt,
    'POST',
    {
      repositories: ['nico-ranking-custom'],
      permissions: { actions: 'write', contents: 'read' },
    },
  )
  return (path, method = 'GET', body) =>
    request(`repos/${REPOSITORY}/${path}`, installation.token, method, body)
}
