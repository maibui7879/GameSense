import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  type IpcMainInvokeEvent
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import {
  getCurrentGameSession,
  startGameMonitor,
  stopGameMonitor,
  subscribeToGameMonitor
} from './game-monitor'

const trustedWebContents = new Set<number>()

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const senderId = event.sender.id

  if (
    !trustedWebContents.has(senderId) ||
    event.senderFrame !== event.sender.mainFrame
  ) {
    throw new Error('Untrusted IPC sender.')
  }
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  trustedWebContents.add(mainWindow.webContents.id)

  mainWindow.on('closed', () => {
    trustedWebContents.delete(mainWindow.webContents.id)
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsedUrl = new URL(url)

      if (parsedUrl.protocol === 'https:') {
        void shell.openExternal(url)
      }
    } catch {
      // URL không hợp lệ: không mở bên ngoài.
    }

    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('app:get-info', (event) => {
  assertTrustedSender(event)

  return {
    name: 'GameSense Desktop',
    version: app.getVersion(),
    platform: process.platform
  }
})

ipcMain.handle('game:get-session', (event) => {
  assertTrustedSender(event)

  return getCurrentGameSession()
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Đăng ký listener một lần cho toàn bộ vòng đời ứng dụng.
  const unsubscribe = subscribeToGameMonitor((event) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (
        window.isDestroyed() ||
        !trustedWebContents.has(window.webContents.id)
      ) {
        continue
      }

      if (event.type === 'session-change') {
        window.webContents.send('game:session-change', event.session)
      } else {
        window.webContents.send('game:error', event.message)
      }
    }
  })

  startGameMonitor()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  app.once('before-quit', () => {
    unsubscribe()
    stopGameMonitor()
    trustedWebContents.clear()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
