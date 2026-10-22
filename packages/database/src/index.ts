import Database from "better-sqlite3";
import type {
  GameSession,
  SystemMetrics,
} from "@gamesense/contracts";

export const DATABASE_PACKAGE_VERSION = "0.1.0";

const CURRENT_SCHEMA_VERSION = 1;

interface SessionRow {
  id: string;
  game_id: string;
  pid: number;
  started_at: string;
  ended_at: string | null;
  status: GameSession["status"];
}

interface MetricsRow {
  id: number;
  session_id: string | null;
  captured_at: string;
  cpu_usage_percent: number | null;
  memory_usage_percent: number | null;
}

export interface SessionListOptions {
  limit?: number;
  offset?: number;
}

export class GameSenseDatabase {
  private readonly database: Database.Database;

  constructor(filename = ":memory:") {
    this.database = new Database(filename);
    this.database.pragma("foreign_keys = ON");
    this.migrate();
  }

  saveSession(session: GameSession): void {
    this.database
      .prepare(
        `
          INSERT INTO game_sessions
            (id, game_id, pid, started_at, ended_at, status)
          VALUES (@id, @gameId, @pid, @startedAt, @endedAt, @status)
          ON CONFLICT(id) DO UPDATE SET
            game_id = excluded.game_id,
            pid = excluded.pid,
            started_at = excluded.started_at,
            ended_at = excluded.ended_at,
            status = excluded.status
        `,
      )
      .run({
        id: session.id,
        gameId: session.gameId,
        pid: session.pid,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        status: session.status,
      });
  }

  getSession(id: string): GameSession | null {
    const row = this.database
      .prepare<[{ id: string }], SessionRow>(
        `SELECT id, game_id, pid, started_at, ended_at, status
         FROM game_sessions WHERE id = @id`,
      )
      .get({ id });

    return row ? mapSessionRow(row) : null;
  }

  getCurrentSession(): GameSession | null {
    const row = this.database
      .prepare<[], SessionRow>(
        `SELECT id, game_id, pid, started_at, ended_at, status
         FROM game_sessions
         WHERE status = 'running'
         ORDER BY started_at DESC
         LIMIT 1`,
      )
      .get();

    return row ? mapSessionRow(row) : null;
  }

  listSessions(options: SessionListOptions = {}): GameSession[] {
    const limit = normalizePageSize(options.limit);
    const offset = normalizeOffset(options.offset);
    const rows = this.database
      .prepare<[{ limit: number; offset: number }], SessionRow>(
        `SELECT id, game_id, pid, started_at, ended_at, status
         FROM game_sessions
         ORDER BY started_at DESC
         LIMIT @limit OFFSET @offset`,
      )
      .all({ limit, offset });

    return rows.map(mapSessionRow);
  }

  insertMetrics(
    sessionId: string | null,
    metrics: SystemMetrics,
  ): number {
    const result = this.database
      .prepare(
        `INSERT INTO system_metrics
          (session_id, captured_at, cpu_usage_percent, memory_usage_percent)
         VALUES (@sessionId, @capturedAt, @cpuUsagePercent, @memoryUsagePercent)`,
      )
      .run({
        sessionId,
        capturedAt: metrics.capturedAt,
        cpuUsagePercent: metrics.cpuUsagePercent,
        memoryUsagePercent: metrics.memoryUsagePercent,
      });

    return Number(result.lastInsertRowid);
  }

  listMetrics(sessionId: string | null = null, limit = 100): SystemMetrics[] {
    const normalizedLimit = normalizePageSize(limit);
    const rows = this.database
      .prepare<[{ sessionId: string | null; limit: number }], MetricsRow>(
        `SELECT id, session_id, captured_at, cpu_usage_percent,
                memory_usage_percent
         FROM system_metrics
         WHERE (@sessionId IS NULL AND session_id IS NULL)
            OR session_id = @sessionId
         ORDER BY captured_at DESC, id DESC
         LIMIT @limit`,
      )
      .all({ sessionId, limit: normalizedLimit });

    return rows.map(mapMetricsRow);
  }

  close(): void {
    this.database.close();
  }

  private migrate(): void {
    const version = Number(this.database.pragma("user_version", { simple: true }));

    if (version > CURRENT_SCHEMA_VERSION) {
      throw new Error(
        `Database schema version ${version} is newer than supported version ${CURRENT_SCHEMA_VERSION}.`,
      );
    }

    if (version === 0) {
      const migration = this.database.transaction(() => {
        this.database.exec(`
          CREATE TABLE game_sessions (
            id TEXT PRIMARY KEY NOT NULL,
            game_id TEXT NOT NULL,
            pid INTEGER NOT NULL CHECK (pid > 0),
            started_at TEXT NOT NULL,
            ended_at TEXT,
            status TEXT NOT NULL CHECK (status IN ('running', 'stopped')),
            CHECK (
              (status = 'running' AND ended_at IS NULL)
              OR (status = 'stopped' AND ended_at IS NOT NULL)
            )
          );

          CREATE INDEX game_sessions_started_at_idx
            ON game_sessions (started_at DESC);

          CREATE INDEX game_sessions_status_idx
            ON game_sessions (status);

          CREATE TABLE system_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT REFERENCES game_sessions(id) ON DELETE CASCADE,
            captured_at TEXT NOT NULL,
            cpu_usage_percent REAL CHECK (
              cpu_usage_percent IS NULL OR
              (cpu_usage_percent >= 0 AND cpu_usage_percent <= 100)
            ),
            memory_usage_percent REAL CHECK (
              memory_usage_percent IS NULL OR
              (memory_usage_percent >= 0 AND memory_usage_percent <= 100)
            )
          );

          CREATE INDEX system_metrics_session_captured_at_idx
            ON system_metrics (session_id, captured_at DESC);
        `);
        this.database.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`);
      });

      migration();
    }
  }
}

function mapSessionRow(row: SessionRow): GameSession {
  return {
    id: row.id,
    gameId: row.game_id,
    pid: row.pid,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status,
  };
}

function mapMetricsRow(row: MetricsRow): SystemMetrics {
  return {
    capturedAt: row.captured_at,
    cpuUsagePercent: row.cpu_usage_percent,
    memoryUsagePercent: row.memory_usage_percent,
  };
}

function normalizePageSize(value: number | undefined): number {
  if (value === undefined) return 100;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("limit must be a positive integer.");
  }
  return value;
}

function normalizeOffset(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("offset must be a non-negative integer.");
  }
  return value;
}
