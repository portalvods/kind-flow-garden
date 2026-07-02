import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

let envFileCache: Record<string, string> | null = null;

function parseEnvFile(content: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eqIndex = normalized.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = normalized.slice(0, eqIndex).trim();
    let value = normalized.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function collectEnvCandidates(): string[] {
  const roots = new Set<string>();

  try {
    roots.add(process.cwd());
  } catch {
    // ignored: some runtimes do not expose cwd
  }

  try {
    roots.add(dirname(fileURLToPath(import.meta.url)));
  } catch {
    // ignored: import.meta.url may not map to a local file in every runtime
  }

  const candidates: string[] = [];
  for (const root of roots) {
    let current = root;
    for (let i = 0; i < 6; i += 1) {
      candidates.push(join(current, ".env"));
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  return [...new Set(candidates)];
}

function readEnvFile(): Record<string, string> {
  if (envFileCache) return envFileCache;

  for (const filePath of collectEnvCandidates()) {
    try {
      if (existsSync(filePath)) {
        envFileCache = parseEnvFile(readFileSync(filePath, "utf8"));
        return envFileCache;
      }
    } catch {
      // ignored: fallback to the next candidate or process.env
    }
  }

  envFileCache = {};
  return envFileCache;
}

export function getServerEnv(name: string): string | undefined {
  const direct = process.env[name];
  if (direct && direct.trim()) return direct.trim();

  const fromFile = readEnvFile()[name];
  return fromFile && fromFile.trim() ? fromFile.trim() : undefined;
}