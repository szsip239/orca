// @vitest-environment happy-dom
import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'

const report = vi.hoisted(() => ({ outcomes: [], running: false }))

vi.mock('@/lib/agent-session-restart-service', () => ({
  collectAgentSessionRestartPlanFromState: (state: {
    paneForegroundAgentByPaneKey: Record<string, { shellForeground: boolean }>
    activeWorkspaceExecutionHostId: string | null
  }) => ({
    rows: [],
    targets: [],
    restartAllCount:
      state.paneForegroundAgentByPaneKey.fixture?.shellForeground ||
      state.activeWorkspaceExecutionHostId === 'ssh:remote'
        ? 0
        : 1
  }),
  getAgentSessionRestartController: () => ({
    subscribe: () => () => {},
    getSnapshot: () => report,
    dismiss: () => {},
    request: async () => {}
  })
}))
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({
    children,
    disabled,
    'data-testid': id
  }: {
    children: ReactNode
    disabled?: boolean
    'data-testid'?: string
  }) => (
    <button type="button" disabled={disabled} data-testid={id}>
      {children}
    </button>
  )
}))

import { AgentSessionRestartMenu } from './AgentSessionRestartMenu'

it('updates restart availability when foreground and host ownership change', async () => {
  const previous = useAppStore.getState()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    useAppStore.setState({
      paneForegroundAgentByPaneKey: { fixture: { agent: null, shellForeground: false } },
      activeWorkspaceExecutionHostId: null
    })
    await act(async () => root.render(<AgentSessionRestartMenu />))
    const all = () =>
      container.querySelector<HTMLButtonElement>('[data-testid="agent-session-restart-all"]')
    expect(all()?.disabled).toBe(false)
    await act(async () => {
      useAppStore.setState({
        paneForegroundAgentByPaneKey: { fixture: { agent: null, shellForeground: true } }
      })
    })
    expect(all()?.disabled).toBe(true)
    await act(async () => {
      useAppStore.setState({
        paneForegroundAgentByPaneKey: { fixture: { agent: null, shellForeground: false } },
        activeWorkspaceExecutionHostId: 'ssh:remote'
      })
    })
    expect(all()?.disabled).toBe(true)
  } finally {
    await act(async () => root.unmount())
    useAppStore.setState({
      paneForegroundAgentByPaneKey: previous.paneForegroundAgentByPaneKey,
      activeWorkspaceExecutionHostId: previous.activeWorkspaceExecutionHostId
    })
    container.remove()
  }
})
