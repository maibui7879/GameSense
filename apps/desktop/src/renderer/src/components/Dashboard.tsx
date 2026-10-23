import { useEffect, useRef, useState } from 'react'
import type { GameSession } from '@gamesense/contracts'

interface AppInfo {
  name: string
  version: string
  platform: string
}

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', active: true },
  { id: 'sessions', label: 'Sessions', active: false },
  { id: 'analyzer', label: 'Analyzer', active: false },
  { id: 'advisor', label: 'Advisor', active: false },
  { id: 'settings', label: 'Settings', active: false }
] as const

type DashboardView = 'overview' | 'sessions'

function formatDuration(startedAt: string, endedAt: string | null, now: number): string {
  const start = new Date(startedAt).getTime()
  const end = endedAt ? new Date(endedAt).getTime() : now

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return '—'
  }

  const totalMinutes = Math.max(0, Math.floor((end - start) / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

function getGameName(gameId: string): string {
  if (gameId === 'stella-sora') return 'Stella Sora'
  return gameId
}

export function Dashboard(): React.JSX.Element {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [session, setSession] = useState<GameSession | null>(null)
  const [sessions, setSessions] = useState<GameSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [activeView, setActiveView] = useState<DashboardView>('overview')
  const [error, setError] = useState<string | null>(null)
  const [monitorError, setMonitorError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // Tránh kết quả truy vấn ban đầu ghi đè sự kiện mới hơn từ Main Process.
  const receivedSessionEvent = useRef(false)

  useEffect(() => {
    let mounted = true

    const unsubscribeSession = window.gamesense.onSessionChange((nextSession) => {
      receivedSessionEvent.current = true

      if (mounted) {
        setSession(nextSession)
        setMonitorError(null)
      }

      window.gamesense
        .getSessionHistory()
        .then((history) => {
          if (mounted) setSessions(history)
        })
        .catch(() => {
          if (mounted) setMonitorError('Không thể tải lịch sử phiên game.')
        })
    })

    const unsubscribeError = window.gamesense.onError((message) => {
      if (mounted) {
        setMonitorError(message)
      }
    })

    window.gamesense
      .getAppInfo()
      .then((info) => {
        if (mounted) setAppInfo(info)
      })
      .catch(() => {
        if (mounted) {
          setError('Không thể kết nối với desktop service.')
        }
      })

    window.gamesense
      .getSessionStatus()
      .then((initialSession) => {
        if (mounted && !receivedSessionEvent.current) {
          setSession(initialSession)
        }
      })
      .catch(() => {
        if (mounted) {
          setMonitorError('Không thể lấy trạng thái phiên game.')
        }
      })

    window.gamesense
      .getSessionHistory()
      .then((history) => {
        if (mounted) setSessions(history)
      })
      .catch(() => {
        if (mounted) {
          setMonitorError('Không thể tải lịch sử phiên game.')
        }
      })
      .finally(() => {
        if (mounted) setSessionsLoading(false)
      })

    const clock = window.setInterval(() => {
      setNow(Date.now())
    }, 15_000)

    return () => {
      mounted = false
      window.clearInterval(clock)
      unsubscribeSession()
      unsubscribeError()
    }
  }, [])

  const isRunning = session?.status === 'running'
  const gameName = session ? getGameName(session.gameId) : 'none'

  const playtime =
    session !== null
      ? formatDuration(session.startedAt, session.endedAt, now)
      : '0h 00m'

  const detectionLabel = isRunning
    ? 'Stella Sora đang chạy'
    : session?.status === 'stopped'
      ? 'Phiên chơi đã kết thúc'
      : 'Chưa phát hiện game'

  const detectionDescription = isRunning
    ? `Đang theo dõi phiên chơi bắt đầu lúc ${new Date(session.startedAt).toLocaleTimeString()}.`
    : session?.status === 'stopped'
      ? `Phiên chơi gần nhất kết thúc lúc ${
          session.endedAt
            ? new Date(session.endedAt).toLocaleTimeString()
            : 'không xác định'
        }.`
      : 'Collector đang chờ phát hiện tiến trình Stella Sora.'

  return (
    <div className="flex min-h-screen bg-[#0b0e14] text-slate-100">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-white/10 bg-white/[0.02]">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-lg font-semibold tracking-wide">GameSense</p>
          <p className="mt-1 text-xs text-slate-500">Desktop Assistant</p>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={item.id !== 'overview' && item.id !== 'sessions'}
              onClick={() => {
                if (item.id === 'overview' || item.id === 'sessions') {
                  setActiveView(item.id)
                }
              }}
              className={
                'w-full rounded-lg px-4 py-2.5 text-left text-sm transition-colors ' +
                (activeView === item.id
                  ? 'bg-indigo-500/15 font-medium text-indigo-300'
                  : item.id === 'overview' || item.id === 'sessions'
                    ? 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                    : 'cursor-not-allowed text-slate-600')
              }
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="border-t border-white/10 px-6 py-4 text-xs text-slate-500">
          Phase 1 · Foundation
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-white/10 px-8 py-5">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500">
              GameSense / {activeView === 'sessions' ? 'Sessions' : 'Overview'}
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Gaming Dashboard</h1>
          </div>

          <div className="text-right text-sm">
            <div className="flex items-center justify-end gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  error ? 'bg-red-400' : 'bg-emerald-400'
                }`}
              />
              <span className="text-slate-300">
                {error ? 'Desktop service unavailable' : 'Desktop service online'}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Tracked game: {gameName}
            </p>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 space-y-6 overflow-y-auto p-8">
          {activeView === 'sessions' ? (
            <SessionsPanel
              sessions={sessions}
              loading={sessionsLoading}
              onRefresh={() => {
                setSessionsLoading(true)
                window.gamesense
                  .getSessionHistory()
                  .then(setSessions)
                  .finally(() => setSessionsLoading(false))
              }}
            />
          ) : (
            <>
          {/* Desktop Runtime */}
          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
            <h2 className="text-sm font-medium uppercase tracking-wider text-slate-400">
              Desktop Runtime
            </h2>

            {error ? (
              <p className="mt-3 text-sm text-red-400">{error}</p>
            ) : appInfo ? (
              <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-slate-500">Application</p>
                  <p className="mt-1 font-medium text-slate-200">{appInfo.name}</p>
                </div>
                <div>
                  <p className="text-slate-500">Version</p>
                  <p className="mt-1 font-medium text-slate-200">{appInfo.version}</p>
                </div>
                <div>
                  <p className="text-slate-500">Platform</p>
                  <p className="mt-1 font-medium text-slate-200">{appInfo.platform}</p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-400">
                Connecting to desktop service...
              </p>
            )}
          </section>

          {/* Stat cards */}
          <section className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Playtime
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-100">
                {playtime}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {isRunning ? 'Current session' : session ? 'Last session' : 'No sessions yet'}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Sessions
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-100">{sessions.length}</p>
              <p className="mt-2 text-xs text-slate-500">
                Saved game sessions
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Insights
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-100">—</p>
              <p className="mt-2 text-xs text-slate-500">
                Analyzer not started
              </p>
            </div>
          </section>

          {/* Status + Recent activity */}
          <section className="grid grid-cols-2 gap-4">
            {/* Status */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="text-sm font-medium uppercase tracking-wider text-slate-400">
                Detection Status
              </h2>

              <div className="mt-4 flex items-start gap-3">
                <span
                  className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                    isRunning
                      ? 'bg-emerald-400'
                      : session?.status === 'stopped'
                        ? 'bg-slate-400'
                        : monitorError
                          ? 'bg-red-400'
                          : 'bg-amber-400'
                  }`}
                />

                <div>
                  <p className="text-sm font-medium text-slate-200">
                    {detectionLabel}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {detectionDescription}
                  </p>

                  {monitorError && (
                    <p className="mt-2 text-xs text-red-400">{monitorError}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Recent activity */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="text-sm font-medium uppercase tracking-wider text-slate-400">
                Recent Activity
              </h2>

              <ul className="mt-4 space-y-3">
                <li className="flex items-baseline gap-3 text-sm">
                  <span className="font-mono text-xs text-slate-600">—</span>
                  <span className="text-slate-300">
                    {isRunning
                      ? `Detected ${gameName}`
                      : session?.status === 'stopped'
                        ? `${gameName} session ended`
                        : 'Waiting for Stella Sora'}
                  </span>
                </li>
                <li className="flex items-baseline gap-3 text-sm">
                  <span className="font-mono text-xs text-slate-600">—</span>
                  <span className="text-slate-300">
                    Process monitor runs every 2 seconds
                  </span>
                </li>
                <li className="flex items-baseline gap-3 text-sm">
                  <span className="font-mono text-xs text-slate-600">—</span>
                  <span className="text-slate-300">
                    {monitorError ? 'Process scan reported an error' : 'Desktop IPC bridge ready'}
                  </span>
                </li>
              </ul>
            </div>
          </section>
            </>
          )}
        </main>
      </div>
    </div>
  )
}

interface SessionsPanelProps {
  sessions: GameSession[]
  loading: boolean
  onRefresh: () => void
}

function SessionsPanel({
  sessions,
  loading,
  onRefresh,
}: SessionsPanelProps): React.JSX.Element {
  const now = Date.now()

  return (
    <section className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">
            GameSense / Sessions
          </p>
          <h2 className="mt-1 text-2xl font-semibold">Session History</h2>
          <p className="mt-2 text-sm text-slate-500">
            Lịch sử các phiên game được lưu trên thiết bị này.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 disabled:cursor-wait disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Đang tải lịch sử phiên...</p>
        ) : sessions.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Chưa có phiên game nào.</p>
        ) : (
          <div className="divide-y divide-white/10">
            {sessions.map((item) => {
              const isRunning = item.status === 'running'

              return (
                <div
                  key={item.id}
                  className="grid gap-4 px-6 py-5 md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-center"
                >
                  <div>
                    <p className="font-medium text-slate-200">
                      {getGameName(item.gameId)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      PID {item.pid} · Bắt đầu {new Date(item.startedAt).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500">
                      Duration
                    </p>
                    <p className="mt-1 text-sm text-slate-300">
                      {formatDuration(item.startedAt, item.endedAt, now)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500">
                      Ended
                    </p>
                    <p className="mt-1 text-sm text-slate-300">
                      {item.endedAt
                        ? new Date(item.endedAt).toLocaleString()
                        : 'In progress'}
                    </p>
                  </div>
                  <span
                    className={`w-fit rounded-full px-2.5 py-1 text-xs ${
                      isRunning
                        ? 'bg-emerald-400/10 text-emerald-300'
                        : 'bg-slate-400/10 text-slate-400'
                    }`}
                  >
                    {isRunning ? 'Running' : 'Stopped'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
