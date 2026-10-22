import { describe, expect, it } from "vitest";
import type {
  GameDefinition,
  GameProcessInfo,
} from "@gamesense/contracts";
import {
  matchRunningGames,
  matchesProcessIdentity,
  resolveStartedAt,
  UNKNOWN_STARTED_AT,
} from "../src/process-scanner.js";

const definitions: GameDefinition[] = [
  {
    id: "stella-sora",
    name: "Stella Sora",
    executableNames: ["StellaSora.exe"],
  },
  {
    id: "another-game",
    name: "Another Game",
    executableNames: ["AnotherGame.exe"],
  },
];

function createProcess(
  pid: number,
  executableName: string,
): GameProcessInfo {
  return {
    pid,
    executableName,
    startedAt: "2026-10-21T10:00:00.000Z",
  };
}

describe("matchRunningGames", () => {
  it("matches the exact executable name", () => {
    const result = matchRunningGames(
      [createProcess(15056, "StellaSora.exe")],
      definitions,
    );

    expect(result).toHaveLength(1);
    expect(result[0].gameId).toBe("stella-sora");
    expect(result[0].process.pid).toBe(15056);
  });

  it("matches executable names case-insensitively", () => {
    const result = matchRunningGames(
      [createProcess(100, "STELLASORA.EXE")],
      definitions,
    );

    expect(result).toHaveLength(1);
    expect(result[0].gameId).toBe("stella-sora");
  });

  it("does not match partial executable names", () => {
    const result = matchRunningGames(
      [
        createProcess(100, "FakeStellaSora.exe"),
        createProcess(101, "StellaSoraLauncher.exe"),
      ],
      definitions,
    );

    expect(result).toEqual([]);
  });

  it("matches multiple supported games", () => {
    const result = matchRunningGames(
      [
        createProcess(100, "StellaSora.exe"),
        createProcess(200, "AnotherGame.exe"),
        createProcess(300, "unknown.exe"),
      ],
      definitions,
    );

    expect(result.map((item) => item.gameId)).toEqual([
      "stella-sora",
      "another-game",
    ]);
  });

  it("returns an empty array when there are no processes", () => {
    expect(matchRunningGames([], definitions)).toEqual([]);
  });

  it("does not mutate the input process list", () => {
    const processes = [
      createProcess(100, "StellaSora.exe"),
    ];
    const original = [...processes];

    matchRunningGames(processes, definitions);

    expect(processes).toEqual(original);
  });
});

describe("matchesProcessIdentity", () => {
  it("requires the process start time when it is known", () => {
    expect(matchesProcessIdentity(
      { pid: 100, processStartedAt: "2026-10-21T10:00:00.000Z" },
      createProcess(100, "StellaSora.exe"),
    )).toBe(true);

    expect(matchesProcessIdentity(
      { pid: 100, processStartedAt: "2026-10-21T11:00:00.000Z" },
      createProcess(100, "StellaSora.exe"),
    )).toBe(false);
  });

  it("falls back to PID when either process start time is unavailable", () => {
    expect(matchesProcessIdentity(
      { pid: 100, processStartedAt: UNKNOWN_STARTED_AT },
      createProcess(100, "StellaSora.exe"),
    )).toBe(true);

    expect(matchesProcessIdentity(
      { pid: 100, processStartedAt: "2026-10-21T10:00:00.000Z" },
      createProcess(100, "StellaSora.exe"),
    )).toBe(true);
  });

  it("rejects a different PID even when timestamps match", () => {
    expect(matchesProcessIdentity(
      { pid: 100, processStartedAt: "2026-10-21T10:00:00.000Z" },
      createProcess(101, "StellaSora.exe"),
    )).toBe(false);
  });
});

describe("resolveStartedAt (regression for empty CreationDate)", () => {
  it("returns an ISO timestamp for a valid ISO input", () => {
    const result = resolveStartedAt("2026-10-21T10:00:00.000Z");

    expect(result).toBe("2026-10-21T10:00:00.000Z");
    expect(Date.parse(result)).not.toBeNaN();
  });

  it("normalizes an ISO timestamp with excess fractional digits", () => {
    // PowerShell .ToString('o') có thể cho 7 chữ số thập phân.
    const result = resolveStartedAt("2026-10-16T05:28:45.6531870Z");

    expect(result).toBe("2026-10-16T05:28:45.653Z");
  });

  it("returns the sentinel for an empty string instead of an empty value", () => {
    expect(resolveStartedAt("")).toBe(UNKNOWN_STARTED_AT);
  });

  it("returns the sentinel for a whitespace-only string", () => {
    expect(resolveStartedAt("   ")).toBe(UNKNOWN_STARTED_AT);
  });

  it("returns the sentinel for a missing or non-string value", () => {
    expect(resolveStartedAt(undefined)).toBe(UNKNOWN_STARTED_AT);
    expect(resolveStartedAt(null)).toBe(UNKNOWN_STARTED_AT);
    expect(resolveStartedAt(1792128525653)).toBe(UNKNOWN_STARTED_AT);
  });

  it("returns the sentinel for an unparseable string", () => {
    expect(resolveStartedAt("not-a-date")).toBe(UNKNOWN_STARTED_AT);
    expect(resolveStartedAt("hello")).toBe(UNKNOWN_STARTED_AT);
    expect(resolveStartedAt("xxx")).toBe(UNKNOWN_STARTED_AT);
  });

  it("parses a numeric-only string as a year rather than rejecting it", () => {
    // JavaScript Date.parse hiểu "12345" là năm 12345. Đây là hành vi được chấp nhận:
    // resolveStartedAt là lớp phòng thủ cuối, không phải validator format chặt.
    const result = resolveStartedAt("12345");

    expect(result).not.toBe(UNKNOWN_STARTED_AT);
    expect(Date.parse(result)).not.toBeNaN();
  });

  it("parses a US-style datetime string into a valid ISO timestamp", () => {
    // JavaScript Date.parse chấp nhận cả format không chuẩn như MM/DD/YYYY h:mm:ss AM/PM.
    // Vì nó parse được nên trả về ISO hợp lệ, không phải sentinel.
    const result = resolveStartedAt("10/16/2026 12:28:45 PM");

    expect(result).not.toBe(UNKNOWN_STARTED_AT);
    expect(Date.parse(result)).not.toBeNaN();
  });

  it("never returns an empty string for any input", () => {
    const inputs = ["", "   ", undefined, null, "garbage", 0, {}, []];

    for (const input of inputs) {
      expect(resolveStartedAt(input)).not.toBe("");
    }
  });

  it("still detects a game process whose timestamp cannot be read", () => {
    // Bản ghi mô phỏng PowerShell trả về startedAt rỗng/không hợp lệ.
    const processWithBadTimestamp: GameProcessInfo = {
      pid: 10972,
      executableName: "StellaSora.exe",
      startedAt: resolveStartedAt(""),
    };

    expect(processWithBadTimestamp.startedAt).toBe(UNKNOWN_STARTED_AT);

    const result = matchRunningGames(
      [processWithBadTimestamp],
      definitions,
    );

    expect(result).toHaveLength(1);
    expect(result[0].gameId).toBe("stella-sora");
    expect(result[0].process.startedAt).toBe(UNKNOWN_STARTED_AT);
  });
});
