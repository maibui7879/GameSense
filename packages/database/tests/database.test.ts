import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import BetterSqlite3 from "better-sqlite3";
import type { GameSession, SystemMetrics } from "@gamesense/contracts";
import { GameSenseDatabase } from "../src/index.js";

const databases: GameSenseDatabase[] = [];
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createDatabase(): GameSenseDatabase {
  const database = new GameSenseDatabase();
  databases.push(database);
  return database;
}

function createFileDatabase(): GameSenseDatabase {
  const directory = mkdtempSync(join(tmpdir(), "gamesense-db-"));
  temporaryDirectories.push(directory);
  const database = new GameSenseDatabase(join(directory, "gamesense.db"));
  databases.push(database);
  return database;
}

function session(overrides: Partial<GameSession> = {}): GameSession {
  return {
    id: "session-1",
    gameId: "stella-sora",
    pid: 1234,
    processStartedAt: "2026-10-22T09:59:00.000Z",
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

  it("persists sessions across close and reopen", () => {
    const directory = mkdtempSync(join(tmpdir(), "gamesense-db-"));
    temporaryDirectories.push(directory);
    const filename = join(directory, "gamesense.db");
    const first = new GameSenseDatabase(filename);
    const saved = session();

    first.saveSession(saved);
    first.close();

    const reopened = new GameSenseDatabase(filename);
    databases.push(reopened);

    expect(reopened.getSession(saved.id)).toEqual(saved);
    expect(reopened.getCurrentSession()).toEqual(saved);
  });

  it("migrates a schema v1 database without losing sessions", () => {
    const directory = mkdtempSync(join(tmpdir(), "gamesense-db-"));
    temporaryDirectories.push(directory);
    const filename = join(directory, "gamesense.db");
    const legacy = new BetterSqlite3(filename);

    legacy.exec(`
      CREATE TABLE game_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        game_id TEXT NOT NULL,
        pid INTEGER NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        status TEXT NOT NULL
      );
      INSERT INTO game_sessions
        (id, game_id, pid, started_at, ended_at, status)
      VALUES
        ('legacy-session', 'stella-sora', 1234,
         '2026-10-22T10:00:00.000Z', NULL, 'running');
      PRAGMA user_version = 1;
    `);
    legacy.close();

    const migrated = new GameSenseDatabase(filename);
    databases.push(migrated);

    expect(migrated.getSession("legacy-session")).toEqual({
      id: "legacy-session",
      gameId: "stella-sora",
      pid: 1234,
      processStartedAt: null,
      startedAt: "2026-10-22T10:00:00.000Z",
      endedAt: null,
      status: "running",
    });
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
