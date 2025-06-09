// Cloudflare KV Binding用のヘルパー関数
// Cloudflare Pages Functions環境で動作

export interface Env {
  RANKING_KV: KVNamespace;
}

export async function getFromKV(key: string, env: Env): Promise<ArrayBuffer | null> {
  const value = await env.RANKING_KV.get(key, { type: "arrayBuffer" });
  return value;
}

export async function putToKV(key: string, data: Uint8Array, env: Env): Promise<void> {
  await env.RANKING_KV.put(key, data);
}

export async function deleteFromKV(key: string, env: Env): Promise<void> {
  await env.RANKING_KV.delete(key);
}