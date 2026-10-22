import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  GameDefinition,
  GameProcessInfo,
  GameSession,
} from "@gamesense/contracts";

const execFileAsync = promisify(execFile);

/**
 * Sentinel có chủ đích cho trường hợp CreationDate không đọc được.
 * Epoch 1970 để downstream phân biệt rõ "không xác định" với thời điểm thật.
 */
export const UNKNOWN_STARTED_AT = "1970-01-01T00:00:00.000Z";

/**
 * Hàm thuần chuẩn hóa giá trị CreationDate về ISO 8601 UTC.
 * Trả về UNKNOWN_STARTED_AT nếu giá trị thiếu hoặc không parse được,
 * không bao giờ trả chuỗi rỗng.
 */
export function resolveStartedAt(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    return UNKNOWN_STARTED_AT;
  }

  const time = Date.parse(value);

  if (Number.isNaN(time)) {
    return UNKNOWN_STARTED_AT;
  }

  return new Date(time).toISOString();
}

interface RawProcess {
  pid: number;
  executableName: string;
  startedAt: unknown;
}

export class WindowsProcessScanner {
  async listProcesses(): Promise<GameProcessInfo[]> {
    if (process.platform !== "win32") {
      throw new Error(
        "WindowsProcessScanner only supports Windows.",
      );
    }

    // Script cố định, không ghép dữ liệu đầu vào của người dùng.
    const script = `
      $items = @(
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        ForEach-Object {
          $startedAt = '1970-01-01T00:00:00.000Z'
          $creation = $_.CreationDate

          if ($creation -is [datetime]) {
            try {
              $startedAt = $creation.ToUniversalTime().ToString('o')
            } catch {}
          }

          [PSCustomObject]@{
            pid = [int]$_.ProcessId
            executableName = [string]$_.Name
            startedAt = $startedAt
          }
        }
      )

      ConvertTo-Json -InputObject $items -Compress -Depth 3
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
        timeout: 10_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );

    const output = stdout.trim();

    if (!output) {
      return [];
    }

    const parsed: unknown = JSON.parse(output);
    const records = Array.isArray(parsed) ? parsed : [parsed];

    return records
      .filter(isRawProcess)
      .map((item) => ({
        pid: item.pid,
        executableName: item.executableName,
        startedAt: resolveStartedAt(item.startedAt),
      }));
  }

  async findRunningGames(
    definitions: GameDefinition[],
  ): Promise<DetectedGameProcess[]> {
    return matchRunningGames(
      await this.listProcesses(),
      definitions,
    );
  }
}

export interface DetectedGameProcess {
  gameId: string;
  process: GameProcessInfo;
}

export function matchRunningGames(
  processes: GameProcessInfo[],
  definitions: GameDefinition[],
): DetectedGameProcess[] {
  const definitionsByExecutable = new Map<string, string>();

  for (const definition of definitions) {
    for (const executable of definition.executableNames) {
      const key = executable.toLowerCase();

      // Không cho definition phía sau ghi đè tên đã khai báo.
      if (!definitionsByExecutable.has(key)) {
        definitionsByExecutable.set(key, definition.id);
      }
    }
  }

  return processes.flatMap((processInfo) => {
    const gameId = definitionsByExecutable.get(
      processInfo.executableName.toLowerCase(),
    );

    return gameId
      ? [{ gameId, process: processInfo }]
      : [];
  });
}

export function matchesProcessIdentity(
  session: Pick<GameSession, "pid" | "processStartedAt">,
  processInfo: GameProcessInfo,
): boolean {
  if (session.pid !== processInfo.pid) {
    return false;
  }

  if (
    session.processStartedAt === null ||
    session.processStartedAt === UNKNOWN_STARTED_AT ||
    processInfo.startedAt === UNKNOWN_STARTED_AT
  ) {
    return true;
  }

  return session.processStartedAt === processInfo.startedAt;
}

function isRawProcess(value: unknown): value is RawProcess {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  // startedAt có thể thiếu hoặc sai kiểu; resolveStartedAt sẽ chuẩn hóa sau.
  return (
    typeof record.pid === "number" &&
    typeof record.executableName === "string"
  );
}
