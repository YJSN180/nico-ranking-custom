export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    
    // デバッグ情報を返す
    return new Response(
      JSON.stringify({
        message: "Worker is running",
        url: url.toString(),
        pathname: url.pathname,
        hostname: url.hostname,
        headers: Object.fromEntries(request.headers.entries())
      }, null, 2),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
  }
}