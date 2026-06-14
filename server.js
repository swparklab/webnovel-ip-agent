"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const { config, resolveMode, publicConfig } = require("./lib/config");
const { runPipeline } = require("./lib/orchestrator");
const { buildLocalReport, scoreInput } = require("./lib/local-engine");
const { getPlaybook, COMMON, PLATFORM_PRIORITY } = require("./lib/playbook");
const store = require("./lib/store");

const publicDir = path.join(config.rootDir, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// Order used when assembling a project into a single Markdown export.
const AGENT_ORDER = ["foresight", "world", "plot", "draft", "reader", "osmu"];

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 4_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const body = await readBody(req);
  if (!body) return {};
  return JSON.parse(body);
}

function safeStaticPath(urlPath) {
  const requested = decodeURIComponent(urlPath.split("?")[0]);
  const relative = requested === "/" ? "index.html" : requested.replace(/^\/+/, "");
  const resolved = path.resolve(publicDir, relative);
  if (resolved !== publicDir && !resolved.startsWith(publicDir + path.sep)) return null;
  return resolved;
}

function reportToMarkdown(record) {
  const input = record.input || {};
  const agents = record.report?.agents || {};
  const lines = [
    `# ${record.title || input.ipTitle || "SF WebNovel Future Agent Report"}`,
    "",
    `- 생성: ${record.report?.generatedAt || record.updatedAt || ""}`,
    `- 모델: ${record.report?.model || "—"}`,
    `- 제작도: ${record.score ?? scoreInput(input)}%`,
    "",
  ];
  AGENT_ORDER.forEach((id) => {
    const agent = agents[id];
    if (!agent) return;
    lines.push(`---`, "", `# ${agent.name}`, "", agent.text || agent.error || "", "");
  });
  return lines.join("\n");
}

/* ----------------------------- API handlers ----------------------------- */

async function handleRun(req, res) {
  const payload = await readJson(req);
  const input = payload.input || {};
  const model = payload.model || config.defaultModel;
  const score = scoreInput(input);

  // Open the SSE stream.
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const emit = (type, data) => {
    res.write(`event: ${type}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const controller = new AbortController();
  req.on("close", () => controller.abort());

  const mode = resolveMode(); // 'api' | 'cli' | 'local'
  emit("meta", { score, mode });

  try {
    if (mode === "local") {
      // No engine available: stream the deterministic fallback so the product still demos.
      const report = buildLocalReport(input);
      emit("start", {
        model: report.model,
        fallback: true,
        agents: Object.values(report.agents).map((a) => ({
          id: a.id, name: a.name, tabs: a.tabs,
        })),
      });
      for (const id of AGENT_ORDER) {
        const agent = report.agents[id];
        if (!agent) continue;
        emit("status", { agent: id, state: "running" });
        emit("delta", { agent: id, text: agent.text });
        emit("status", { agent: id, state: "done", chars: agent.text.length });
      }
      report.score = score;
      emit("done", report);
    } else {
      const report = await runPipeline(input, {
        model,
        provider: mode, // 'api' or 'cli'
        emit,
        signal: controller.signal,
      });
      report.score = score;
      // `done` already emitted by the pipeline; re-emit score-augmented final.
      emit("final", report);
    }
  } catch (err) {
    if (err?.name !== "AbortError") {
      emit("error", { message: err?.message || "파이프라인 오류" });
    }
  } finally {
    res.end();
  }
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      app: "SF WebNovel Future Agent",
      mode: resolveMode(),
      time: new Date().toISOString(),
    });
  }

  if (req.method === "GET" && pathname === "/api/config") {
    return sendJson(res, 200, { ok: true, ...publicConfig() });
  }

  if (req.method === "GET" && pathname === "/api/playbook") {
    const query = new URL(req.url, "http://localhost").searchParams;
    const genre = query.get("genre") || "aiForesight";
    return sendJson(res, 200, {
      ok: true,
      genre,
      playbook: getPlaybook(genre),
      common: {
        hitStages: COMMON.hitStages,
        designPrinciple: COMMON.designPrinciple,
        failurePatterns: COMMON.failurePatterns,
        checklist: COMMON.checklist,
      },
      platformPriority: PLATFORM_PRIORITY,
    });
  }

  if (req.method === "POST" && pathname === "/api/run") {
    return handleRun(req, res);
  }

  if (pathname === "/api/projects" && req.method === "GET") {
    return sendJson(res, 200, { ok: true, projects: store.listProjects() });
  }

  if (pathname === "/api/projects" && req.method === "POST") {
    const payload = await readJson(req);
    if (payload.score == null && payload.input) payload.score = scoreInput(payload.input);
    const record = store.saveProject(payload);
    return sendJson(res, 200, { ok: true, project: record });
  }

  const projectMatch = pathname.match(/^\/api\/projects\/([a-f0-9]+)$/i);
  if (projectMatch) {
    const id = projectMatch[1];
    if (req.method === "GET") {
      const record = store.getProject(id);
      if (!record) return sendJson(res, 404, { ok: false, error: "프로젝트를 찾을 수 없습니다." });
      return sendJson(res, 200, { ok: true, project: record });
    }
    if (req.method === "DELETE") {
      const ok = store.deleteProject(id);
      return sendJson(res, ok ? 200 : 404, { ok });
    }
  }

  if (req.method === "POST" && pathname === "/api/export") {
    const payload = await readJson(req);
    const record = payload.id ? store.getProject(payload.id) : payload;
    if (!record) return sendJson(res, 404, { ok: false, error: "내보낼 데이터가 없습니다." });
    return sendJson(res, 200, { ok: true, markdown: reportToMarkdown(record) });
  }

  return sendJson(res, 404, { ok: false, error: "API endpoint not found" });
}

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }

    const filePath = safeStaticPath(url.pathname);
    if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: error.message });
    else res.end();
  }
}

const server = http.createServer(handleRequest);

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n[오류] 포트 ${config.port} 가 이미 사용 중입니다.`);
    console.error("  다른 프로그램(이전에 띄운 서버 등)이 포트를 점유하고 있습니다.");
    console.error("  해결 1) 다른 포트로 실행:  PORT=4174 npm run dev");
    console.error("  해결 2) Windows에서 점유 프로세스 종료:");
    console.error(`           for /f \"tokens=5\" %a in ('netstat -ano ^| findstr :${config.port}') do taskkill /PID %a /F\n`);
  } else {
    console.error("[서버 오류]", err.message);
  }
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  const label = {
    api: "Claude API 연동 (토큰 과금)",
    cli: "Claude Code 구독 연동 (Max/Pro)",
    local: "로컬 폴백 (LLM 없음)",
  }[resolveMode()];
  console.log(`SF WebNovel Future Agent · ${label}`);
  console.log(`→ http://${config.host}:${config.port}`);
});

module.exports = { handleRequest, reportToMarkdown };
