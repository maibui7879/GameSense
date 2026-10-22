import { describe, expect, it } from "vitest";
import { SessionManager } from "../src/session-manager.js";
import type { GameProcessInfo } from "@gamesense/contracts";

function createProcess(
  pid = 1234,
): GameProcessInfo {
  return {
    pid,
    executableName: "StellaSora.exe",
    startedAt: "2026-10-21T10:00:00.000Z",
  };
}

describe("SessionManager", () => {
  it("starts a new session", () => {
    const manager = new SessionManager();

    const session = manager.startSession(
      "stella-sora",
      createProcess(),
    );

    expect(session.gameId).toBe("stella-sora");
    expect(session.pid).toBe(1234);
    expect(session.status).toBe("running");
    expect(session.endedAt).toBeNull();
    expect(session.id).toBeTruthy();
    expect(manager.getCurrentSession()).toEqual(session);
  });

  it("returns the existing session for the same PID", () => {
    const manager = new SessionManager();

    const first = manager.startSession(
      "stella-sora",
      createProcess(1234),
    );

    const second = manager.startSession(
      "stella-sora",
      createProcess(1234),
    );

    expect(second.id).toBe(first.id);
    expect(manager.getCurrentSession()?.id).toBe(first.id);
  });

  it("stops a session and records its end time", () => {
    const manager = new SessionManager();

    manager.startSession("stella-sora", createProcess());

    const stopped = manager.stopSession(1234);

    expect(stopped?.status).toBe("stopped");
    expect(stopped?.endedAt).toBeTruthy();
    expect(Date.parse(stopped!.endedAt!)).not.toBeNaN();
    expect(manager.getCurrentSession()?.status).toBe("stopped");
  });

  it("rejects a different PID and preserves the active session", () => {
    const manager = new SessionManager();

    const original = manager.startSession(
      "stella-sora",
      createProcess(1234),
    );

    expect(() => manager.startSession(
      "stella-sora",
      createProcess(5678),
    )).toThrow("Another game session is already running.");

    expect(() => manager.stopSession(5678)).toThrow(
      "PID does not match the active session.",
    );

    expect(manager.getCurrentSession()).toEqual(original);
  });

  it("returns null when no session can be stopped", () => {
    const manager = new SessionManager();

    expect(manager.stopSession()).toBeNull();
    expect(manager.getCurrentSession()).toBeNull();
  });
});
