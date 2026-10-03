// Runs from the default branch, never from a PR checkout with privileged credentials.
async function resolveContext({ github, context }) {
  const { payload, eventName, repo } = context
  const inputs = payload.inputs || {}
  if (
    eventName === 'issue_comment' &&
    (!/^@claude fix(?:\s|$)/.test(payload.comment?.body || '') ||
      !['OWNER', 'MEMBER', 'COLLABORATOR'].includes(
        payload.comment?.author_association,
      ))
  )
    return null
  const number = Number(
    eventName === 'workflow_run'
      ? payload.workflow_run?.pull_requests?.[0]?.number
      : eventName === 'issue_comment'
        ? payload.issue?.number
        : inputs.pr_number,
  )
  const attempt = Number(inputs.attempt || 1)
  if (
    !Number.isSafeInteger(number) ||
    number <= 0 ||
    !Number.isInteger(attempt) ||
    attempt < 1 ||
    attempt > 10
  )
    return null

  const { data: pr } = await github.rest.pulls.get({
    ...repo,
    pull_number: number,
  })
  if (
    pr.state !== 'open' ||
    pr.merged ||
    pr.head.repo?.full_name !== `${repo.owner}/${repo.repo}`
  )
    return null

  // Do not filter by failure: a newer success, pending run or rerun supersedes an old failure.
  const { data } = await github.rest.actions.listWorkflowRuns({
    ...repo,
    workflow_id: 'unified-ci.yml',
    branch: pr.head.ref,
    head_sha: pr.head.sha,
    per_page: 1,
  })
  const run = data.workflow_runs[0]
  const requestedRun =
    eventName === 'workflow_run' ? payload.workflow_run?.id : inputs.run_id
  if (
    !run ||
    run.head_sha !== pr.head.sha ||
    run.status !== 'completed' ||
    run.conclusion !== 'failure' ||
    (requestedRun && String(run.id) !== String(requestedRun))
  )
    return null

  return {
    pr_number: number,
    run_id: run.id,
    head_sha: pr.head.sha,
    attempt,
    is_dependabot:
      pr.user.login === 'dependabot[bot]' ||
      pr.head.ref.startsWith('dependabot/'),
    pr_author: pr.user.login,
  }
}

module.exports = { resolveContext }
