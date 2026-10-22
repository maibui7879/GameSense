import { describe, expect, it } from "vitest";
import { parseSystemMetrics } from "../src/system-metrics.js";

describe("parseSystemMetrics", () => {
  it("normalizes numeric PowerShell output", () => {
    expect(parseSystemMetrics(
      { cpuUsagePercent: 12.5, memoryUsagePercent: "64.25" },
      "2026-10-21T10:00:00.000Z",
    )).toEqual({
      capturedAt: "2026-10-21T10:00:00.000Z",
      cpuUsagePercent: 12.5,
      memoryUsagePercent: 64.25,
    });
  });

  it("allows unavailable metrics as null", () => {
    expect(parseSystemMetrics(
      { cpuUsagePercent: null },
      "2026-10-21T10:00:00.000Z",
    )).toEqual({
      capturedAt: "2026-10-21T10:00:00.000Z",
      cpuUsagePercent: null,
      memoryUsagePercent: null,
    });
  });

  it("rejects values outside the percentage range", () => {
    expect(() => parseSystemMetrics({ cpuUsagePercent: 101 }))
      .toThrow("between 0 and 100");
  });
});
