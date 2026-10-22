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

    const session: GameSession = {
      id: crypto.randomUUID(),
      gameId,
      pid: processInfo.pid,
      startedAt: new Date().toISOString(),
      endedAt: null,
      status: "running",
    };

    this.currentSession = session;

    return { ...session };
  }

  stopSession(pid?: number): GameSession | null {
    const session = this.currentSession;

    if (!session || session.status !== "running") {
      return null;
    }

    if (pid !== undefined && session.pid !== pid) {
      throw new Error("PID does not match the active session.");
    }

    const stoppedSession: GameSession = {
      ...session,
      endedAt: new Date().toISOString(),
      status: "stopped",
    };

    this.currentSession = stoppedSession;

    return { ...stoppedSession };
  }
}
