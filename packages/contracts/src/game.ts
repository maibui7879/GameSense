export type GameId = string;

export type GameStatus =
  | "idle"
  | "detected"
  | "running"
  | "stopped";

export interface GameDefinition {
  id: GameId;
  name: string;
  executableNames: string[];
}

export interface GameProcessInfo {
  pid: number;
  executableName: string;
  startedAt: string;
}

export interface GameSession {
  id: string;
  gameId: GameId;
  pid: number;
  startedAt: string;
  endedAt: string | null;
  status: "running" | "stopped";
}

export interface SystemMetrics {
  capturedAt: string;
  cpuUsagePercent: number | null;
  memoryUsagePercent: number | null;
}
