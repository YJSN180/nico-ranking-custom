export default {
  async fetch(request, env) {
    return new Response(JSON.stringify({
      envKeys: Object.keys(env),
      hasWorkerAuthKey: !!env.WORKER_AUTH_KEY,
      workerAuthKeyType: typeof env.WORKER_AUTH_KEY,
      workerAuthKeyLength: env.WORKER_AUTH_KEY ? env.WORKER_AUTH_KEY.length : 0,
      // Check if it's in the context bindings
      bindings: {
        RATE_LIMIT: !!env.RATE_LIMIT,
        RANKING_KV: !!env.RANKING_KV,
        RANKING_DATA: !!env.RANKING_DATA,
        NEXT_APP_URL: env.NEXT_APP_URL,
        USE_PREVIEW: env.USE_PREVIEW,
        account_id: env.account_id
      }
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    })
  }
}