import type { ElectronAPI } from '@electron-toolkit/preload'
import type {
  GameSession,
  SessionPerformanceSummary,
} from '@gamesense/contracts'

export interface GameSenseAPI {
  getAppInfo: () => Promise<{
    name: string
    version: string
    platform: string
  }>

  getSessionStatus: () => Promise<GameSession | null>

  getSessionHistory: () => Promise<GameSession[]>

  getSessionCount: () => Promise<number>

  getSessionPerformanceSummary: (
    sessionId: string
  ) => Promise<SessionPerformanceSummary>

  onSessionChange: (
    callback: (session: GameSession) => void
  ) => () => void

  onError: (callback: (message: string) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    gamesense: GameSenseAPI
  }
}
