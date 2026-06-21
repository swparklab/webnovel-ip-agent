"use strict";

const { AGENTS } = require("./agents");
const { PLATFORM_AGENTS } = require("./platform-intel");
const { BUSINESS_AGENTS } = require("./business-intel");
const { MEDIA_AGENTS } = require("./media-studios");
const { streamMessage } = require("./llm");
const { AnthropicError } = require("./anthropic");
const { config } = require("./config");

/**
 * Compute execution waves via dependency levels.
 * Agents in the same wave have no dependency on each other and run in parallel.
 */
function planWaves(agents) {
  const byId = Object.fromEntries(agents.map((a) => [a.id, a]));
  const level = new Map();

  function levelOf(agent) {
    if (level.has(agent.id)) return level.get(agent.id);
    if (!agent.dependsOn.length) {
      level.set(agent.id, 0);
      return 0;
    }
    const deps = agent.dependsOn
      .map((id) => byId[id])
      .filter(Boolean)
      .map((dep) => levelOf(dep));
    const lvl = Math.max(...deps, -1) + 1;
    level.set(agent.id, lvl);
    return lvl;
  }

  agents.forEach(levelOf);
  const maxLevel = Math.max(...[...level.values()]);
  const waves = Array.from({ length: maxLevel + 1 }, () => []);
  agents.forEach((agent) => waves[level.get(agent.id)].push(agent));
  return waves;
}

/**
 * Run the full agent pipeline.
 *
 * @param {object} input        The IP form input.
 * @param {object} opts
 * @param {string} [opts.model] Model id override.
 * @param {Array}  [opts.agents] Agent list to run (defaults to the production AGENTS).
 * @param {function(string, object):void} opts.emit  Event emitter (type, payload).
 * @param {AbortSignal} [opts.signal] Abort signal.
 * @returns {Promise<object>} Assembled report.
 */
async function runPipeline(input, opts) {
  const { model = config.defaultModel, provider = "api", emit, signal, agents = AGENTS } = opts;
  const waves = planWaves(agents);
  const context = {};
  const usageTotals = { input_tokens: 0, output_tokens: 0 };
  const results = {};

  emit("start", {
    model,
    agents: agents.map((a) => ({ id: a.id, name: a.name, tabs: a.tabs, icon: a.icon })),
  });

  for (const wave of waves) {
    await Promise.all(
      wave.map(async (agent) => {
        emit("status", { agent: agent.id, state: "running" });
        try {
          const { text, usage } = await streamMessage({
            provider,
            model,
            system: agent.system,
            messages: [{ role: "user", content: agent.buildUser(input, context) }],
            temperature: agent.temperature ?? 0.7,
            maxTokens: agent.maxTokens ?? config.maxOutputTokens,
            signal,
            onText: (chunk) => emit("delta", { agent: agent.id, text: chunk }),
          });

          context[agent.id] = { name: agent.name, text };
          results[agent.id] = { id: agent.id, name: agent.name, tabs: agent.tabs, text };

          if (usage) {
            usageTotals.input_tokens += usage.input_tokens || 0;
            usageTotals.output_tokens += usage.output_tokens || 0;
          }
          emit("status", { agent: agent.id, state: "done", chars: text.length });
        } catch (err) {
          const message =
            err instanceof AnthropicError
              ? `${err.message}${err.status ? ` (HTTP ${err.status})` : ""}`
              : err?.name === "AbortError"
                ? "사용자가 중단했습니다."
                : err?.message || "알 수 없는 오류";
          results[agent.id] = {
            id: agent.id,
            name: agent.name,
            tabs: agent.tabs,
            text: "",
            error: message,
          };
          emit("status", { agent: agent.id, state: "error", message });
          if (err?.name === "AbortError") throw err;
        }
      }),
    );
    if (signal?.aborted) break;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    model,
    agents: results,
    usage: usageTotals,
  };
  emit("done", report);
  return report;
}

/** Resolve an agent list by pipeline name. */
function pipelineAgents(pipeline) {
  if (pipeline === "platform") return PLATFORM_AGENTS;
  if (pipeline === "business") return BUSINESS_AGENTS;
  if (MEDIA_AGENTS[pipeline]) return MEDIA_AGENTS[pipeline]; // 매체별 전용 파이프라인(애니/영화/다큐/드라마/광고)
  return AGENTS; // 'production'(웹소설) 기본
}

module.exports = { runPipeline, planWaves, pipelineAgents };
