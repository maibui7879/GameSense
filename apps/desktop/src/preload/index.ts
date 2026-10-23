import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  GameSession,
  SessionPerformanceSummary,
} from '@gamesense/contracts'

const api = {}

const gamesense = {
  getAppInfo: (): Promise<{
    name: string
    version: string
    platform: string
  }> => ipcRenderer.invoke('app:get-info'),

  getSessionStatus: (): Promise<GameSession | null> =>
    ipcRenderer.invoke('game:get-session'),

  getSessionHistory: (): Promise<GameSession[]> =>
    ipcRenderer.invoke('game:list-sessions'),

  getSessionCount: (): Promise<number> =>
    ipcRenderer.invoke('game:count-sessions'),

  getSessionPerformanceSummary: (
    sessionId: string
  ): Promise<SessionPerformanceSummary> =>
    ipcRenderer.invoke('game:get-session-summary', sessionId),

  onSessionChange: (
    callback: (session: GameSession) => void
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      session: GameSession
    ): void => {
      callback(session)
    }

    ipcRenderer.on('game:session-change', listener)

    return () => {
      ipcRenderer.removeListener('game:session-change', listener)
    }
  },

  onError: (callback: (message: string) => void): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      message: string
    ): void => {
      callback(message)
    }

    ipcRenderer.on('game:error', listener)

    return () => {
      ipcRenderer.removeListener('game:error', listener)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('gamesense', gamesense)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
  // @ts-ignore
  window.gamesense = gamesense
}
