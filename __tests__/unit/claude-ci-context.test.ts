// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, it, expect, vi } from 'vitest'

const { resolveContext } = createRequire(import.meta.url)(
  '../../.github/scripts/claude-ci-context.cjs',
)

function fixture() {
  const pr = {
    state: 'open',
    merged: false,
    user: { login: 'owner' },
    head: {
      ref: 'fix/example',
      sha: 'current',
      repo: { full_name: 'owner/repo' },
    },
  }
  const run = {
    id: 100,
    head_sha: 'current',
    status: 'completed',
    conclusion: 'failure',
  }
  const github = {
    rest: {
      pulls: { get: vi.fn(async () => ({ data: pr })) },
      actions: {
        listWorkflowRuns: vi.fn(async () => ({
          data: { workflow_runs: [run] },
        })),
      },
    },
  }
  const context = {
    repo: { owner: 'owner', repo: 'repo' },
    eventName: 'issue_comment',
    payload: {
      issue: { number: 543 },
      comment: { body: '@claude fix', author_association: 'OWNER' },
      inputs: {} as Record<string, string>,
      workflow_run: { id: 100, pull_requests: [{ number: 543 }] },
    },
  }
  return { pr, run, github, context }
}

describe('CI repair eligibility', () => {
  it('accepts an explicit maintainer request for the current failed run', async () => {
    const f = fixture()
    expect(await resolveContext(f)).toMatchObject({
      pr_number: 543,
      run_id: 100,
      head_sha: 'current',
    })
    expect(f.github.rest.actions.listWorkflowRuns).toHaveBeenCalledWith(
      expect.objectContaining({ head_sha: 'current', per_page: 1 }),
    )
  })
  it('does not recursively accept its own generated repair comment', async () => {
    const f = fixture()
    f.context.payload.comment.body =
      '@claude\n\n## CI/CD 自動修復依頼 (試行 1/10)\nPlease fix the failure'
    expect(await resolveContext(f)).toBeNull()
    expect(f.github.rest.pulls.get).not.toHaveBeenCalled()
  })
  it.each(['CONTRIBUTOR', 'NONE'])(
    'rejects untrusted %s comments',
    async (association) => {
      const f = fixture()
      f.context.payload.comment.author_association = association
      expect(await resolveContext(f)).toBeNull()
    },
  )
  it('ignores merged PRs even when an old CI failure exists', async () => {
    const f = fixture()
    f.pr.state = 'closed'
    f.pr.merged = true
    expect(await resolveContext(f)).toBeNull()
    expect(f.github.rest.actions.listWorkflowRuns).not.toHaveBeenCalled()
  })
  it.each(['success', 'cancelled'])(
    'does not repair an older failure after %s',
    async (conclusion) => {
      const f = fixture()
      f.run.conclusion = conclusion
      expect(await resolveContext(f)).toBeNull()
    },
  )
  it('waits for a newer CI run rather than repairing during it', async () => {
    const f = fixture()
    f.run.status = 'in_progress'
    expect(await resolveContext(f)).toBeNull()
  })
  it('rejects a result for an outdated commit', async () => {
    const f = fixture()
    f.run.head_sha = 'old'
    expect(await resolveContext(f)).toBeNull()
  })
  it('rejects stale workflow_run notifications', async () => {
    const f = fixture()
    f.context.eventName = 'workflow_run'
    f.context.payload.workflow_run.id = 99
    expect(await resolveContext(f)).toBeNull()
  })
  it('does not repair an external fork with privileged credentials', async () => {
    const f = fixture()
    f.pr.head.repo.full_name = 'external/repo'
    expect(await resolveContext(f)).toBeNull()
  })
  it.each(['0', '11', 'NaN'])('rejects invalid attempt %s', async (attempt) => {
    const f = fixture()
    f.context.eventName = 'workflow_dispatch'
    f.context.payload.inputs = { pr_number: '543', attempt }
    expect(await resolveContext(f)).toBeNull()
  })
})
