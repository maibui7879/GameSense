import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  GameDefinition,
  GameProcessInfo,
  GameSession,
  SystemMetrics,
} from "@gamesense/contracts";
import {
  SessionMonitor,
  type ProcessScanner,
} from "../src/session-monitor.js";
import type { DetectedGameProcess } from "../src/process-scanner.js";

const game: GameDefinition = {
  id: "stella-sora",
  name: "Stella Sora",
  executableNames: ["StellaSora.exe"],
};

function processInfo(pid: number): GameProcessInfo {
  return {
    pid,
    executableName: "StellaSora.exe",
    startedAt: "2026-10-21T10:00:00.000Z",
  };
}

function detected(pid: number): DetectedGameProcess[] {
  return [{
    gameId: "stella-sora",
    process: processInfo(pid),
  }];
}

function createScanner(
  initial: DetectedGameProcess[] = [],
): ProcessScanner & {
  results: DetectedGameProcess[];
  scan: ReturnType<typeof vi.fn>;
} {
  const scanner = {
    results: initial,
    scan: vi.fn(),
    async findRunningGames() {
      return scanner.scan();
    },
  };

  scanner.scan.mockImplementation(async () => scanner.results);

  return scanner;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("SessionMonitor", () => {
  it("starts a session when a game is detected", async () => {
    const scanner = createScanner(detected(15056));
    const monitor = new SessionMonitor({
      definitions: [game],
      scanner,
    });

    await monitor.pollOnce();

    expect(monitor.getCurrentSession()).toMatchObject({
      gameId: "stella-sora",
      pid: 15056,
      status: "running",
    });
  });

  it("does not create duplicate sessions for the same PID", async () => {
    const scanner = createScanner(detected(15056));
    const monitor = new SessionMonitor({
      definitions: [game],
      scanner,
    });

    await monitor.pollOnce();
    const first = monitor.getCurrentSession();

    await monitor.pollOnce();

    expect(monitor.getCurrentSession()?.id).toBe(first?.id);
  });

  it("restores a persisted running session when the process is still active", async () => {
    const scanner = createScanner(detected(15056));
    const restored: GameSession = {
      id: "persisted-session",
      gameId: "stella-sora",
      pid: 15056,
      startedAt: "2026-10-21T10:00:00.000Z",
      endedAt: null,
      status: "running",
    };
    const monitor = new SessionMonitor({
      definitions: [game],
      scanner,
      initialSession: restored,
    });

    await monitor.pollOnce();

    expect(monitor.getCurrentSession()).toEqual(restored);
  });

  it("stops a restored session when its process is no longer active", async () => {
    const scanner = createScanner([]);
    const restored: GameSession = {
      id: "persisted-session",
      gameId: "stella-sora",
      pid: 15056,
      startedAt: "2026-10-21T10:00:00.000Z",
      endedAt: null,
      status: "running",
    };
    const monitor = new SessionMonitor({
      definitions: [game],
      scanner,
      initialSession: restored,
    });

    await monitor.pollOnce();

    expect(monitor.getCurrentSession()?.status).toBe("stopped");
  });

  it("collects metrics for an active session", async () => {
    const scanner = createScanner(detected(15056));
    const metrics: SystemMetrics = {
      capturedAt: "2026-10-21T10:01:00.000Z",
      cpuUsagePercent: 25,
      memoryUsagePercent: 50,
    };
    const onMetrics = vi.fn();
    const monitor = new SessionMonitor({
      definitions: [game],
      scanner,
      metricsCollector: {
        collect: vi.fn(async () => metrics),
      },
      onMetrics,
    });

    await monitor.pollOnce();
    await vi.waitFor(() => {
      expect(onMetrics).toHaveBeenCalledWith(
        expect.objectContaining({ pid: 15056 }),
        metrics,
      );
    });
  });

  it("stops a session when its process disappears", async () => {
    const scanner = createScanner(detected(15056));
    const monitor = new SessionMonitor({
      definitions: [game],
      scanner,
    });

    await monitor.pollOnce();
    scanner.results = [];

    await monitor.pollOnce();

    expect(monitor.getCurrentSession()?.status).toBe("stopped");
    expect(monitor.getCurrentSession()?.endedAt).toBeTruthy();
  });

  it("preserves the active session when scanning fails", async () => {
    const scanner = createScanner(detected(15056));
    const onError = vi.fn();
    const monitor = new SessionMonitor({
      definitions: [game],
      scanner,
      onError,
    });

    await monitor.pollOnce();
    const original = monitor.getCurrentSession();

    scanner.scan.mockRejectedValueOnce(new Error("Access denied"));

    await monitor.pollOnce();

    expect(monitor.getCurrentSession()).toEqual(original);
    expect(onError).toHaveBeenCalledOnce();
  });

  it("does not overlap concurrent pollOnce calls", async () => {
    const scanner = createScanner(detected(15056));
    let resolveScan!: (value: DetectedGameProcess[]) => void;

    scanner.scan.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveScan = resolve;
      }),
    );

    const monitor = new SessionMonitor({
      definitions: [game],
      scanner,
    });

    const first = monitor.pollOnce();
    const second = monitor.pollOnce();

    expect(scanner.scan).toHaveBeenCalledOnce();

    resolveScan(detected(15056));
    await Promise.all([first, second]);

    expect(monitor.getCurrentSession()?.pid).toBe(15056);
  });

  it("starts polling immediately and stops its timer", async () => {
    vi.useFakeTimers();

    const scanner = createScanner(detected(15056));
    const monitor = new SessionMonitor({
      definitions: [game],
      scanner,
      intervalMs: 1000,
    });

    monitor.start();
    expect(monitor.isRunning()).toBe(true);

    await vi.waitFor(() => {
      expect(scanner.scan).toHaveBeenCalledOnce();
    });

    monitor.stop();
    expect(monitor.isRunning()).toBe(false);

    await vi.advanceTimersByTimeAsync(3000);
    expect(scanner.scan).toHaveBeenCalledOnce();
  });

  it("ignores scan results that arrive after stop", async () => {
    const scanner = createScanner();
    let resolveScan!: (value: DetectedGameProcess[]) => void;

    scanner.scan.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveScan = resolve;
      }),
    );

    const monitor = new SessionMonitor({
      definitions: [game],
      scanner,
    });

    monitor.start();
    monitor.stop();

    resolveScan(detected(15056));
    await vi.waitFor(() => {
      expect(monitor.getCurrentSession()).toBeNull();
    });
  });

  it("rejects a non-positive polling interval", () => {
    expect(() => new SessionMonitor({
      definitions: [game],
      intervalMs: 0,
    })).toThrow("intervalMs must be greater than zero.");
  });
});
