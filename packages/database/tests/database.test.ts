import { afterEach, describe, expect, it } from "vitest";
import type { GameSession, SystemMetrics } from "@gamesense/contracts";
import { GameSenseDatabase } from "../src/index.js";

const databases: GameSenseDatabase[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function createDatabase(): GameSenseDatabase {
  const database = new GameSenseDatabase();
  databases.push(database);
  return database;
}

function session(overrides: Partial<GameSession> = {}): GameSession {
  return {
    id: "session-1",
    gameId: "stella-sora",
    pid: 1234,
    startedAt: "2026-10-22T10:00:00.000Z",
    endedAt: null,
    status: "running",
    ...overrides,
  };
}

const metrics: SystemMetrics = {
  capturedAt: "2026-10-22T10:01:00.000Z",
  cpuUsagePercent: 42.5,
  memoryUsagePercent: 63.25,
};

describe("GameSenseDatabase", () => {
  it("creates the schema and persists sessions", () => {
    const database = createDatabase();
    const running = session();

    database.saveSession(running);

    expect(database.getSession(running.id)).toEqual(running);
    expect(database.getCurrentSession()).toEqual(running);
  });

  it("updates a session when it ends", () => {
    const database = createDatabase();
    database.saveSession(session());

    const stopped = session({
      endedAt: "2026-10-22T11:00:00.000Z",
      status: "stopped",
    });
    database.saveSession(stopped);

    expect(database.getSession(stopped.id)).toEqual(stopped);
    expect(database.getCurrentSession()).toBeNull();
  });

  it("lists sessions newest first", () => {
    const database = createDatabase();
    database.saveSession(session({
      id: "older",
      startedAt: "2026-10-22T09:00:00.000Z",
    }));
    database.saveSession(session({
      id: "newer",
      startedAt: "2026-10-22T12:00:00.000Z",
    }));

    expect(database.listSessions().map((item) => item.id)).toEqual([
      "newer",
      "older",
    ]);
  });

  it("persists metrics and associates them with a session", () => {
    const database = createDatabase();
    database.saveSession(session());

    expect(database.insertMetrics("session-1", metrics)).toBe(1);
    expect(database.listMetrics("session-1")).toEqual([metrics]);
  });

  it("rejects metrics outside the percentage range", () => {
    const database = createDatabase();

    expect(() => database.insertMetrics(null, {
      ...metrics,
      cpuUsagePercent: 101,
    })).toThrow();
  });

});
