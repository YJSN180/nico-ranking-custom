import { resolve, dirname } from 'node:path'
import { readFileSync } from 'node:fs'
const targets = {
  'nico-ranking-api-gateway': ['workers/smart-router-20250706.ts', 'wrangler.toml'],
  'nico-ranking-api-gateway-green': ['workers/api-gateway-green-20250726.ts', 'workers/wrangler-green.toml'],
  'nico-ranking-blue-20250706': ['workers/api-gateway-blue-20250706.ts', 'wrangler-blue-20250706.toml'],
}
const [name, file, config] = process.argv.slice(2)
const expected = targets[name]
if (!expected || file !== expected[0] || config !== expected[1]) {
  console.error('Worker, source and canonical config must match a supported target')
  process.exit(1)
}
const text = readFileSync(resolve(config), 'utf8')
const configuredName = /^name\s*=\s*"([^"]+)"/m.exec(text)?.[1]
const configuredMain = /^main\s*=\s*"([^"]+)"/m.exec(text)?.[1]
if (configuredName !== name || !configuredMain || resolve(dirname(config), configuredMain) !== resolve(file)) {
  console.error('Config worker name does not match target')
  process.exit(1)
}
console.log(`Verified deployment target: ${name}`)
