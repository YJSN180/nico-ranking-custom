// Cloudflare KV操作用のヘルパー関数（Cloudflare Pages用）
// process.envを使わず、環境変数を直接受け取る

interface CloudflareEnv {
  CF_ACCOUNT_ID: string;
  CF_NAMESPACE_ID: string;
  CF_API_TOKEN: string;
}

export async function putToCloudflareKV(key: string, data: Uint8Array, env: CloudflareEnv): Promise<void> {
  const { CF_ACCOUNT_ID, CF_NAMESPACE_ID, CF_API_TOKEN } = env;
  
  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    throw new Error("Cloudflare credentials not configured");
  }
  
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${key}`;
  
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${CF_API_TOKEN}`,
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
  const { CF_ACCOUNT_ID, CF_NAMESPACE_ID, CF_API_TOKEN } = env;
  
  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    throw new Error("Cloudflare credentials not configured");
  }
  
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${key}`;
  
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${CF_API_TOKEN}`,
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
  const { CF_ACCOUNT_ID, CF_NAMESPACE_ID, CF_API_TOKEN } = env;
  
  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    throw new Error("Cloudflare credentials not configured");
  }
  
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${key}`;
  
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${CF_API_TOKEN}`,
    },
  });
  
  if (!response.ok && response.status !== 404) {
    const errorText = await response.text();
    throw new Error(`Failed to delete from Cloudflare KV: ${response.status} - ${errorText}`);
  }
}