import { action } from "convex/server";
import { v } from "convex/values";

// Write compressed data to Cloudflare KV
export const writeToCloudflareKV = action({
  args: {
    data: v.any(),
  },
  handler: async (ctx: any, args: any) => {
    // Get Cloudflare KV credentials from environment
    const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
    const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
    const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN;

    if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
      throw new Error("Cloudflare KV credentials not configured");
    }

    // Compress the data
    const pako = await import('pako');
    const jsonString = JSON.stringify(args.data);
    const compressed = pako.gzip(jsonString);

    // Cloudflare KV API endpoint
    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/ranking-data-bundle`;

    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${CF_API_TOKEN}`,
          "Content-Type": "application/octet-stream",
        },
        body: compressed,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Cloudflare KV write failed: ${response.status} - ${error}`);
      }

      // Also set metadata
      const metadataUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/metadata/ranking-data-bundle`;
      
      await fetch(metadataUrl, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${CF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          compressed: true,
          version: 1,
          updatedAt: new Date().toISOString(),
          size: compressed.length,
        }),
      });

      return {
        success: true,
        size: compressed.length,
        compressionRatio: compressed.length / jsonString.length,
      };
    } catch (error) {
      console.error("Failed to write to Cloudflare KV:", error);
      throw error;
    }
  },
});