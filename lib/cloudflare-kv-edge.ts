// Cloudflare KV操作用のヘルパー関数（Edge Runtime用）
import { getRequestContext } from '@cloudflare/next-on-pages';

export async function putToCloudflareKV(key: string, data: Uint8Array): Promise<void> {
  const context = getRequestContext();
  const kv = context.env.RANKING_KV;
  
  if (!kv) {
    throw new Error("KV namespace not bound");
  }
  
  await kv.put(key, data, {
    metadata: { compressed: true }
  });
}

export async function getFromCloudflareKV(key: string): Promise<ArrayBuffer | null> {
  const context = getRequestContext();
  const kv = context.env.RANKING_KV;
  
  if (!kv) {
    throw new Error("KV namespace not bound");
  }
  
  return await kv.get(key, { type: "arrayBuffer" });
}

export async function deleteFromCloudflareKV(key: string): Promise<void> {
  const context = getRequestContext();
  const kv = context.env.RANKING_KV;
  
  if (!kv) {
    throw new Error("KV namespace not bound");
  }
  
  await kv.delete(key);
}