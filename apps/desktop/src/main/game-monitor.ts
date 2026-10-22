import {
  SessionMonitor,
  STELLA_SORA,
  WindowsSystemMetricsCollector
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
      // Một listener lỗi không được ngăn các listener khác nhận sự kiện.
      console.error('[GameSense] Monitor listener failed:', error)
    }
  }
}

export function startGameMonitor(persistence: GameSenseDatabase): void {
  // Tránh tạo nhiều monitor khi cửa sổ được mở lại.
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

      try {
        database?.saveSession(session)
      } catch (error) {
        console.error('[GameSense] Persistence failed:', error)
        emit({
          type: 'error',
          message: 'KhÃ´ng thá»ƒ lÆ°u tráº¡ng thÃ¡i phiÃªn game.'
        })
      }

      emit({
        type: 'session-change',
        session
      })
    },

    onError(error) {
      // Chi tiết lỗi chỉ được ghi ở Main Process.
      console.error('[GameSense] Monitor operation failed:', error)

      emit({
        type: 'error',
        message: 'Không thể kiểm tra tiến trình game.'
      })
    },

    onMetrics(session, metrics) {
      try {
        database?.insertMetrics(session.id, metrics)
      } catch (error) {
        console.error('[GameSense] Metric persistence failed:', error)
        emit({
          type: 'error',
          message: 'KhÃ´ng thá»ƒ lÆ°u chá»‰ sá»‘ hiá»‡u nÄƒng.'
        })
      }
    }
  })

  monitor.start()
}

export function getCurrentGameSession(): GameSession | null {
  return monitor?.getCurrentSession() ?? null
}

export function subscribeToGameMonitor(
  listener: MonitorListener
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
