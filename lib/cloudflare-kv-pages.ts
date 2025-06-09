// Cloudflare KV操作用のヘルパー関数（Cloudflare Pages用）
// process.envを使わず、環境変数を直接受け取る

interface CloudflareEnv {
  CF_ACC: string;
  CF_NS: string;
  CF_KV_TOKEN_READ?: string;
  CF_KV_TOKEN_WRITE?: string;
}

export async function putToCloudflareKV(key: string, data: Uint8Array, env: CloudflareEnv): Promise<void> {
  const { CF_ACC, CF_NS, CF_KV_TOKEN_WRITE } = env;
  
  if (!CF_ACC || !CF_NS || !CF_KV_TOKEN_WRITE) {
    throw new Error("Cloudflare credentials not configured");
  }
  
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACC}/storage/kv/namespaces/${CF_NS}/values/${key}`;
  
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${CF_KV_TOKEN_WRITE}`,
      "Content-Encoding": "gzip",
      "Content-Type": "application/json",
    },
    body: data,
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to save to Cloudflare KV: ${response.status} - ${errorText}`);
  }
}

export async function getFromCloudflareKV(key: string, env: CloudflareEnv): Promise<ArrayBuffer | null> {
  const { CF_ACC, CF_NS, CF_KV_TOKEN_READ } = env;
  
  if (!CF_ACC || !CF_NS || !CF_KV_TOKEN_READ) {
    throw new Error("Cloudflare credentials not configured");
  }
  
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACC}/storage/kv/namespaces/${CF_NS}/values/${key}`;
  
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${CF_KV_TOKEN_READ}`,
    },
  });
  
  if (response.status === 404) {
    return null;
  }
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get from Cloudflare KV: ${response.status} - ${errorText}`);
  }
  
  return response.arrayBuffer();
}

export async function deleteFromCloudflareKV(key: string, env: CloudflareEnv): Promise<void> {
  const { CF_ACC, CF_NS, CF_KV_TOKEN_WRITE } = env;
  
  if (!CF_ACC || !CF_NS || !CF_KV_TOKEN_WRITE) {
    throw new Error("Cloudflare credentials not configured");
  }
  
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACC}/storage/kv/namespaces/${CF_NS}/values/${key}`;
  
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${CF_KV_TOKEN_WRITE}`,
    },
  });
  
  if (!response.ok && response.status !== 404) {
    const errorText = await response.text();
    throw new Error(`Failed to delete from Cloudflare KV: ${response.status} - ${errorText}`);
  }
}