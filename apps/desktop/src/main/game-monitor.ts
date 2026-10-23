import {
  SessionMonitor,
  STELLA_SORA,
  WindowsSystemMetricsCollector,
} from '@gamesense/collector'
import type { GameSession } from '@gamesense/contracts'
import { GameSenseDatabase } from '@gamesense/database'

export type GameMonitorEvent =
  | {
      type: 'session-change'
      session: GameSession
    }
  | {
      type: 'error'
      message: string
    }

type MonitorListener = (event: GameMonitorEvent) => void

let monitor: SessionMonitor | null = null
let database: GameSenseDatabase | null = null

const listeners = new Set<MonitorListener>()

function emit(event: GameMonitorEvent): void {
  for (const listener of listeners) {
    try {
      listener(event)
    } catch (error) {
      console.error('[GameSense] Monitor listener failed:', error)
    }
  }
}

export function startGameMonitor(persistence: GameSenseDatabase): void {
  if (monitor !== null) return

  database = persistence

  const restoredSession = database.getCurrentSession()

  monitor = new SessionMonitor({
    definitions: [STELLA_SORA],
    initialSession: restoredSession,
    metricsCollector: new WindowsSystemMetricsCollector(),
    intervalMs: 2000,

    onSessionChange(session) {
      if (session === null) return

      let persistenceFailed = false

      try {
        database?.saveSession(session)
      } catch (error) {
        persistenceFailed = true
        console.error('[GameSense] Persistence failed:', error)
      }

      emit({
        type: 'session-change',
        session,
      })

      if (persistenceFailed) {
        emit({
          type: 'error',
          message:
            'Kh\u00f4ng th\u1ec3 l\u01b0u tr\u1ea1ng th\u00e1i phi\u00ean game.',
        })
      }
    },

    onError(error) {
      console.error('[GameSense] Monitor operation failed:', error)

      emit({
        type: 'error',
        message: 'Kh\u00f4ng th\u1ec3 ki\u1ec3m tra ti\u1ebfn tr\u00ecnh game.',
      })
    },

    onMetrics(session, metrics) {
      try {
        database?.insertMetrics(session.id, metrics)
      } catch (error) {
        console.error('[GameSense] Metric persistence failed:', error)
        emit({
          type: 'error',
          message:
            'Kh\u00f4ng th\u1ec3 l\u01b0u ch\u1ec9 s\u1ed1 hi\u1ec7u n\u0103ng.',
        })
      }
    },
  })

  monitor.start()
}

export function getCurrentGameSession(): GameSession | null {
  return monitor?.getCurrentSession() ?? null
}

export function getGameSessionHistory(): GameSession[] {
  return database?.listSessions({ limit: 100 }) ?? []
}

export function subscribeToGameMonitor(
  listener: MonitorListener,
): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export function stopGameMonitor(): void {
  monitor?.stop()
  monitor = null
  database?.close()
  database = null
}
