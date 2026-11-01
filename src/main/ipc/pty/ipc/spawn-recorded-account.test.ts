import { homedir, tmpdir } from 'node:os'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  prepareStrictClaudeRestart,
  recordedSessionRestartRefusal,
  strictCodexSessionRestartRefusal
} from './spawn-recorded-account'

const managedAccounts = vi.hoisted((): { ids: string[] } => ({ ids: [] }))
vi.mock('../../../managed-data-accounts/service', () => ({
  getManagedDataAccountService: () => ({
    list: () => ({
      accounts: managedAccounts.ids.map((id) => ({ id })),
      activeAccountId: managedAccounts.ids[0] ?? null
    }),
    environmentForAccount: (_provider: string, id: string) => {
      if (!managedAccounts.ids.includes(id)) {
        throw new Error('removed')
      }
      return { XDG_DATA_HOME: `/accounts/${id}/data` }
    },
    launchEnvironment: () => ({})
  })
}))

describe('recordedSessionRestartRefusal', () => {
  it('proves an alternate Claude transcript filename before pinning its account', async () => {
    const root = await mkdtemp(join(tmpdir(), 'claude-restart-proof-'))
    try {
      const account = join(root, 'account')
      const directory = join(account, 'projects', '-repo')
      await mkdir(directory, { recursive: true })
      const transcriptPath = join(directory, 'forked-name.jsonl')
      await writeFile(transcriptPath, `${JSON.stringify({ sessionId: 'sess-1', type: 'user' })}\n`)
      const env: Record<string, string> = {}
      const args = {
        resumeOnSelectedAccount: false as const,
        launchAgent: 'claude',
        env,
        resumeProviderSession: { key: 'session_id' as const, id: 'sess-1', transcriptPath }
      }
      expect(await prepareStrictClaudeRestart(args)).toBeNull()
      expect(args.env.CLAUDE_CONFIG_DIR).toBe(account)

      await writeFile(
        transcriptPath,
        `${JSON.stringify({ sessionId: 'different', type: 'user' })}\n`
      )
      const mismatched = { ...args, env: {} }
      expect(await prepareStrictClaudeRestart(mismatched)).toMatch(/could not prove/)
      expect(mismatched.env).toEqual({})
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
  it('lets an account-switch restart keep the selected account', () => {
    expect(
      recordedSessionRestartRefusal({
        launchAgent: 'codex',
        env: {}
      })
    ).toBeNull()
  })

  it('does not treat a missing Codex home as unknown, and skips an unproven Claude home', async () => {
    expect(
      recordedSessionRestartRefusal({
        resumeOnSelectedAccount: false,
        launchAgent: 'codex',
        env: {}
      })
    ).toBeNull()
    expect(
      await prepareStrictClaudeRestart({
        resumeOnSelectedAccount: false,
        launchAgent: 'claude',
        env: {}
      })
    ).toMatch(/could not prove the original Claude account/)
  })

  it('names the OpenCode or Devin account before stop, or refuses when profiles make it ambiguous', () => {
    const account = '0f3c2a8e-5d1b-4c7e-9a64-2b8f1e6d3c90'
    const strict = (launchAgent: string, extra: Record<string, unknown> = {}) => {
      const args = { resumeOnSelectedAccount: false as const, launchAgent, env: {}, ...extra }
      return { refusal: recordedSessionRestartRefusal(args), env: args.env }
    }
    managedAccounts.ids = []
    expect(strict('opencode').refusal).toBeNull()
    managedAccounts.ids = [account]
    expect(strict('opencode').refusal).toMatch(/could not prove the original opencode account/)
    expect(strict('devin').refusal).toMatch(/could not prove the original devin account/)
    expect(strict('devin', { env: { ORCA_DATA_ACCOUNT_ID: 'gone' } }).refusal).toMatch(
      /requires the recorded account/
    )
    expect(
      strict('opencode', {
        resumeProviderSession: {
          key: 'session_id',
          id: 'ses_1',
          transcriptPath: `/u/managed-data-accounts/opencode/${account}/data/opencode/opencode.db#ses_1`
        }
      })
    ).toEqual({ refusal: null, env: { ORCA_DATA_ACCOUNT_ID: account } })
  })

  it('refuses before stop when Codex preparation would start a fresh chat', async () => {
    const prepare = vi.fn(async () => ({ outcome: 'fresh' as const, claimedCodexProvenance: true }))
    await expect(
      strictCodexSessionRestartRefusal(prepare, {
        resumeOnSelectedAccount: false,
        launchAgent: 'codex',
        command: "codex resume 'sess-1'",
        env: { CODEX_HOME: '/accounts/work' },
        resumeProviderSession: { key: 'session_id', id: 'sess-1' }
      })
    ).resolves.toMatch(/new Codex chat|could not verify the originating Codex session/)
    expect(prepare).toHaveBeenCalled()
  })

  it('pins a managed Claude home from the session transcript when launch env is empty', async () => {
    const env: Record<string, string> = { ORCA_PANE_KEY: 'pane' }
    const args = {
      resumeOnSelectedAccount: false as const,
      launchAgent: 'claude' as const,
      env,
      resumeProviderSession: {
        key: 'session_id' as const,
        id: 'sess-1',
        transcriptPath: '/accounts/A/projects/-repo/sess-1.jsonl'
      }
    }
    expect(await prepareStrictClaudeRestart(args)).toBeNull()
    expect(args.env.CLAUDE_CONFIG_DIR).toBe('/accounts/A')
  })

  it('leaves the default Claude home unpinned so the CLI keeps its Keychain identity', async () => {
    vi.stubEnv('CLAUDE_CONFIG_DIR', '')
    const strict = async (transcriptPath: string, platform: NodeJS.Platform) => {
      const env: Record<string, string> = {}
      const args = {
        resumeOnSelectedAccount: false as const,
        launchAgent: 'claude' as const,
        env,
        resumeProviderSession: { key: 'session_id' as const, id: 'sess-1', transcriptPath }
      }
      expect(await prepareStrictClaudeRestart(args, platform)).toBeNull()
      return args.env.CLAUDE_CONFIG_DIR
    }
    expect(
      await strict(
        join(homedir(), '.claude', 'projects', '-repo', 'sess-1.jsonl'),
        process.platform
      )
    ).toBeUndefined()
    expect(await strict('/home/me/.claude/projects/-repo/sess-1.jsonl', 'win32')).toBeUndefined()
    expect(await strict('/home/me/profiles/work/projects/-repo/sess-1.jsonl', 'win32')).toBe(
      '/home/me/profiles/work'
    )
    vi.unstubAllEnvs()
  })

  it('keeps an account-switch restart on the selected-account path', async () => {
    const prepare = vi.fn(async () => ({ outcome: 'fresh' as const, claimedCodexProvenance: true }))
    await expect(
      strictCodexSessionRestartRefusal(prepare, {
        launchAgent: 'codex',
        env: { CODEX_HOME: '/accounts/work' },
        resumeProviderSession: { key: 'session_id', id: 'sess-1' }
      })
    ).resolves.toBeNull()
    expect(prepare).not.toHaveBeenCalled()
  })
})
