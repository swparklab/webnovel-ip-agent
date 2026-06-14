"use strict";

const { streamMessage: streamViaApi } = require("./anthropic");
const { streamMessageCli } = require("./claude-cli");

/**
 * Provider-agnostic streaming entry point.
 * `opts.provider` selects the backend: 'api' (paid key) or 'cli' (subscription).
 * All other options match streamMessage in anthropic.js.
 */
function streamMessage(opts) {
  if (opts.provider === "cli") return streamMessageCli(opts);
  return streamViaApi(opts);
}

module.exports = { streamMessage };
