import type {
  GameProcessInfo,
  GameSession,
} from "@gamesense/contracts";

export class SessionManager {
  private currentSession: GameSession | null = null;

  restoreSession(session: GameSession): void {
    if (session.status !== "running" || session.endedAt !== null) {
      throw new Error("Only a running session can be restored.");
    }

    if (this.currentSession?.status === "running") {
      throw new Error("A running session is already active.");
    }

    this.currentSession = { ...session };
  }

  getCurrentSession(): GameSession | null {
    return this.currentSession
      ? { ...this.currentSession }
      : null;
  }

  startSession(
    gameId: string,
    processInfo: GameProcessInfo,
  ): GameSession {
    if (this.currentSession?.status === "running") {
      if (this.currentSession.pid === processInfo.pid) {
        return { ...this.currentSession };
      }

      throw new Error(
        "Another game session is already running.",
      );
    }

    const now = new Date().toISOString();
    const session: GameSession = {
      id: crypto.randomUUID(),
      gameId,
      pid: processInfo.pid,
      processStartedAt: processInfo.startedAt,
      startedAt: now,
      lastSeenAt: now,
      endedAt: null,
      status: "running",
    };

    this.currentSession = session;

    return { ...session };
  }

  touchSession(at = new Date().toISOString()): GameSession | null {
    if (!this.currentSession || this.currentSession.status !== "running") {
      return null;
    }

    this.currentSession = {
      ...this.currentSession,
      lastSeenAt: at,
    };

    return { ...this.currentSession };
  }

  stopSession(
    pid?: number,
    endedAt = new Date().toISOString(),
  ): GameSession | null {
    const session = this.currentSession;

    if (!session || session.status !== "running") {
      return null;
    }

    if (pid !== undefined && session.pid !== pid) {
      throw new Error("PID does not match the active session.");
    }

    const stoppedSession: GameSession = {
      ...session,
      endedAt,
      status: "stopped",
    };

    this.currentSession = stoppedSession;

    return { ...stoppedSession };
  }
}
