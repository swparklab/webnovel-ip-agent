"use strict";

const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");

/**
 * Minimal .env loader (zero dependency).
 * Parses KEY=VALUE lines, ignores comments and blanks.
 * Does not overwrite variables already present in process.env.
 */
function loadEnvFile() {
  const envPath = path.join(rootDir, ".env");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  });
}

loadEnvFile();

// Models — keep the latest Claude family. Opus for craft, Sonnet for speed.
const MODELS = {
  quality: "claude-opus-4-8",
  balanced: "claude-sonnet-4-6",
  fast: "claude-haiku-4-5-20251001",
};

const config = {
  rootDir,
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 4173),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com",
  anthropicVersion: "2023-06-01",
  // Default model tier used by the agent pipeline.
  defaultModel: process.env.AGENT_MODEL || MODELS.quality,
  models: MODELS,
  dataDir: process.env.DATA_DIR || path.join(rootDir, "data"),
  maxOutputTokens: Number(process.env.AGENT_MAX_TOKENS || 4096),
  // Provider selection: 'auto' | 'api' | 'cli' | 'local'
  //  - api : Anthropic Messages API (per-token billing, needs ANTHROPIC_API_KEY)
  //  - cli : local Claude Code CLI logged in with a Pro/Max subscription
  //  - local: deterministic no-LLM fallback
  providerSetting: (process.env.LLM_PROVIDER || "auto").toLowerCase(),
  claudeBin: process.env.CLAUDE_BIN || "claude",
};

function hasApiKey() {
  return Boolean(config.anthropicApiKey && config.anthropicApiKey.trim());
}

// Detect a usable Claude Code CLI once, then cache the result.
let _cliCache;
function cliAvailable() {
  if (_cliCache !== undefined) return _cliCache;
  try {
    const { spawnSync } = require("child_process");
    const r = spawnSync(config.claudeBin, ["--version"], {
      shell: process.platform === "win32",
      windowsHide: true,
      timeout: 8000,
      stdio: "ignore",
    });
    _cliCache = r.status === 0;
  } catch {
    _cliCache = false;
  }
  return _cliCache;
}

/**
 * Resolve the effective engine for this run.
 * @returns {'api'|'cli'|'local'}
 */
function resolveMode() {
  const s = config.providerSetting;
  if (s === "api") return hasApiKey() ? "api" : "local";
  // Trust an explicit cli choice even if auto-detection failed; a real spawn
  // failure surfaces a clear error instead of silently falling back.
  if (s === "cli") return "cli";
  if (s === "local") return "local";
  // auto: prefer API key if present, else a logged-in Claude Code, else local.
  if (hasApiKey()) return "api";
  if (cliAvailable()) return "cli";
  return "local";
}

function publicConfig() {
  return {
    hasApiKey: hasApiKey(),
    mode: resolveMode(),
    providerSetting: config.providerSetting,
    cliAvailable: cliAvailable(),
    defaultModel: config.defaultModel,
    models: config.models,
  };
}

module.exports = { config, hasApiKey, cliAvailable, resolveMode, publicConfig, MODELS };
