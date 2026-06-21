"use strict";

/**
 * 매체별 전문 도구팩 (Per-Medium Toolkit) — 엔진.
 *
 * 정적 도구팩(전 매체 동일 5개)을 대체한다. 매체마다 그 분야 사용자가 실제로
 * 필요로 하는 전문 도구(생성기·분석기·레퍼런스·플래너)를 데이터로 정의하고,
 * 하나의 제네릭 엔진이 도구 메타로 프롬프트/분석/폴백을 구동한다.
 *
 * 데이터: ./media-toolkit-data.json  (매체×전문가 탐색 워크플로 산출)
 * 엔진은 데이터에 독립적 — 도구 목록이 늘거나 바뀌어도 코드는 그대로.
 *
 * kind:
 *   generator/planner/reference/checklist → Markdown 산출 (SSE, /api/toolkit)
 *   analyzer                              → JSON 진단 점수 (/api/toolkit-analyze)
 */

const {
  resolveMedium, resolveFormat, mediumLabel, formatLabel,
  buildMediumBlock, mediumSuccessEquation, MEDIA,
} = require("./medium");

let DATA = { perMedium: {}, cross: [] };
try { DATA = require("./media-toolkit-data.json"); } catch { /* 데이터 없으면 빈 도구팩 */ }

const KIND_LABELS = { generator: "생성", analyzer: "진단", reference: "레퍼런스", checklist: "체크", planner: "설계" };
const KIND_GROUP = { generator: "create", planner: "create", analyzer: "diagnose", reference: "deliver", checklist: "deliver" };
const GROUP_LABELS = { create: "✦ 생성·설계", diagnose: "📊 진단·심사", deliver: "📦 레퍼런스·딜리버리" };
const isAnalyzer = (def) => def && def.kind === "analyzer";

/* ---------------------------------- 조회 ---------------------------------- */
function toolkitList(medium) { return DATA.perMedium[resolveMedium(medium)] || []; }
function crossList() { return DATA.cross || []; }
function toolkitTool(medium, id) {
  return toolkitList(medium).find((t) => t.id === id) || crossList().find((t) => t.id === id) || null;
}
/** 프론트 동적 렌더용 메타(버튼 라벨·종류·설명·입력). */
function toolkitMeta(medium) {
  const m = resolveMedium(medium);
  const pick = (t) => ({ id: t.id, label: t.label, kind: t.kind, group: KIND_GROUP[t.kind] || "create", kindLabel: KIND_LABELS[t.kind] || t.kind, whatItDoes: t.whatItDoes, inputs: t.inputs || [], output: t.output || "" });
  return { medium: m, tools: toolkitList(m).map(pick), cross: crossList().map(pick) };
}

/* ------------------------------- 공통 컨텍스트 ------------------------------- */
function ipContext(input = {}) {
  const bits = [];
  const pick = (k, label) => { const v = input[k]; if (v && String(v).trim()) bits.push(`- ${label}: ${String(v).trim()}`); };
  pick("ipTitle", "제목"); pick("logline", "로그라인"); pick("sfPremise", "명제/핵심 질문");
  pick("protagonist", "주인공/핵심 인물"); pick("antagonist", "대립/적대"); pick("centralConflict", "중심 갈등");
  pick("coreObject", "핵심 오브젝트"); pick("coreTech", "핵심 소재"); pick("theme", "주제/메시지");
  pick("seasonGoal", "작품 목표"); pick("tone", "톤"); pick("targetReader", "타깃");
  pick("runtime", "러닝타임"); pick("characterCount", "인물 수");
  return bits.length ? bits.join("\n") : "- (입력이 비어 있음 — 합리적으로 가정해 채운다)";
}

function roleFor(m, def) {
  const base = `${mediumLabel(m)} 분야의 베테랑 전문가`;
  if (def.kind === "analyzer") return `${base}이자 냉정한 진단가`;
  if (def.kind === "reference" || def.kind === "checklist") return `${base}이자 딜리버리/규격 담당`;
  return `${base}이자 실무 프로듀서`;
}

/* ----------------------- 생성기/레퍼런스/플래너 → Markdown ----------------------- */
function buildToolkitPrompt({ medium, tool, input = {}, text = "", format }) {
  const m = resolveMedium(medium);
  const f = resolveFormat(format || input.format);
  const def = toolkitTool(m, tool);
  if (!def || isAnalyzer(def)) return null;
  const system = `너는 ${roleFor(m, def)}다. 추상적인 조언이 아니라, 현장에서 바로 쓰는 실무 산출물을 만든다.

[도구] ${def.label}
[목적] ${def.whatItDoes}
[산출 형식] ${def.output || "표/리스트 중심 한국어 Markdown"} — 구체적으로. 추상어·미사여구 금지. 표·리스트로 바로 쓸 수 있게.

${buildMediumBlock(m, f)}

[원칙]
- ${mediumLabel(m)}의 성공 방정식과 파트별 연출 설계에 정렬한다.
- 값은 구체값(수치·색·렌즈·음악·편집·타이밍·문구)으로 박는다.
- 입력이 비면 합리적으로 가정하되, 가정한 부분은 (가정)으로 표시한다.
- 한국어 Markdown만. 머리말·사과·자기소개 금지.`;
  const user = `매체: ${mediumLabel(m)} · 포맷: ${formatLabel(f)}

## 작품 입력
${ipContext(input)}
${String(text || "").trim() ? `\n## 참고 산출물 발췌\n${String(text).slice(0, 8000)}` : ""}

위 입력으로 '${def.label}'를 ${def.output || "실무 산출물"} 형식으로 완성하라.`;
  return { system, user };
}

/** 키 없을 때 Markdown 결정론 폴백 — 도구 메타로 유용한 골격을 만든다. */
function localToolkit({ medium, tool, input = {} }) {
  const m = resolveMedium(medium);
  const def = toolkitTool(m, tool);
  if (!def) return "";
  const title = String(input.ipTitle || "무제").trim();
  const dims = (MEDIA[m] && MEDIA[m].directing.dimensions) || [];
  const lines = [
    `## ${def.label} — 로컬 데모`,
    `> ${def.whatItDoes}`,
    ``,
    `- 작품: ${title}`,
    `- 매체 성공 방정식: ${mediumSuccessEquation(m)}`,
  ];
  if ((def.inputs || []).length) lines.push(`- 입력 항목: ${def.inputs.join(" · ")}`);
  if (dims.length) lines.push(`- 연출값으로 박을 차원: ${dims.slice(0, 4).join(" · ")}`);
  lines.push(``, `### 골격(키 연결 시 ${def.output || "전체 산출물"}로 확장)`);
  // 입력 항목마다 채울 슬롯을 표로.
  if ((def.inputs || []).length) {
    lines.push(`| 항목 | 값/방향 |`, `|---|---|`);
    def.inputs.forEach((i) => lines.push(`| ${i} | (여기에 ${i} 설계) |`));
  }
  lines.push(``, `> ${def.fallback || "API 키/구독 연결 시 실제 전문 산출물이 생성됩니다."}`);
  return lines.join("\n");
}

/* ------------------------------ 분석기 → JSON ------------------------------ */
function buildToolkitAnalyzePrompt({ medium, tool, input = {}, text = "", format }) {
  const m = resolveMedium(medium);
  const f = resolveFormat(format || input.format);
  const def = toolkitTool(m, tool);
  if (!def) return null;
  const system = `너는 ${mediumLabel(m)} 분야의 까다로운 진단가다. 후하게 주지 마라(평범=50에서 시작).

[진단 도구] ${def.label}
[무엇을 보는가] ${def.whatItDoes}

${buildMediumBlock(m, f)}

[출력 — JSON 하나만. 코드펜스·설명 금지]
{
  "overall": 0~100,
  "scores": { "<핵심 진단축 3~5개를 도구 목적에 맞게 직접 정하라>": 0~100 },
  "flags": [ { "issue": "발견한 문제/위험", "severity": "high|medium|low", "where": "어디서(있으면)" } ],
  "fixes": ["바로 적용할 구체 보강 지시 3~6개"],
  "verdict": "한 줄 총평(냉정하게)"
}`;
  const user = `매체: ${mediumLabel(m)} · 포맷: ${formatLabel(f)}

## 작품 입력
${ipContext(input)}

## 진단 대상(산출물/대본/발췌)
${String(text || "").slice(0, 12000) || "(발췌 없음 — 작품 입력 기준으로 진단)"}

위를 '${def.label}' 기준으로 진단하고 JSON으로 출력하라.`;
  return { system, user };
}

function parseToolkitAnalyze(text) {
  if (!text) return null;
  const s = text.indexOf("{"); const e = text.lastIndexOf("}");
  if (s === -1 || e === -1 || e <= s) return null;
  const raw = text.slice(s, e + 1);
  let obj = null;
  try { obj = JSON.parse(raw); } catch { try { obj = JSON.parse(raw.replace(/,(\s*[}\]])/g, "$1")); } catch { return null; } }
  if (!obj || typeof obj !== "object") return null;
  const num = (v, fb) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fb; };
  const scores = {};
  if (obj.scores && typeof obj.scores === "object") {
    for (const [k, v] of Object.entries(obj.scores)) { const n = Number(v); if (Number.isFinite(n)) scores[k] = Math.max(0, Math.min(100, n)); }
  }
  const flags = Array.isArray(obj.flags) ? obj.flags.map((x) => (typeof x === "string" ? { issue: x, severity: "medium", where: "" } : { issue: String(x.issue || ""), severity: ["high", "medium", "low"].includes(x.severity) ? x.severity : "medium", where: String(x.where || "") })).filter((x) => x.issue) : [];
  const arr = (x) => (Array.isArray(x) ? x.map(String).filter(Boolean) : []);
  const avg = Object.values(scores).length ? Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length) : 60;
  return { overall: num(obj.overall, avg), scores, flags, fixes: arr(obj.fixes), verdict: String(obj.verdict || ""), _label: undefined };
}

/** 분석기 결정론 폴백 — 텍스트 신호로 점수/플래그 추정(실제 진단은 키 연결 시). */
function localToolkitAnalyze({ medium, tool, input = {}, text = "" }) {
  const m = resolveMedium(medium);
  const def = toolkitTool(m, tool) || { label: "진단", whatItDoes: "" };
  const t = String(text || "");
  const len = t.replace(/\s/g, "").length;
  const dims = (MEDIA[m] && MEDIA[m].directing.dimensions) || [];
  const dimHits = dims.filter((d) => t.includes(String(d).split("(")[0].split("·")[0])).length;
  const hasTable = /\|.*\|/.test(t);
  const hasEmotion = /(감동|감정|울림|긴장|카타르시스|여운|공감|충격|불안|호기심)/.test(t);
  const hasNumbers = /\d/.test(t);
  let overall = 48 + (len >= 1500 ? 10 : len >= 600 ? 5 : 0) + dimHits * 4 + (hasTable ? 6 : 0) + (hasEmotion ? 6 : 0) + (hasNumbers ? 3 : 0);
  overall = Math.max(35, Math.min(92, overall));
  const flags = [];
  if (len < 400) flags.push({ issue: "진단 대상 분량이 적어 신뢰도가 낮다(산출물을 먼저 생성하세요)", severity: "high", where: "" });
  if (dimHits < 2) flags.push({ issue: "연출값이 구체값(색·카메라·음악·편집)으로 박히지 않았다", severity: "medium", where: "" });
  if (!hasEmotion) flags.push({ issue: "끌어낼 감정이 분명하지 않다", severity: "medium", where: "" });
  return {
    overall,
    scores: { 충실도: Math.max(30, overall - 4), 구체성: Math.max(25, 40 + dimHits * 8), 완성도: Math.max(30, len >= 1000 ? overall : overall - 8) },
    flags,
    fixes: [
      `각 항목의 값을 ${dims.slice(0, 3).join("·") || "색·카메라·음악"} 등 구체값으로 1줄씩 박아라.`,
      "실제 정밀 진단은 API 키/구독 연결 후 가능합니다.",
    ],
    verdict: `${def.label} 로컬 추정치입니다(신호 기반). 정밀 진단은 키 연결 후 진행하세요.`,
    fallback: true,
  };
}

/* ----------------------- 🧭 다음 작업 추천 (순수 룰) ----------------------- */
// 생성→진단→딜리버리 흐름으로, 아직 안 한 도구 중 가치 높은 순서로 추천.
function nextStepGuide(medium, doneIds = []) {
  const m = resolveMedium(medium);
  const done = new Set(doneIds || []);
  const order = ["create", "diagnose", "deliver"];
  const tools = toolkitList(m).slice().sort((a, b) => order.indexOf(KIND_GROUP[a.kind] || "create") - order.indexOf(KIND_GROUP[b.kind] || "create"));
  const rec = [];
  for (const t of tools) {
    if (done.has(t.id)) continue;
    const grp = KIND_GROUP[t.kind] || "create";
    const why = grp === "create" ? "먼저 만들 핵심 산출물" : grp === "diagnose" ? "만든 결과의 약점을 잡을 진단" : "딜리버리/규격 점검";
    rec.push({ id: t.id, label: t.label, kind: t.kind, why });
    if (rec.length >= 3) break;
  }
  return rec;
}

module.exports = {
  KIND_LABELS, KIND_GROUP, GROUP_LABELS, isAnalyzer,
  toolkitList, crossList, toolkitTool, toolkitMeta,
  buildToolkitPrompt, localToolkit,
  buildToolkitAnalyzePrompt, parseToolkitAnalyze, localToolkitAnalyze,
  nextStepGuide,
};
