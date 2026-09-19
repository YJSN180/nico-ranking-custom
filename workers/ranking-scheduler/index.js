import { Sentry, createWorkerSentryOptions } from '../sentry.js'
import { githubClient } from './github.js'
import { dispatchRanking } from './scheduler.js'
import { inspectPipeline } from './health.js'

const handler = {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      Sentry.withMonitor(
        'ranking-pipeline-watchdog',
        async () => {
          // Health read failures must not prevent attempts to start a fresh collection.
          let health
          let healthError
          try {
            health = await inspectPipeline(env)
          } catch (error) {
            healthError = error
          }
          if (health?.changed) {
            if (health.state.signature !== health.previousSignature)
              Sentry.captureMessage(
                health.state.signature
                  ? `Ranking pipeline: ${health.state.signature}`
                  : 'Ranking pipeline recovered',
                health.state.signature ? 'error' : 'info',
              )
            await env.R2_BUCKET.put(
              'pipeline/health.json',
              JSON.stringify(health.state),
            )
          }
          const result = await dispatchRanking(
            env,
            env.DISPATCH_ENABLED === 'true' ? await githubClient(env) : null,
          )
          console.log(
            JSON.stringify({
              ...result,
              health:
                health?.state.signature ||
                (healthError ? 'unavailable' : 'healthy'),
            }),
          )
          if (env.DEADMAN_URL) {
            const url = new URL(env.DEADMAN_URL)
            if (url.protocol !== 'https:')
              throw new Error('Deadman endpoint must use HTTPS')
            const response = await fetch(url, {
              method: 'POST',
              signal: AbortSignal.timeout(10_000),
            })
            if (!response.ok) throw new Error('Deadman heartbeat failed')
          }
          if (healthError) throw healthError
        },
        {
          schedule: { type: 'crontab', value: '*/5 * * * *' },
          checkinMargin: 5,
          maxRuntime: 4,
          timezone: 'UTC',
        },
      ),
    )
  },
  fetch() {
    return new Response('Not found', { status: 404 })
  },
}
export default Sentry.withSentry(
  (env) => createWorkerSentryOptions(env),
  handler,
)
