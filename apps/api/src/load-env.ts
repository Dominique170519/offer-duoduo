import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Zero-dependency .env loader (no dotenv package).
 *
 * Reads KEY=VALUE lines from the repository root `.env` and, with higher
 * precedence, `apps/api/.env`. Comments (#) and blank lines are skipped,
 * surrounding quotes are stripped, and existing environment variables always
 * win. Missing files are ignored, so deployments that inject env vars
 * directly keep working untouched.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
// apps/api/src/load-env.ts -> apps/api -> repository root
const REPO_ROOT = resolve(HERE, "..", "..", "..");
const CANDIDATES = [
  resolve(REPO_ROOT, "apps", "api", ".env"),
  resolve(REPO_ROOT, ".env")
];

function parseEnvFile(path: string): void {
  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

/** Load .env files into process.env (existing env vars are not overridden). */
export function loadEnvFile(): void {
  for (const candidate of CANDIDATES) {
    if (!existsSync(candidate)) continue;
    try {
      parseEnvFile(candidate);
    } catch {
      // A malformed .env must not take the API down; ignore and continue.
    }
  }
}
