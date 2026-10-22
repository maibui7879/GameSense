import {
  SessionMonitor,
  STELLA_SORA
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

  monitor = new SessionMonitor({
    definitions: [STELLA_SORA],
    intervalMs: 2000,

    onSessionChange(session) {
      if (session === null) return

      database?.saveSession(session)

      emit({
        type: 'session-change',
        session
      })
    },

    onError(error) {
      // Chi tiết lỗi chỉ được ghi ở Main Process.
      console.error('[GameSense] Process scan failed:', error)

      emit({
        type: 'error',
        message: 'Không thể kiểm tra tiến trình game.'
      })
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
