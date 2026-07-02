import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
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

function readEnvFiles(): Record<string, string> {
  if (envFileCache) return envFileCache;

  const merged: Record<string, string> = {};

  for (const filePath of collectEnvCandidates()) {
    try {
      if (existsSync(filePath)) {
        const parsed = parseEnvFile(readFileSync(filePath, "utf8"));
        for (const [key, value] of Object.entries(parsed)) {
          if (value.trim()) merged[key] = value.trim();
        }
      }
    } catch {
      // ignored: fallback to the next candidate or process.env
    }
  }

  envFileCache = merged;
  return envFileCache;
}

export function getServerEnv(name: string): string | undefined {
  const direct = process.env[name];
  if (direct && direct.trim()) return direct.trim();

  const fromFile = readEnvFiles()[name];
  return fromFile && fromFile.trim() ? fromFile.trim() : undefined;
}

export function getMissingServerEnv(names: string[]): string[] {
  return names.filter((name) => !getServerEnv(name));
}

export type LocalWhatsappConfig = {
  evolution_url?: string;
  evolution_api_key?: string;
  evolution_instance?: string;
  admin_whatsapp?: string;
};

function getLocalWhatsappConfigPath(): string {
  try {
    return join(process.cwd(), ".portal-vod-whatsapp.json");
  } catch {
    return ".portal-vod-whatsapp.json";
  }
}

export function readLocalWhatsappConfig(): LocalWhatsappConfig {
  try {
    const path = getLocalWhatsappConfigPath();
    if (!existsSync(path)) return {};
    const parsed = JSON.parse(readFileSync(path, "utf8")) as LocalWhatsappConfig;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeLocalWhatsappConfig(config: LocalWhatsappConfig): boolean {
  try {
    const current = readLocalWhatsappConfig();
    const next = { ...current, ...config };
    writeFileSync(getLocalWhatsappConfigPath(), JSON.stringify(next, null, 2));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalWhatsappConfig(): boolean {
  try {
    const path = getLocalWhatsappConfigPath();
    if (existsSync(path)) unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}