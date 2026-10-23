import type { ElectronAPI } from '@electron-toolkit/preload'
import type { GameSession } from '@gamesense/contracts'

export interface GameSenseAPI {
  getAppInfo: () => Promise<{
    name: string
    version: string
    platform: string
  }>

  getSessionStatus: () => Promise<GameSession | null>

  getSessionHistory: () => Promise<GameSession[]>

  getSessionCount: () => Promise<number>

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
