import { execFile } from "node:child_process";
import { freemem, totalmem } from "node:os";
import { promisify } from "node:util";
import type { SystemMetrics } from "@gamesense/contracts";
import type { MetricsCollector } from "./session-monitor.js";

const execFileAsync = promisify(execFile);

interface RawMetrics {
  cpuUsagePercent?: unknown;
  memoryUsagePercent?: unknown;
}

export class WindowsSystemMetricsCollector implements MetricsCollector {
  async collect(): Promise<SystemMetrics> {
    if (process.platform !== "win32") {
      throw new Error(
        "WindowsSystemMetricsCollector only supports Windows.",
      );
    }

    const script = `
      $cpu = (Get-Counter '\\Processor(_Total)\\% Processor Time' -SampleInterval 1 -MaxSamples 1).CounterSamples[0].CookedValue
      [PSCustomObject]@{
        cpuUsagePercent = $cpu
      } | ConvertTo-Json -Compress
    `;

    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        script,
      ],
      {
        windowsHide: true,
        timeout: 5_000,
        maxBuffer: 64 * 1024,
      },
    );

    return parseSystemMetrics({
      ...JSON.parse(stdout.trim()),
      memoryUsagePercent: getPhysicalMemoryUsagePercent(),
    });
  }
}

export function getPhysicalMemoryUsagePercent(): number | null {
  const total = totalmem();
  const free = freemem();

  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(free)) {
    return null;
  }

  return Math.min(100, Math.max(0, ((total - free) / total) * 100));
}

export function parseSystemMetrics(
  value: unknown,
  capturedAt = new Date().toISOString(),
): SystemMetrics {
  if (typeof value !== "object" || value === null) {
    throw new Error("System metrics output must be an object.");
  }

  const raw = value as RawMetrics;

  return {
    capturedAt,
    cpuUsagePercent: parsePercentage(raw.cpuUsagePercent),
    memoryUsagePercent: parsePercentage(raw.memoryUsagePercent),
  };
}

function parsePercentage(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(number) || number < 0 || number > 100) {
    throw new Error("System metric percentage must be between 0 and 100.");
  }

  return number;
}
