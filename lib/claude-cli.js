"use strict";

const { spawn } = require("child_process");
const { config } = require("./config");

/**
 * Stream a completion through the local Claude Code CLI.
 *
 * This lets the tool run on a Pro/Max subscription instead of the paid API.
 * The CLI must be installed and logged in (`claude` → browser login, or `/login`).
 *
 * IMPORTANT: we strip ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN from the child's
 * environment. If they were present, Claude Code would prefer them and bill the
 * API per token instead of using the subscription.
 *
 * Safety: only fixed flags and a whitelisted model id are passed as args. The
 * actual prompt (which can contain user text) goes through stdin, never argv,
 * so there is no shell-injection surface even with shell:true on Windows.
 */

const KNOWN_MODELS = new Set(Object.values(config.models));

class ClaudeCliError extends Error {
  constructor(message) {
    super(message);
    this.name = "ClaudeCliError";
  }
}

function buildPrompt(system, messages) {
  const user = messages.map((m) => m.content).join("\n\n");
  // Claude Code keeps its own base system prompt; we prepend our agent role
  // as strong leading instructions so the output matches the pipeline format.
  return `${system}\n\n=====\n\n${user}`;
}

function streamMessageCli(opts) {
  const { system, messages, model, onText, signal } = opts;

  const args = [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--include-partial-messages",
  ];
  if (model && KNOWN_MODELS.has(model)) args.push("--model", model);

  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(config.claudeBin, args, {
        env,
        shell: process.platform === "win32",
        windowsHide: true,
      });
    } catch (err) {
      reject(new ClaudeCliError(`Claude Code 실행 실패: ${err.message}`));
      return;
    }

    let fullText = "";
    let usage = null;
    let stderr = "";
    let stdoutBuf = "";
    let settled = false;

    const onAbort = () => {
      try { child.kill("SIGTERM"); } catch { /* noop */ }
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }

    const cleanup = () => {
      if (signal) signal.removeEventListener("abort", onAbort);
    };

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err.code === "ENOENT") {
        reject(new ClaudeCliError(
          "Claude Code CLI를 찾을 수 없습니다. 설치 후 `claude`로 로그인하거나 CLAUDE_BIN 경로를 지정하세요.",
        ));
      } else {
        reject(new ClaudeCliError(`Claude Code 오류: ${err.message}`));
      }
    });

    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    child.stdout.on("data", (chunk) => {
      stdoutBuf += chunk.toString();
      let nl;
      while ((nl = stdoutBuf.indexOf("\n")) !== -1) {
        const line = stdoutBuf.slice(0, nl).trim();
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (!line) continue;
        let evt;
        try { evt = JSON.parse(line); } catch { continue; }

        // Partial text deltas (with --include-partial-messages).
        if (evt.type === "stream_event") {
          const e = evt.event;
          if (e?.type === "content_block_delta" && e.delta?.type === "text_delta") {
            const text = e.delta.text || "";
            fullText += text;
            if (onText && text) onText(text);
          }
          continue;
        }
        // Final result event carries the full text + usage/cost.
        if (evt.type === "result") {
          if (evt.usage) usage = evt.usage;
          if (typeof evt.total_cost_usd === "number") {
            usage = { ...(usage || {}), total_cost_usd: evt.total_cost_usd };
          }
          if (!fullText && typeof evt.result === "string") fullText = evt.result;
          if (evt.is_error || evt.subtype === "error") {
            // surfaced on close
          }
        }
      }
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (signal?.aborted) {
        const e = new Error("aborted");
        e.name = "AbortError";
        reject(e);
        return;
      }
      if (code !== 0 && !fullText) {
        const hint = /not.*log|login|authenticat|credit|subscription/i.test(stderr)
          ? " (구독 로그인이 필요할 수 있습니다: 터미널에서 `claude` 실행 후 로그인)"
          : "";
        reject(new ClaudeCliError(
          `Claude Code가 비정상 종료했습니다 (code ${code}).${hint} ${stderr.slice(0, 400)}`.trim(),
        ));
        return;
      }
      resolve({ text: fullText, usage, stopReason: null });
    });

    // Feed the prompt via stdin (no injection surface).
    child.stdin.on("error", () => { /* ignore broken pipe on abort */ });
    child.stdin.write(buildPrompt(system, messages));
    child.stdin.end();
  });
}

module.exports = { streamMessageCli, ClaudeCliError };
