// Cloudflare KV操作用のヘルパー関数

export async function putToCloudflareKV(key: string, data: Uint8Array): Promise<void> {
  const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
  const CF_NAMESPACE_ID = process.env.CF_NAMESPACE_ID;
  const CF_API_TOKEN = process.env.CF_API_TOKEN;
  
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

export async function getFromCloudflareKV(key: string): Promise<ArrayBuffer | null> {
  const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
  const CF_NAMESPACE_ID = process.env.CF_NAMESPACE_ID;
  const CF_API_TOKEN = process.env.CF_API_TOKEN;
  
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

export async function deleteFromCloudflareKV(key: string): Promise<void> {
  const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
  const CF_NAMESPACE_ID = process.env.CF_NAMESPACE_ID;
  const CF_API_TOKEN = process.env.CF_API_TOKEN;
  
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