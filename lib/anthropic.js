"use strict";

const { config } = require("./config");

/**
 * Streaming client for the Anthropic Messages API.
 * Uses the global fetch available in Node 18+ — no SDK dependency,
 * so the project stays self-contained and easy to deploy.
 *
 * The API key lives ONLY on the server. It is never sent to the browser.
 */

class AnthropicError extends Error {
  constructor(message, status, type) {
    super(message);
    this.name = "AnthropicError";
    this.status = status;
    this.type = type;
  }
}

/**
 * Stream a single completion.
 *
 * @param {object} opts
 * @param {string} opts.system        System prompt.
 * @param {Array}  opts.messages      [{role, content}] message list.
 * @param {string} [opts.model]       Model id.
 * @param {number} [opts.maxTokens]   Max output tokens.
 * @param {number} [opts.temperature] Sampling temperature.
 * @param {function(string):void} [opts.onText] Called with each text delta.
 * @param {AbortSignal} [opts.signal] Abort signal.
 * @returns {Promise<{text:string, usage:object|null, stopReason:string|null}>}
 */
async function streamMessage(opts) {
  const {
    system,
    messages,
    model = config.defaultModel,
    maxTokens = config.maxOutputTokens,
    temperature = 0.7,
    onText,
    signal,
  } = opts;

  if (!config.anthropicApiKey) {
    throw new AnthropicError("ANTHROPIC_API_KEY is not configured.", 401, "auth");
  }

  const response = await fetch(`${config.anthropicBaseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.anthropicApiKey,
      "anthropic-version": config.anthropicVersion,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system,
      messages,
      stream: true,
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    let detail = `HTTP ${response.status}`;
    let type = "api_error";
    try {
      const errJson = await response.json();
      detail = errJson?.error?.message || detail;
      type = errJson?.error?.type || type;
    } catch {
      /* keep default detail */
    }
    throw new AnthropicError(detail, response.status, type);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let usage = null;
  let stopReason = null;

  // Parse the SSE stream line by line.
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nlIndex;
    while ((nlIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nlIndex).trim();
      buffer = buffer.slice(nlIndex + 1);
      if (!line.startsWith("data:")) continue;

      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;

      let event;
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }

      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        const chunk = event.delta.text || "";
        fullText += chunk;
        if (onText && chunk) onText(chunk);
      } else if (event.type === "message_delta") {
        if (event.usage) usage = { ...usage, ...event.usage };
        if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
      } else if (event.type === "message_start" && event.message?.usage) {
        usage = { ...event.message.usage };
      } else if (event.type === "error") {
        throw new AnthropicError(
          event.error?.message || "stream error",
          500,
          event.error?.type || "stream_error",
        );
      }
    }
  }

  return { text: fullText, usage, stopReason };
}

module.exports = { streamMessage, AnthropicError };
