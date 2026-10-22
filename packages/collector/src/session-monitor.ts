import type {
  GameDefinition,
  GameSession,
} from "@gamesense/contracts";
import { SessionManager } from "@gamesense/game-core";
import {
  WindowsProcessScanner,
  type DetectedGameProcess,
} from "./process-scanner.js";

export interface ProcessScanner {
  findRunningGames(
    definitions: GameDefinition[],
  ): Promise<DetectedGameProcess[]>;
}

export interface SessionMonitorOptions {
  definitions: GameDefinition[];
  scanner?: ProcessScanner;
  sessionManager?: SessionManager;
  intervalMs?: number;
  onSessionChange?: (session: GameSession | null) => void;
  onError?: (error: unknown) => void;
}

export class SessionMonitor {
  private readonly definitions: GameDefinition[];
  private readonly scanner: ProcessScanner;
  private readonly sessionManager: SessionManager;
  private readonly intervalMs: number;
  private readonly onSessionChange?: (
    session: GameSession | null,
  ) => void;
  private readonly onError?: (error: unknown) => void;

  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<void> | null = null;
  private generation = 0;

  constructor(options: SessionMonitorOptions) {
    this.definitions = options.definitions;
    this.scanner = options.scanner ?? new WindowsProcessScanner();
    this.sessionManager =
      options.sessionManager ?? new SessionManager();
    this.intervalMs = options.intervalMs ?? 2000;
    this.onSessionChange = options.onSessionChange;
    this.onError = options.onError;

    if (this.intervalMs <= 0) {
      throw new Error("intervalMs must be greater than zero.");
    }
  }

  getCurrentSession(): GameSession | null {
    return this.sessionManager.getCurrentSession();
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer !== null) {
      return;
    }

    const generation = ++this.generation;

    // Quét ngay khi bắt đầu, không phải chờ hết interval đầu tiên.
    void this.pollOnceForGeneration(generation);

    this.timer = setInterval(() => {
      void this.pollOnceForGeneration(generation);
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Bỏ qua kết quả của các lượt quét thuộc vòng đời cũ.
    this.generation++;
  }

  pollOnce(): Promise<void> {
    return this.pollOnceForGeneration(this.generation);
  }

  private pollOnceForGeneration(
    generation: number,
  ): Promise<void> {
    if (this.inFlight !== null) {
      return this.inFlight;
    }

    const task = this.performPoll(generation);
    this.inFlight = task;

    void task.finally(() => {
      if (this.inFlight === task) {
        this.inFlight = null;
      }
    });

    return task;
  }

  private async performPoll(
    generation: number,
  ): Promise<void> {
    let detected: DetectedGameProcess[];

    try {
      detected = await this.scanner.findRunningGames(
        this.definitions,
      );
    } catch (error) {
      // Không coi lỗi quét là bằng chứng game đã đóng.
      if (generation === this.generation) {
        this.onError?.(error);
      }
      return;
    }

    // Không áp dụng kết quả cũ sau khi monitor đã stop/restart.
    if (generation !== this.generation) {
      return;
    }

    const current = this.sessionManager.getCurrentSession();

    const currentProcess = current
      ? detected.find(
          (item) =>
            item.gameId === current.gameId &&
            item.process.pid === current.pid,
        )
      : undefined;

    if (current && currentProcess) {
      // Game vẫn chạy; giữ nguyên session hiện tại.
      return;
    }

    if (current) {
      const stopped = this.sessionManager.stopSession(
        current.pid,
      );

      if (stopped) {
        this.onSessionChange?.(stopped);
      }
    }

    if (detected.length === 0) {
      return;
    }

    // MVP theo dõi một session tại một thời điểm.
    const next = detected[0];

    const started = this.sessionManager.startSession(
      next.gameId,
      next.process,
    );

    this.onSessionChange?.(started);
  }
}
