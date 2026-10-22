import { execFile } from "node:child_process";
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
      $os = Get-CimInstance Win32_OperatingSystem
      $memory = (1 - ($os.FreePhysicalMemory / $os.TotalVisibleMemorySize)) * 100
      [PSCustomObject]@{
        cpuUsagePercent = $cpu
        memoryUsagePercent = $memory
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

    return parseSystemMetrics(JSON.parse(stdout.trim()));
  }
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
