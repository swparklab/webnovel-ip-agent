"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const { config, resolveMode, publicConfig } = require("./lib/config");
const { runPipeline, pipelineAgents } = require("./lib/orchestrator");
const { streamMessage } = require("./lib/llm");
const { buildIdeatePrompt, buildCompletePrompt, extractFields, localIdeate, localComplete, FIELD_KEYS } = require("./lib/ideate");
const {
  buildChapterFirstPrompt, buildChapterSecondPrompt, localChapter, MAX_CHAPTER,
} = require("./lib/chapters");
const { extractTextFromPdf } = require("./lib/pdf");
const { buildCritiquePrompt, parseCritique, localCritique } = require("./lib/critique");
const { buildSynopsisPrompt, parseMemory, localMemory, composeStorySoFar, composeCanonLock } = require("./lib/memory");
const { buildImpactPrompt, parseImpact, localImpact } = require("./lib/impact");
const { buildToolPrompt, localTool, TOOLS, MEDIA_TOOLS } = require("./lib/tools");
const { buildOutlinePrompt, parseOutline, localOutline, outlineGuideFor } = require("./lib/outline");
const { steeringTemperature, recommendedSteering } = require("./lib/steering");
const { buildWorkAuditPrompt, parseAudit, localAudit } = require("./lib/audit");
const { buildLocalReport, scoreInput } = require("./lib/local-engine");
const { buildOpsLocalReport } = require("./lib/platform-local");
const { buildBizLocalReport } = require("./lib/business-local");
const { buildMediaLocalReport } = require("./lib/media-local");
const { MEDIA_AGENTS } = require("./lib/media-studios");
const {
  buildMediaImpactPrompt, localMediaImpact,
  buildMediaCritiquePrompt, parseMediaCritique, localMediaCritique,
  buildMediaAuditPrompt, localMediaAudit,
  buildConvertPrompt, localConvert,
} = require("./lib/media-features");
const { isMedium } = require("./lib/medium");
const { designElements, recommendedDesignSpec } = require("./lib/design-spec");
const {
  buildOneSheetPrompt, parseOneSheet, localOneSheet,
  buildIntegrityPrompt, parseIntegrity, localIntegrity,
  buildContePrompt, localConte,
} = require("./lib/onesheet");
const {
  buildTechMapPrompt, parseTechMap, localTechMap,
  buildVideoPromptPrompt, localVideoPrompt,
  buildFestivalPrompt, parseFestival, localFestival,
  buildFormConvertPrompt, localFormConvert,
} = require("./lib/aifilm");
const {
  buildVisualContePrompt, localVisualConte, isVisual: isVisualMedium, AI_VIDEO_MODELS,
} = require("./lib/aianimation");
const { buildArtStylePrompt, localArtStyle } = require("./lib/artstyle");
const { buildCharSheetPrompt, parseCharSheet, localCharSheet } = require("./lib/charactersheet");
const {
  buildGuaranteePrompt, parseGuarantee, localGuarantee,
  buildUpgradeBrief, scoreGuarantee,
} = require("./lib/media-guarantee");
const { getPlaybook, COMMON, PLATFORM_PRIORITY } = require("./lib/playbook");
const {
  PLATFORMS, TAXONOMY, PERSONAS, KR_SF_OVERLAY, REACTION_AXES,
  SUCCESS_FORMULA, FAILURE_FORMULA,
} = require("./lib/platform-intel");
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
const OPS_AGENT_ORDER = ["tagger", "reaction", "fit", "packaging", "strategy"];
const BIZ_AGENT_ORDER = ["revenue", "osmuRoad", "rights", "valuation", "pitch"];

// 파이프라인별 메타: 실행 순서 · 로컬 폴백 빌더 · 제작도 점수 부여 여부.
const PIPELINES = {
  production: { order: AGENT_ORDER, local: buildLocalReport, scored: true },
  platform: { order: OPS_AGENT_ORDER, local: buildOpsLocalReport, scored: false },
  business: { order: BIZ_AGENT_ORDER, local: buildBizLocalReport, scored: false },
};

// 매체별 전용 파이프라인(애니/영화/다큐/드라마/광고)을 자동 등록한다.
// order는 각 매체 에이전트의 id 순서, local은 매체 결정론 폴백.
Object.keys(MEDIA_AGENTS).forEach((medium) => {
  PIPELINES[medium] = {
    order: MEDIA_AGENTS[medium].map((a) => a.id),
    local: (input) => buildMediaLocalReport(medium, input),
    scored: false,
  };
});

// Resolve the export/iteration order for whichever pipeline produced a report.
// 각 파이프라인의 에이전트 id 집합은 서로 겹치지 않으므로, 리포트에 존재하는
// id로 파이프라인을 역추론한다(매체 파이프라인 포함).
function orderFor(record) {
  const agents = record?.report?.agents || record?.agents || {};
  for (const meta of Object.values(PIPELINES)) {
    if (meta !== PIPELINES.production && meta.order.some((id) => id in agents)) {
      return meta.order;
    }
  }
  return AGENT_ORDER;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readBody(req, maxBytes = 4_000_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function readJson(req, maxBytes) {
  const body = await readBody(req, maxBytes);
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
    `# ${record.title || input.ipTitle || "웹소설 IP 에이전트 리포트"}`,
    "",
    `- 생성: ${record.report?.generatedAt || record.updatedAt || ""}`,
    `- 모델: ${record.report?.model || "—"}`,
    `- 제작도: ${record.score ?? scoreInput(input)}%`,
    "",
  ];
  orderFor(record).forEach((id) => {
    const agent = agents[id];
    if (!agent) return;
    lines.push(`---`, "", `# ${agent.name}`, "", agent.text || agent.error || "", "");
  });

  // 연속 회차 원고(2화 이후 등)가 있으면 이어서 붙인다.
  const chapters = record.report?.chapters || record.chapters;
  if (chapters && typeof chapters === "object") {
    const nums = Object.keys(chapters).map(Number).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
    if (nums.length) {
      lines.push(`---`, "", `# 연속 원고 (회차별)`, "");
      nums.forEach((n) => {
        const text = chapters[n];
        if (text && String(text).trim()) lines.push(String(text), "");
      });
    }
  }
  return lines.join("\n");
}

/* ---- 공통 SSE 스트리밍 헬퍼: JSON 응답 대신 SSE로 텍스트를 실시간 전달한다. ----
 * 사용: handleTool / handleSample / handleOutline 처럼 LLM 생성이 길어
 * HTTP 응답 지연이 체감되는 단발 엔드포인트에 적용.
 * 이벤트: delta(text), done(full) — 클라이언트는 delta를 이어붙이고 done에서 확정.
 */
function streamingReply(res, req) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const emit = (type, data) => { res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`); };
  const controller = new AbortController();
  req.on("close", () => controller.abort());
  return { emit, signal: controller.signal };
}

/* ----------------------------- API handlers ----------------------------- */

async function handleRun(req, res) {
  const payload = await readJson(req);
  const input = payload.input || {};
  const model = payload.model || config.defaultModel;
  const pipeline = PIPELINES[payload.pipeline] ? payload.pipeline : "production";
  const meta = PIPELINES[pipeline];
  const order = meta.order;
  // 제작도 점수는 제작실 입력에만 의미가 있다. 운영실·사업실은 0으로 둔다.
  const score = meta.scored ? scoreInput(input) : 0;

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
      const report = meta.local(input);
      emit("start", {
        model: report.model,
        fallback: true,
        agents: Object.values(report.agents).map((a) => ({
          id: a.id, name: a.name, tabs: a.tabs,
        })),
      });
      for (const id of order) {
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
        agents: pipelineAgents(pipeline),
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

// 과학 근거 자료 업로드: PDF/텍스트 → 추출 텍스트. (생성 프롬프트의 '과학적 근거'로 주입)
const REF_TEXT_CAP = 20000; // 자료당 저장 상한
async function handleReference(req, res) {
  let payload;
  try {
    const body = await readBody(req, 16_000_000); // base64 업로드 여유 (~12MB 파일)
    payload = body ? JSON.parse(body) : {};
  } catch {
    return sendJson(res, 413, { ok: false, error: "파일이 너무 큽니다(최대 약 12MB)." });
  }
  const name = String(payload.name || "reference").slice(0, 120);
  let text = "";
  try {
    if (payload.kind === "pdf" && payload.dataBase64) {
      const buf = Buffer.from(payload.dataBase64, "base64");
      text = buf.slice(0, 5).toString("latin1") === "%PDF-"
        ? extractTextFromPdf(buf)
        : buf.toString("utf8");
    } else if (typeof payload.text === "string") {
      text = payload.text;
    }
  } catch (err) {
    return sendJson(res, 200, { ok: false, error: `자료 처리 실패: ${err.message}` });
  }
  text = text.replace(/\u0000/g, "").trim();
  const capped = text.slice(0, REF_TEXT_CAP);
  return sendJson(res, 200, {
    ok: true,
    name,
    chars: text.length,
    truncated: text.length > REF_TEXT_CAP,
    text: capped,
    preview: capped.slice(0, 280),
    weak: capped.length < 200, // 추출이 빈약하면(스캔 PDF 등) 경고용
  });
}

// 완성도 심사: 작품 발췌(digest)를 공모전 본심 기준으로 심사. SSE 아님.
async function handleAudit(req, res) {
  const payload = await readJson(req, 8_000_000);
  const input = payload.input || {};
  const digest = String(payload.digest || "");
  const model = payload.model || config.defaultModel;
  if (!digest.trim()) return sendJson(res, 400, { ok: false, error: "심사할 원고가 없습니다." });

  const mode = resolveMode();
  if (mode === "local") {
    return sendJson(res, 200, { ok: true, audit: localAudit(input, digest) });
  }
  try {
    const { system, user } = buildWorkAuditPrompt({ input, digest });
    const { text } = await streamMessage({
      provider: mode, model, system,
      messages: [{ role: "user", content: user }],
      temperature: 0.45, maxTokens: 2600,
    });
    const audit = parseAudit(text);
    if (!audit) return sendJson(res, 200, { ok: true, audit: localAudit(input, digest), note: "파싱 실패로 폴백" });
    return sendJson(res, 200, { ok: true, audit });
  } catch (err) {
    return sendJson(res, 200, { ok: true, audit: localAudit(input, digest), note: err?.message });
  }
}

// 회차 자체 피드백: 한 회차를 평가하고 수정 지시(JSON)를 반환. SSE 아님.
async function handleCritique(req, res) {
  const payload = await readJson(req);
  const input = payload.input || {};
  const n = Math.max(1, Number(payload.n) || 1);
  const chapterText = String(payload.chapterText || "");
  const model = payload.model || config.defaultModel;
  const ctx = payload.ctx || {};
  if (!chapterText.trim()) return sendJson(res, 400, { ok: false, error: "평가할 원고가 없습니다." });

  const mode = resolveMode();
  if (mode === "local") {
    return sendJson(res, 200, { ok: true, n, critique: localCritique(input, n, chapterText) });
  }
  try {
    const { system, user } = buildCritiquePrompt({ input, n, chapterText, ctx });
    const { text } = await streamMessage({
      provider: mode, model, system,
      messages: [{ role: "user", content: user }],
      temperature: 0.4, maxTokens: 1500,
    });
    const critique = parseCritique(text);
    if (!critique) return sendJson(res, 200, { ok: true, n, critique: localCritique(input, n, chapterText), note: "파싱 실패로 폴백" });
    return sendJson(res, 200, { ok: true, n, critique });
  } catch (err) {
    return sendJson(res, 200, { ok: true, n, critique: localCritique(input, n, chapterText), note: err?.message });
  }
}

// 시즌 아웃라인: 완결 화수 → 기승전결 + 도파민 비트(JSON). 단발 응답.
async function handleOutline(req, res) {
  const payload = await readJson(req);
  const input = payload.input || {};
  const total = Math.max(5, Math.min(MAX_CHAPTER, Number(payload.total) || 25));
  const model = payload.model || config.defaultModel;

  const provider = resolveMode();
  if (provider === "local") {
    return sendJson(res, 200, { ok: true, fallback: true, outline: localOutline({ input, total }) });
  }
  try {
    const { system, user } = buildOutlinePrompt({ input, total });
    const { text } = await streamMessage({
      provider, model, system,
      messages: [{ role: "user", content: user }],
      temperature: 0.7, maxTokens: 3000,
    });
    const outline = parseOutline(text, total);
    if (!outline) return sendJson(res, 200, { ok: true, fallback: true, outline: localOutline({ input, total }), note: "파싱 실패로 폴백" });
    return sendJson(res, 200, { ok: true, outline });
  } catch (err) {
    return sendJson(res, 200, { ok: true, fallback: true, outline: localOutline({ input, total }), note: err?.message });
  }
}

// 방향 비교용 1화 도입부 샘플 생성(가중치 주입). 짧은 단발 응답.
async function handleSample(req, res) {
  const payload = await readJson(req);
  const input = payload.input || {};
  const model = payload.model || config.defaultModel;

  const provider = resolveMode();
  const localSample = () => {
    const hero = String(input.protagonist || "주인공").split(/[,，(]/)[0].trim() || "주인공";
    return `${input.logline || `${hero}의 평범한 하루가 한순간에 무너졌다.`}\n\n${hero}은(는) 숨을 골랐다. 돌이킬 수 없는 일이 막 시작되려 하고 있었다.\n\n> (로컬 폴백 미리보기 — 키/구독 연결 시 실제 도입부가 생성됩니다.)`;
  };
  // SSE 스트리밍으로 전환: cli 모드에서 응답 대기 체감을 없앤다.
  const { emit, signal } = streamingReply(res, req);
  if (provider === "local") {
    const s = localSample(); emit("delta", { text: s }); emit("done", { ok: true, fallback: true, sample: s }); res.end(); return;
  }
  try {
    const system = `너는 웹소설 본문 작가다. 아래 작품의 '1화 도입부(첫 장면)'를 약 500자로 쓴다. 강렬한 훅으로 시작하고, 설정을 나열하지 말고 장면·대사·내면으로 보여준다. 위 '서사 가중치'가 있으면 그 비중대로 톤·속도·강조를 맞춘다. 한국어, 본문만.`;
    const user = `${buildInputBlock(input)}\n\n위 작품의 1화 도입부 첫 장면을 약 500자로 써라.`;
    let acc = "";
    const { text } = await streamMessage({
      provider, model, system, signal,
      messages: [{ role: "user", content: user }],
      temperature: steeringTemperature(input.steering, 0.85), maxTokens: 1200,
      onText: (chunk) => { acc += chunk; emit("delta", { text: chunk }); },
    });
    const full = (text || acc).trim() || localSample();
    emit("done", { ok: true, sample: full });
  } catch (err) {
    if (err?.name !== "AbortError") { const s = localSample(); emit("done", { ok: true, fallback: true, sample: s, note: err?.message }); }
  } finally { res.end(); }
}

// AI 글쓰기 도구: SSE 스트리밍으로 실시간 전달 (cli 응답 대기 체감 제거).
async function handleTool(req, res) {
  const payload = await readJson(req);
  const tool = String(payload.tool || "");
  const text = String(payload.text || "");
  const mode = payload.mode || "";
  const ctx = payload.ctx || {};
  const model = payload.model || config.defaultModel;
  const toolDef = TOOLS[tool] || MEDIA_TOOLS[tool];
  if (!toolDef) return sendJson(res, 400, { ok: false, error: "알 수 없는 도구입니다." });
  if (toolDef.needsText && !text.trim()) return sendJson(res, 400, { ok: false, error: "내용을 입력하세요." });

  const provider = resolveMode();
  const { emit, signal } = streamingReply(res, req);
  if (provider === "local") {
    const r = localTool({ tool, text, mode }); emit("delta", { text: r }); emit("done", { ok: true, fallback: true, result: r }); res.end(); return;
  }
  try {
    const { system, user } = buildToolPrompt({ tool, text, mode, ctx });
    let acc = "";
    const { text: out } = await streamMessage({
      provider, model, system, signal,
      messages: [{ role: "user", content: user }],
      temperature: 0.8, maxTokens: 1800,
      onText: (chunk) => { acc += chunk; emit("delta", { text: chunk }); },
    });
    const full = (out || acc).trim() || localTool({ tool, text, mode });
    emit("done", { ok: true, result: full });
  } catch (err) {
    if (err?.name !== "AbortError") { const r = localTool({ tool, text, mode }); emit("done", { ok: true, fallback: true, result: r, note: err?.message }); }
  } finally { res.end(); }
}

// AI 임팩트 리포트: 날것 아이디어 → Before/After 진단(JSON). 솔루션 가치를 체감시킨다. SSE 아님.
async function handleImpact(req, res) {
  const payload = await readJson(req);
  const idea = String(payload.idea || "").trim();
  const input = payload.input || {};
  const genre = payload.genre || input.genre || "aiForesight";
  const subgenre = payload.subgenre || input.subgenre || "";
  const model = payload.model || config.defaultModel;
  // 매체(전용 파이프라인)면 그 매체 기준으로 Before/After를 진단한다.
  const medium = payload.medium || input.medium || "webnovel";
  const format = payload.format || input.format || "medium";
  const isMedia = isMedium(medium) && medium !== "webnovel";
  if (!idea && !input.logline && !input.sfPremise) {
    return sendJson(res, 400, { ok: false, error: "진단할 아이디어를 입력하세요." });
  }
  const localFb = () => (isMedia ? localMediaImpact(idea, input, medium, format) : localImpact(idea, input, genre, subgenre));

  const mode = resolveMode();
  if (mode === "local") {
    return sendJson(res, 200, { ok: true, fallback: true, impact: localFb() });
  }
  try {
    const { system, user } = isMedia
      ? buildMediaImpactPrompt(idea, input, medium, format)
      : buildImpactPrompt(idea, input, genre, subgenre);
    const { text } = await streamMessage({
      provider: mode, model, system,
      messages: [{ role: "user", content: user }],
      temperature: 0.6, maxTokens: 2200,
    });
    const impact = parseImpact(text);
    if (!impact) return sendJson(res, 200, { ok: true, fallback: true, impact: localFb(), note: "파싱 실패로 폴백" });
    return sendJson(res, 200, { ok: true, impact });
  } catch (err) {
    return sendJson(res, 200, { ok: true, fallback: true, impact: localFb(), note: err?.message });
  }
}

// 매체 산출물 자가비평: 한 산출물(특히 ★연출 설계)을 성공방정식·연출 기준으로 채점. SSE 아님.
async function handleMediaCritique(req, res) {
  const payload = await readJson(req, 8_000_000);
  const input = payload.input || {};
  const medium = payload.medium || input.medium || "film";
  const format = payload.format || input.format || "medium";
  const targetName = String(payload.targetName || "산출물");
  const text = String(payload.text || "");
  const model = payload.model || config.defaultModel;
  if (!text.trim()) return sendJson(res, 400, { ok: false, error: "평가할 산출물이 없습니다." });

  const mode = resolveMode();
  if (mode === "local") {
    return sendJson(res, 200, { ok: true, critique: localMediaCritique(input, medium, format, text) });
  }
  try {
    const { system, user } = buildMediaCritiquePrompt({ input, medium, format, targetName, text });
    const { text: out } = await streamMessage({
      provider: mode, model, system,
      messages: [{ role: "user", content: user }],
      temperature: 0.4, maxTokens: 1500,
    });
    const critique = parseMediaCritique(out);
    if (!critique) return sendJson(res, 200, { ok: true, critique: localMediaCritique(input, medium, format, text), note: "파싱 실패로 폴백" });
    return sendJson(res, 200, { ok: true, critique });
  } catch (err) {
    return sendJson(res, 200, { ok: true, critique: localMediaCritique(input, medium, format, text), note: err?.message });
  }
}

// 매체 완성도 심사: 전체 산출물 발췌를 매체 루브릭으로 채점. SSE 아님.
async function handleMediaAudit(req, res) {
  const payload = await readJson(req, 8_000_000);
  const input = payload.input || {};
  const medium = payload.medium || input.medium || "film";
  const format = payload.format || input.format || "medium";
  const digest = String(payload.digest || "");
  const model = payload.model || config.defaultModel;
  if (!digest.trim()) return sendJson(res, 400, { ok: false, error: "심사할 산출물이 없습니다." });

  const mode = resolveMode();
  if (mode === "local") {
    return sendJson(res, 200, { ok: true, audit: localMediaAudit(input, medium, format, digest) });
  }
  try {
    const { system, user } = buildMediaAuditPrompt({ input, medium, format, digest });
    const { text } = await streamMessage({
      provider: mode, model, system,
      messages: [{ role: "user", content: user }],
      temperature: 0.45, maxTokens: 2600,
    });
    const audit = parseAudit(text); // 같은 스키마(dimensions/fatalWeaknesses/...) 재사용
    if (!audit) return sendJson(res, 200, { ok: true, audit: localMediaAudit(input, medium, format, digest), note: "파싱 실패로 폴백" });
    return sendJson(res, 200, { ok: true, audit });
  } catch (err) {
    return sendJson(res, 200, { ok: true, audit: localMediaAudit(input, medium, format, digest), note: err?.message });
  }
}

// 캐릭터 시트 고정: 디자인 시트 + 재사용 CHARACTER LOCK 토큰 + 모델별 일관성 고정법. JSON.
async function handleCharSheet(req, res) {
  const payload = await readJson(req, 8_000_000);
  const input = payload.input || {};
  const oneSheet = payload.oneSheet || input.oneSheet || null;
  const targetModel = payload.targetModel || input.videoModel || "kling";
  const styleCore = String(payload.styleCore || "");
  const model = payload.model || config.defaultModel;
  const mode = resolveMode();
  if (mode === "local") return sendJson(res, 200, { ok: true, charsheet: localCharSheet({ input, oneSheet, styleCore, targetModel }) });
  try {
    const { system, user } = buildCharSheetPrompt({ input, oneSheet, styleCore, targetModel });
    const { text } = await streamMessage({ provider: mode, model, system, messages: [{ role: "user", content: user }], temperature: 0.5, maxTokens: 1400 });
    const cs = parseCharSheet(text);
    return sendJson(res, 200, { ok: true, charsheet: cs || localCharSheet({ input, oneSheet, styleCore, targetModel }), note: cs ? undefined : "파싱 실패로 폴백" });
  } catch (err) { return sendJson(res, 200, { ok: true, charsheet: localCharSheet({ input, oneSheet, styleCore, targetModel }), note: err?.message }); }
}

// 그림풍 추천: 작품에 알맞은 A/B/C 화풍 + 스타일별 생성 프롬프트(키비주얼·캐릭터·장면). SSE.
async function handleArtStyle(req, res) {
  const payload = await readJson(req, 8_000_000);
  const input = payload.input || {};
  const oneSheet = payload.oneSheet || input.oneSheet || null;
  const format = payload.format || input.format || "medium";
  const targetModel = payload.targetModel || input.videoModel || "kling";
  const model = payload.model || config.defaultModel;
  const provider = resolveMode();
  const { emit, signal } = streamingReply(res, req);
  if (provider === "local") { const s = localArtStyle({ input, oneSheet, format, targetModel }); emit("delta", { text: s }); emit("done", { ok: true, fallback: true, result: s }); res.end(); return; }
  try {
    const { system, user } = buildArtStylePrompt({ input, oneSheet, format, targetModel });
    let acc = "";
    const { text } = await streamMessage({ provider, model, system, signal, messages: [{ role: "user", content: user }], temperature: 0.7, maxTokens: 4000, onText: (c) => { acc += c; emit("delta", { text: c }); } });
    emit("done", { ok: true, result: (text || acc).trim() || localArtStyle({ input, oneSheet, format, targetModel }) });
  } catch (err) { if (err?.name !== "AbortError") { const s = localArtStyle({ input, oneSheet, format, targetModel }); emit("done", { ok: true, fallback: true, result: s, note: err?.message }); } } finally { res.end(); }
}

// Tech-to-Story Mapper: AI 제약 → 서사 장치, AI 강점 → 메타포. JSON.
async function handleTechMap(req, res) {
  const payload = await readJson(req);
  const input = payload.input || {};
  const medium = payload.medium || input.medium || "film";
  const idea = String(payload.idea || input.logline || "");
  const model = payload.model || config.defaultModel;
  const mode = resolveMode();
  if (mode === "local") return sendJson(res, 200, { ok: true, techmap: localTechMap({ input, medium, idea }) });
  try {
    const { system, user } = buildTechMapPrompt({ input, medium, idea });
    const { text } = await streamMessage({ provider: mode, model, system, messages: [{ role: "user", content: user }], temperature: 0.6, maxTokens: 1800 });
    const techmap = parseTechMap(text);
    return sendJson(res, 200, { ok: true, techmap: techmap || localTechMap({ input, medium, idea }), note: techmap ? undefined : "파싱 실패로 폴백" });
  } catch (err) { return sendJson(res, 200, { ok: true, techmap: localTechMap({ input, medium, idea }), note: err?.message }); }
}

// Festival Taste Alignment: AI 영화제 예술성·독창성 + 심사위원 공감대 리뷰. JSON.
async function handleFestival(req, res) {
  const payload = await readJson(req, 8_000_000);
  const input = payload.input || {};
  const medium = payload.medium || input.medium || "film";
  const festival = payload.festival || "general";
  const digest = String(payload.digest || "");
  const model = payload.model || config.defaultModel;
  if (!digest.trim()) return sendJson(res, 400, { ok: false, error: "감수할 작품 발췌가 없습니다." });
  const mode = resolveMode();
  if (mode === "local") return sendJson(res, 200, { ok: true, festival: localFestival({ input, festival }) });
  try {
    const { system, user } = buildFestivalPrompt({ input, medium, digest, festival });
    const { text } = await streamMessage({ provider: mode, model, system, messages: [{ role: "user", content: user }], temperature: 0.5, maxTokens: 2000 });
    const f = parseFestival(text);
    return sendJson(res, 200, { ok: true, festival: f || localFestival({ input, festival }), note: f ? undefined : "파싱 실패로 폴백" });
  } catch (err) { return sendJson(res, 200, { ok: true, festival: localFestival({ input, festival }), note: err?.message }); }
}

// Cinematic Prompt Generator: 씬별 시나리오 + 영어 영상 생성 프롬프트. SSE.
async function handleVideoPrompt(req, res) {
  const payload = await readJson(req, 8_000_000);
  const input = payload.input || {};
  const medium = payload.medium || input.medium || "film";
  const format = payload.format || input.format || "medium";
  const digest = String(payload.digest || "");
  const model = payload.model || config.defaultModel;
  const provider = resolveMode();
  const { emit, signal } = streamingReply(res, req);
  if (provider === "local") { const s = localVideoPrompt({ input, medium }); emit("delta", { text: s }); emit("done", { ok: true, fallback: true, result: s }); res.end(); return; }
  try {
    const { system, user } = buildVideoPromptPrompt({ input, medium, digest, format });
    let acc = "";
    const { text } = await streamMessage({ provider, model, system, signal, messages: [{ role: "user", content: user }], temperature: 0.6, maxTokens: 4000, onText: (c) => { acc += c; emit("delta", { text: c }); } });
    emit("done", { ok: true, result: (text || acc).trim() || localVideoPrompt({ input, medium }) });
  } catch (err) { if (err?.name !== "AbortError") { const s = localVideoPrompt({ input, medium }); emit("done", { ok: true, fallback: true, result: s, note: err?.message }); } } finally { res.end(); }
}

// Novel ↔ Script 쌍방향 전환. SSE.
async function handleFormConvert(req, res) {
  const payload = await readJson(req, 8_000_000);
  const input = payload.input || {};
  const medium = payload.medium || input.medium || "film";
  const text = String(payload.text || "");
  const from = payload.from || "novel";
  const to = payload.to || "script";
  const model = payload.model || config.defaultModel;
  const provider = resolveMode();
  const { emit, signal } = streamingReply(res, req);
  if (provider === "local") { const s = localFormConvert({ text, to }); emit("delta", { text: s }); emit("done", { ok: true, fallback: true, result: s }); res.end(); return; }
  try {
    const { system, user } = buildFormConvertPrompt({ input, text, from, to, medium });
    let acc = "";
    const { text: out } = await streamMessage({ provider, model, system, signal, messages: [{ role: "user", content: user }], temperature: 0.7, maxTokens: 3000, onText: (c) => { acc += c; emit("delta", { text: c }); } });
    emit("done", { ok: true, result: (out || acc).trim() || localFormConvert({ text, to }) });
  } catch (err) { if (err?.name !== "AbortError") { const s = localFormConvert({ text, to }); emit("done", { ok: true, fallback: true, result: s, note: err?.message }); } } finally { res.end(); }
}

// 감독 원시트 생성: 아이디어 → 12블록 원시트(JSON). 전 매체·장르. SSE 아님.
async function handleOneSheet(req, res) {
  const payload = await readJson(req, 8_000_000);
  const input = payload.input || {};
  const medium = payload.medium || input.medium || "film";
  const genre = payload.genre || input.genre || "";
  const format = payload.format || input.format || "medium";
  const model = payload.model || config.defaultModel;

  const mode = resolveMode();
  if (mode === "local") {
    return sendJson(res, 200, { ok: true, fallback: true, onesheet: localOneSheet({ input, medium, genre, format }) });
  }
  try {
    const { system, user } = buildOneSheetPrompt({ input, medium, genre, format });
    const { text } = await streamMessage({
      provider: mode, model, system,
      messages: [{ role: "user", content: user }],
      temperature: 0.6, maxTokens: 3200,
    });
    const onesheet = parseOneSheet(text);
    if (!onesheet) return sendJson(res, 200, { ok: true, fallback: true, onesheet: localOneSheet({ input, medium, genre, format }), note: "파싱 실패로 폴백" });
    return sendJson(res, 200, { ok: true, onesheet });
  } catch (err) {
    return sendJson(res, 200, { ok: true, fallback: true, onesheet: localOneSheet({ input, medium, genre, format }), note: err?.message });
  }
}

// 서사 무결성 심사: 원시트 LOCK 기준 100점 채점 + 게이트. 전 매체·장르. SSE 아님.
async function handleIntegrity(req, res) {
  const payload = await readJson(req, 8_000_000);
  const input = payload.input || {};
  const medium = payload.medium || input.medium || "film";
  const oneSheet = payload.oneSheet || input.oneSheet || null;
  const digest = String(payload.digest || "");
  const model = payload.model || config.defaultModel;
  if (!digest.trim()) return sendJson(res, 400, { ok: false, error: "심사할 산출물이 없습니다." });

  const mode = resolveMode();
  if (mode === "local") {
    return sendJson(res, 200, { ok: true, integrity: localIntegrity(input, medium, oneSheet, digest) });
  }
  try {
    const { system, user } = buildIntegrityPrompt({ input, medium, oneSheet, digest });
    const { text } = await streamMessage({
      provider: mode, model, system,
      messages: [{ role: "user", content: user }],
      temperature: 0.4, maxTokens: 1600,
    });
    const integrity = parseIntegrity(text);
    if (!integrity) return sendJson(res, 200, { ok: true, integrity: localIntegrity(input, medium, oneSheet, digest), note: "파싱 실패로 폴백" });
    return sendJson(res, 200, { ok: true, integrity });
  } catch (err) {
    return sendJson(res, 200, { ok: true, integrity: localIntegrity(input, medium, oneSheet, digest), note: err?.message });
  }
}

// 콘티 + 6층 프롬프트 컴파일: 원시트 LOCK 기준 컷별 콘티·프롬프트 팩. SSE 스트리밍.
async function handleConte(req, res) {
  const payload = await readJson(req, 8_000_000);
  const input = payload.input || {};
  const medium = payload.medium || input.medium || "film";
  const oneSheet = payload.oneSheet || input.oneSheet || null;
  const format = payload.format || input.format || "medium";
  const targetModel = payload.targetModel || input.videoModel || "kling";
  const reviseNotes = payload.reviseNotes || ""; // 🔁 피드백 루프 보완 지시
  const model = payload.model || config.defaultModel;
  // 시각 매체(애니/영화 등)는 5~15초 클립 단위 '내용 + 생성 프롬프트 페어'(모델 최적화), 텍스트 매체는 장면 콘티.
  const visual = isVisualMedium(medium);

  const provider = resolveMode();
  const { emit, signal } = streamingReply(res, req);
  if (provider === "local") {
    const s = visual ? localVisualConte({ input, medium, oneSheet, format, targetModel }) : localConte({ input, medium, oneSheet, format });
    emit("delta", { text: s }); emit("done", { ok: true, fallback: true, result: s }); res.end(); return;
  }
  try {
    const { system, user } = visual
      ? buildVisualContePrompt({ input, medium, oneSheet, format, targetModel, reviseNotes })
      : buildContePrompt({ input, medium, oneSheet, format });
    let acc = "";
    const { text } = await streamMessage({
      provider, model, system, signal,
      messages: [{ role: "user", content: user }],
      temperature: 0.6, maxTokens: 4000,
      onText: (chunk) => { acc += chunk; emit("delta", { text: chunk }); },
    });
    const fb = () => (visual ? localVisualConte({ input, medium, oneSheet, format, targetModel }) : localConte({ input, medium, oneSheet, format }));
    const full = (text || acc).trim() || fb();
    emit("done", { ok: true, result: full });
  } catch (err) {
    if (err?.name !== "AbortError") { const s = (visual ? localVisualConte({ input, medium, oneSheet, format, targetModel }) : localConte({ input, medium, oneSheet, format })); emit("done", { ok: true, fallback: true, result: s, note: err?.message }); }
  } finally { res.end(); }
}

// 흥행 보증서: 전체 산출물 발췌를 매체 승리 조건으로 채점·증명. SSE 아님.
async function handleMediaGuarantee(req, res) {
  const payload = await readJson(req, 8_000_000);
  const input = payload.input || {};
  const medium = payload.medium || input.medium || "film";
  const format = payload.format || input.format || "medium";
  const digest = String(payload.digest || "");
  const model = payload.model || config.defaultModel;
  if (!digest.trim()) return sendJson(res, 400, { ok: false, error: "보증할 산출물이 없습니다." });

  const mode = resolveMode();
  // 결정론 보증 점수는 항상 함께 싣는다(투명성).
  const signal = scoreGuarantee(digest, medium);
  if (mode === "local") {
    return sendJson(res, 200, { ok: true, guarantee: localGuarantee(input, medium, format, digest), signal });
  }
  try {
    const { system, user } = buildGuaranteePrompt({ input, medium, format, digest });
    const { text } = await streamMessage({
      provider: mode, model, system,
      messages: [{ role: "user", content: user }],
      temperature: 0.4, maxTokens: 2600,
    });
    const guarantee = parseGuarantee(text, medium);
    if (!guarantee) return sendJson(res, 200, { ok: true, guarantee: localGuarantee(input, medium, format, digest), signal, note: "파싱 실패로 폴백" });
    return sendJson(res, 200, { ok: true, guarantee, signal });
  } catch (err) {
    return sendJson(res, 200, { ok: true, guarantee: localGuarantee(input, medium, format, digest), signal, note: err?.message });
  }
}

// 약한 입력 → 흥행급 북극성 브리프 업그레이드. SSE 아님(짧음).
async function handleMediaUpgrade(req, res) {
  const payload = await readJson(req);
  const input = payload.input || {};
  const medium = payload.medium || input.medium || "film";
  const format = payload.format || input.format || "medium";
  const model = payload.model || config.defaultModel;

  const mode = resolveMode();
  const localBrief = () => `## 흥행급 한 줄\n- ${String(input.logline || input.ipTitle || "이 아이디어").trim()} — 승리 조건을 모두 갖춘 버전.\n\n> (로컬 폴백. 키/구독 연결 시 실제 업그레이드 브리프가 생성됩니다.)`;
  if (mode === "local") {
    return sendJson(res, 200, { ok: true, fallback: true, brief: localBrief() });
  }
  try {
    const { system, user } = buildUpgradeBrief(input, medium, format);
    const { text } = await streamMessage({
      provider: mode, model, system,
      messages: [{ role: "user", content: user }],
      temperature: 0.7, maxTokens: 1600,
    });
    const brief = (text || "").trim() || localBrief();
    return sendJson(res, 200, { ok: true, brief });
  } catch (err) {
    return sendJson(res, 200, { ok: true, fallback: true, brief: localBrief(), note: err?.message });
  }
}

// 크로스미디어 변환: 현재 IP를 다른 매체로 재기획. SSE 스트리밍.
async function handleConvert(req, res) {
  const payload = await readJson(req, 8_000_000);
  const input = payload.input || {};
  const fromMedium = payload.fromMedium || input.medium || "webnovel";
  const toMedium = payload.toMedium || "film";
  const format = payload.format || input.format || "medium";
  const digest = String(payload.digest || "");
  const model = payload.model || config.defaultModel;

  const provider = resolveMode();
  const { emit, signal } = streamingReply(res, req);
  if (provider === "local") {
    const s = localConvert({ input, fromMedium, toMedium, format });
    emit("delta", { text: s }); emit("done", { ok: true, fallback: true, result: s }); res.end(); return;
  }
  try {
    const { system, user } = buildConvertPrompt({ input, fromMedium, toMedium, format, digest });
    let acc = "";
    const { text } = await streamMessage({
      provider, model, system, signal,
      messages: [{ role: "user", content: user }],
      temperature: 0.7, maxTokens: 3000,
      onText: (chunk) => { acc += chunk; emit("delta", { text: chunk }); },
    });
    const full = (text || acc).trim() || localConvert({ input, fromMedium, toMedium, format });
    emit("done", { ok: true, result: full });
  } catch (err) {
    if (err?.name !== "AbortError") { const s = localConvert({ input, fromMedium, toMedium, format }); emit("done", { ok: true, fallback: true, result: s, note: err?.message }); }
  } finally { res.end(); }
}

// 연재 메모리: 한 회차 원고 → 구조화 요약(JSON). 다음 회차의 연속성 컨텍스트로 누적된다. SSE 아님.
async function handleSynopsis(req, res) {
  const payload = await readJson(req, 8_000_000);
  const input = payload.input || {};
  const n = Math.max(1, Number(payload.n) || 1);
  const total = Math.max(1, Number(payload.total) || 25);
  const chapterText = String(payload.chapterText || "");
  const model = payload.model || config.defaultModel;
  if (!chapterText.trim()) return sendJson(res, 400, { ok: false, error: "요약할 원고가 없습니다." });

  const mode = resolveMode();
  if (mode === "local") {
    return sendJson(res, 200, { ok: true, n, memory: localMemory(input, n, chapterText) });
  }
  try {
    const { system, user } = buildSynopsisPrompt({ input, n, chapterText, total });
    const { text } = await streamMessage({
      provider: mode, model, system,
      messages: [{ role: "user", content: user }],
      temperature: 0.2, maxTokens: 1200,
    });
    const memory = parseMemory(text);
    if (!memory) return sendJson(res, 200, { ok: true, n, memory: localMemory(input, n, chapterText), note: "파싱 실패로 폴백" });
    return sendJson(res, 200, { ok: true, n, memory });
  } catch (err) {
    return sendJson(res, 200, { ok: true, n, memory: localMemory(input, n, chapterText), note: err?.message });
  }
}

// 기획 아키텍트: 아이디어 한 줄 → Core IP 폼 필드(JSON). SSE 아님(단발 응답).
async function handleIdeate(req, res) {
  const payload = await readJson(req);
  const idea = String(payload.idea || "").trim();
  const genre = payload.genre || "aiForesight";
  const subgenre = payload.subgenre || "";
  const blendGenres = payload.blendGenres || "";
  const model = payload.model || config.defaultModel;
  // mode==='complete': 작가가 채운 항목은 유지하고 '빈 칸만' AI로 보강.
  const complete = payload.mode === "complete";
  const input = payload.input || {};
  // 매체(전용 파이프라인)일 때 기획을 그 매체 문법으로 채운다.
  const medium = payload.medium || input.medium || "webnovel";
  const format = payload.format || input.format || "medium";

  if (complete) {
    const hasAny = FIELD_KEYS.some((k) => String(input[k] ?? "").trim());
    if (!hasAny && !idea) return sendJson(res, 400, { ok: false, error: "먼저 아는 항목을 한두 개라도 채워주세요." });
  } else if (!idea) {
    return sendJson(res, 400, { ok: false, error: "아이디어를 입력하세요." });
  }

  const mode = resolveMode();
  const fallback = () => (complete ? localComplete(input, genre, subgenre) : localIdeate(idea, genre, subgenre));
  if (mode === "local") {
    return sendJson(res, 200, { ok: true, fallback: true, complete, fields: fallback() });
  }
  try {
    const { system, user } = complete
      ? buildCompletePrompt(input, genre, subgenre, blendGenres, medium, format)
      : buildIdeatePrompt(idea, genre, subgenre, blendGenres, medium, format);
    const { text } = await streamMessage({
      provider: mode, // 'api' | 'cli'
      model,
      system,
      messages: [{ role: "user", content: user }],
      temperature: complete ? 0.6 : 0.7,
      maxTokens: 4000, // 심화 기획(IP Bible)까지 채우므로 넉넉히
    });
    const fields = extractFields(text);
    if (!fields) {
      return sendJson(res, 200, {
        ok: true, fallback: true, complete, fields: fallback(),
        note: "모델 응답을 JSON으로 파싱하지 못해 폴백을 사용했습니다.",
      });
    }
    return sendJson(res, 200, { ok: true, complete, fields });
  } catch (err) {
    return sendJson(res, 200, {
      ok: true, fallback: true, complete, fields: fallback(),
      note: err?.message || "생성 실패로 폴백을 사용했습니다.",
    });
  }
}

// 연속 회차 집필: fromChapter부터 count개를 직전 화에 이어 SSE 스트리밍. total=시즌 길이(결말 지점).
async function handleChapter(req, res) {
  const payload = await readJson(req);
  const input = payload.input || {};
  const model = payload.model || config.defaultModel;
  const total = Math.max(1, Math.min(MAX_CHAPTER, Number(payload.total) || 25));
  const from = Math.max(1, Math.min(MAX_CHAPTER, Number(payload.fromChapter) || 1));
  const count = Math.max(1, Math.min(8, Number(payload.count) || 1));
  // 결말(total)을 넘지 않게 한다.
  const end = Math.min(MAX_CHAPTER, total, from + count - 1);
  const ctx = payload.ctx || {};
  // 연재 메모리(누적 요약 맵) → '지금까지의 이야기' 블록으로 합성해 회차 프롬프트에 주입.
  // 현재 쓰는 회차(from) 미만의 메모리만 반영한다(직전 화는 prevText가 따로 담당).
  if (payload.memories && typeof payload.memories === "object") {
    const storySoFar = composeStorySoFar(payload.memories, { upTo: from });
    if (storySoFar) ctx.storySoFar = storySoFar;
  }
  // 세계관 캐논 락: 초기 세계관 규칙 + 누적 확정 설정을 항상 풀웨이트로 주입(후반부 드리프트 방지).
  const canonLock = composeCanonLock(payload.memories, input, { upTo: from });
  if (canonLock) ctx.canonLock = canonLock;
  // 시즌 아웃라인이 있으면, 현재 회차의 막·도파민 비트 지침을 회차별로 주입한다.
  const outline = payload.outline && Array.isArray(payload.outline.acts) ? payload.outline : null;
  const revise = payload.revise && payload.revise.note ? payload.revise : null;
  let prevText = String(payload.prevText || "");

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

  const mode = resolveMode();
  emit("meta", { from, end, mode });

  // 창의성 가중치를 생성 온도로 사상(중립이면 0.85 유지).
  const chapTemp = steeringTemperature(input.steering, 0.85);

  try {
    // 한 회차를 [전반부]+[후반부] 2단계로 생성해 5,000~6,000자를 안정적으로 확보한다.
    const genPart = async (prompt) => {
      let acc = "";
      const { text } = await streamMessage({
        provider: mode,
        model,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
        temperature: chapTemp,
        maxTokens: 6000, // 파트당 ~3,000자(한국어) 출력 여유
        signal: controller.signal,
        onText: (chunk) => { acc += chunk; emit("chapter-delta", { n: prompt._n, text: chunk }); },
      });
      return text || acc;
    };

    for (let n = from; n <= end; n++) {
      const isFinale = n >= total;
      // 이 회차의 막·도파민 비트 지침을 주입(아웃라인이 있을 때).
      ctx.outlineGuide = outline ? outlineGuideFor(outline, n) : "";
      emit("chapter-start", { n, isFinale });
      if (mode === "local") {
        const text = localChapter(input, n, prevText, isFinale, revise);
        emit("chapter-delta", { n, text });
        emit("chapter-done", { n, chars: text.length, isFinale });
        prevText = text;
        continue;
      }
      const p1 = buildChapterFirstPrompt({ input, n, prevText, ctx, total, revise });
      p1._n = n;
      const first = await genPart(p1);
      if (controller.signal.aborted) break;

      emit("chapter-delta", { n, text: "\n\n" });
      const p2 = buildChapterSecondPrompt({ input, n, prevText, ctx, firstText: first, total, isFinale, revise });
      p2._n = n;
      const second = await genPart(p2);

      const full = `${first}\n\n${second}`;
      prevText = full;
      emit("chapter-done", { n, chars: full.length, isFinale });
      if (controller.signal.aborted) break;
    }
    emit("done", { from, end, total });
  } catch (err) {
    if (err?.name !== "AbortError") emit("error", { message: err?.message || "원고 생성 오류" });
  } finally {
    res.end();
  }
}

// CSRF 방어: 변경 요청(POST/DELETE 등)의 Origin이 호스트와 다르면 거부한다.
// 비브라우저 클라이언트(curl 등)는 Origin 헤더가 없어 통과한다. (읽기 GET은 CORS가 응답을 막으므로 제외)
function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === (req.headers.host || ""); }
  catch { return false; }
}

async function handleApi(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD" && !isSameOrigin(req)) {
    return sendJson(res, 403, { ok: false, error: "교차 출처 요청이 차단되었습니다." });
  }

  if (req.method === "GET" && pathname === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      app: "Webnovel IP Agent",
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
    const subgenre = query.get("subgenre") || "";
    const pb = getPlaybook(genre, subgenre);
    return sendJson(res, 200, {
      ok: true,
      genre,
      subgenre,
      playbook: pb,
      recommendedSteering: recommendedSteering(genre, pb.family),
      common: {
        hitStages: COMMON.successFlow,
        designPrinciple: COMMON.designPrinciple,
        failurePatterns: COMMON.failurePatterns,
        checklist: COMMON.evalRubric,
      },
      platformPriority: PLATFORM_PRIORITY,
    });
  }

  if (req.method === "GET" && pathname === "/api/design-spec") {
    const query = new URL(req.url, "http://localhost").searchParams;
    const medium = query.get("medium") || "film";
    const format = query.get("format") || "medium";
    return sendJson(res, 200, {
      ok: true,
      medium,
      format,
      elements: designElements(medium),
      recommend: recommendedDesignSpec(medium, format),
    });
  }

  if (req.method === "GET" && pathname === "/api/platform-meta") {
    return sendJson(res, 200, {
      ok: true,
      platforms: PLATFORMS,
      taxonomy: TAXONOMY,
      personas: PERSONAS,
      overlay: KR_SF_OVERLAY,
      reactionAxes: REACTION_AXES,
      successFormula: SUCCESS_FORMULA,
      failureFormula: FAILURE_FORMULA,
    });
  }

  if (req.method === "POST" && pathname === "/api/reference") {
    return handleReference(req, res);
  }

  if (req.method === "POST" && pathname === "/api/ideate") {
    return handleIdeate(req, res);
  }

  if (req.method === "POST" && pathname === "/api/chapter") {
    return handleChapter(req, res);
  }

  if (req.method === "POST" && pathname === "/api/critique") {
    return handleCritique(req, res);
  }

  if (req.method === "POST" && pathname === "/api/synopsis") {
    return handleSynopsis(req, res);
  }

  if (req.method === "POST" && pathname === "/api/impact") {
    return handleImpact(req, res);
  }

  if (req.method === "POST" && pathname === "/api/tool") {
    return handleTool(req, res);
  }

  if (req.method === "POST" && pathname === "/api/sample") {
    return handleSample(req, res);
  }

  if (req.method === "POST" && pathname === "/api/outline") {
    return handleOutline(req, res);
  }

  if (req.method === "POST" && pathname === "/api/audit") {
    return handleAudit(req, res);
  }

  if (req.method === "POST" && pathname === "/api/media-critique") {
    return handleMediaCritique(req, res);
  }

  if (req.method === "POST" && pathname === "/api/media-audit") {
    return handleMediaAudit(req, res);
  }

  if (req.method === "POST" && pathname === "/api/charsheet") {
    return handleCharSheet(req, res);
  }

  if (req.method === "POST" && pathname === "/api/artstyle") {
    return handleArtStyle(req, res);
  }

  if (req.method === "POST" && pathname === "/api/techmap") {
    return handleTechMap(req, res);
  }

  if (req.method === "POST" && pathname === "/api/festival") {
    return handleFestival(req, res);
  }

  if (req.method === "POST" && pathname === "/api/videoprompt") {
    return handleVideoPrompt(req, res);
  }

  if (req.method === "POST" && pathname === "/api/formconvert") {
    return handleFormConvert(req, res);
  }

  if (req.method === "POST" && pathname === "/api/onesheet") {
    return handleOneSheet(req, res);
  }

  if (req.method === "POST" && pathname === "/api/integrity") {
    return handleIntegrity(req, res);
  }

  if (req.method === "POST" && pathname === "/api/conte") {
    return handleConte(req, res);
  }

  if (req.method === "POST" && pathname === "/api/media-guarantee") {
    return handleMediaGuarantee(req, res);
  }

  if (req.method === "POST" && pathname === "/api/media-upgrade") {
    return handleMediaUpgrade(req, res);
  }

  if (req.method === "POST" && pathname === "/api/convert") {
    return handleConvert(req, res);
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
    // 내부 상세(경로·스택)를 클라이언트에 노출하지 않는다. 상세는 서버 로그로.
    console.error("[요청 처리 오류]", error?.message || error);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: "서버 내부 오류" });
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
  console.log(`Webnovel IP Agent (웹소설 IP 에이전트) · ${label}`);
  console.log(`→ http://${config.host}:${config.port}`);
});

module.exports = { handleRequest, reportToMarkdown };
