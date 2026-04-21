export function hasWorkerDebugAccess(request: Request, workerAuthKey?: string) {
  if (!workerAuthKey) return false

  const authHeader = request.headers.get('Authorization')
  if (authHeader === `Bearer ${workerAuthKey}`) {
    return true
  }

  const workerHeader = request.headers.get('X-Worker-Auth')
  return workerHeader === workerAuthKey
}
