/**
 * Claude writes `<config>/projects/<encoded-cwd>/<sessionId>.jsonl`.
 * String parsing only, so the renderer can use it without Node's path module.
 * Separators are taken from the transcript, not from the machine running the check.
 */
export function claudeConfigDirFromTranscriptPath(
  transcriptPath: string | undefined,
  sessionId: string | undefined
): string | null {
  const transcript = transcriptPath?.trim()
  const id = sessionId?.trim()
  if (!transcript || !id) {
    return null
  }
  const filename = transcript.split(/[\\/]/).at(-1)
  return filename === `${id}.jsonl` ? claudeConfigDirCandidate(transcript) : null
}

/** Main must verify the session inside a candidate whose filename is not the session id. */
export function claudeConfigDirCandidate(transcriptPath: string | undefined): string | null {
  const transcript = transcriptPath?.trim()
  if (!transcript || transcript.includes('\0')) {
    return null
  }
  const slash = transcript.includes('\\') ? '\\' : '/'
  const parts = transcript.split(/[\\/]/)
  const filename = parts.at(-1)
  if (
    !filename ||
    !filename.endsWith('.jsonl') ||
    filename === '.jsonl' ||
    parts.length < 4 ||
    parts.some((part) => part === '.' || part === '..')
  ) {
    return null
  }
  const projects = parts.at(-3)
  if (projects !== 'projects') {
    return null
  }
  const rooted =
    slash === '/'
      ? parts[0] === ''
      : /^[A-Za-z]:$/.test(parts[0] ?? '') ||
        (parts[0] === '' && parts[1] === '' && !!parts[2] && !!parts[3])
  if (!rooted) {
    return null
  }
  const config = parts.slice(0, -3)
  if (config.length === 0 || (config.length === 1 && config[0] === '')) {
    return null
  }
  return config.length === 1 && /^[A-Za-z]:$/.test(config[0])
    ? `${config[0]}${slash}`
    : config.join(slash)
}
