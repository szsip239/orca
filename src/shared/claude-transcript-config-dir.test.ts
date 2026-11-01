import { describe, expect, it } from 'vitest'
import {
  claudeConfigDirCandidate,
  claudeConfigDirFromTranscriptPath
} from './claude-transcript-config-dir'

describe('claudeConfigDirFromTranscriptPath', () => {
  it('reads a POSIX config dir only from an exact session filename', () => {
    expect(
      claudeConfigDirFromTranscriptPath('/accounts/A/projects/-repo/sess-1.jsonl', 'sess-1')
    ).toBe('/accounts/A')
    expect(
      claudeConfigDirFromTranscriptPath('/accounts/A/projects/-repo/not-sess-1.jsonl', 'sess-1')
    ).toBeNull()
    expect(
      claudeConfigDirFromTranscriptPath('accounts/A/projects/-repo/sess-1.jsonl', 'sess-1')
    ).toBeNull()
  })

  it('reads a Windows config dir without using the host path style', () => {
    expect(
      claudeConfigDirFromTranscriptPath('C:\\accounts\\A\\projects\\-repo\\sess-1.jsonl', 'sess-1')
    ).toBe('C:\\accounts\\A')
  })

  it('recognizes a plausible alternate filename but rejects traversal', () => {
    expect(claudeConfigDirCandidate('/accounts/A/projects/-repo/fork.jsonl')).toBe('/accounts/A')
    expect(claudeConfigDirCandidate('/accounts/A/projects/../fork.jsonl')).toBeNull()
    expect(claudeConfigDirCandidate('/accounts/A/projects/-repo/fork.txt')).toBeNull()
    const mixedPath = ['C:', 'accounts', 'A', 'projects', '-repo/../../escape', 'fork.jsonl'].join(
      '\\'
    )
    expect(claudeConfigDirCandidate(mixedPath)).toBeNull()
  })

  it('preserves UNC and drive roots and rejects drive-relative Windows paths', () => {
    expect(
      claudeConfigDirFromTranscriptPath(
        String.raw`\\server\share\account\projects\repo\sess-1.jsonl`,
        'sess-1'
      )
    ).toBe(String.raw`\\server\share\account`)
    expect(
      claudeConfigDirFromTranscriptPath(String.raw`C:\projects\repo\sess-1.jsonl`, 'sess-1')
    ).toBe('C:\\')
    expect(
      claudeConfigDirFromTranscriptPath(String.raw`\account\projects\repo\sess-1.jsonl`, 'sess-1')
    ).toBeNull()
  })
})
