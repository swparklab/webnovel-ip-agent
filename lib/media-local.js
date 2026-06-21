"use strict";

/**
 * 매체별 전용 파이프라인의 무LLM 결정론 폴백 (Deterministic, no-API fallback).
 * platform-local.js 를 미러링한다. 키가 없을 때도 매체 파이프라인이 데모되도록
 * 각 에이전트 id마다 medium.js 지식베이스 기반의 쓸 만한 Markdown을 반환한다.
 *
 * 산출 형태는 platform-local 과 동일: { generatedAt, model, fallback, agents:{[id]:{id,name,tabs,text}}, usage }
 * agents 의 키 집합은 반드시 pipelineAgents(medium) 의 id 집합과 일치한다(스트리밍 누락 방지).
 */

const {
  MEDIA, resolveMedium, resolveFormat, mediumLabel, formatLabel,
  mediumSuccessEquation, mediumStructureTarget,
} = require("./medium");
const { MEDIA_AGENTS } = require("./media-studios");

function table(headers, rows) {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.map((c) => String(c).replace(/\n/g, " ")).join(" | ")} |`).join("\n");
  return `${head}\n${sep}\n${body}`;
}

function val(v, fb = "(미입력)") {
  const t = String(v ?? "").trim();
  return t || fb;
}

/** 기획/주제/인사이트 단계 — 성공 방정식 진단 stub. */
function conceptMd(medium, format, input) {
  return [
    `## 기획 진단 (로컬 데모)`,
    `- 매체: ${mediumLabel(medium)} · 포맷: ${formatLabel(format)}`,
    `- 작품 제목: ${val(input.ipTitle, "무제")}`,
    `- 로그라인: ${val(input.logline)}`,
    ``,
    `## 성공 방정식 충족 진단`,
    `- 성공 방정식: **${mediumSuccessEquation(medium)}**`,
    table(["요소", "현재 충족도", "보강 포인트"], [
      ["콘셉트/전제", input.logline ? "중" : "하", input.logline ? "한 줄로 더 날카롭게" : "로그라인부터 확정"],
      ["핵심 인물·욕망", input.protagonist ? "중" : "하", "결핍·욕망·치명적 선택을 한 줄로"],
      ["감정 설계", "—", "연출 설계 단계에서 파트별로 확정"],
    ]),
    ``,
    `> API 키 연결 시 이 단계가 실제 기획 브리프로 확장됩니다.`,
  ].join("\n");
}

/** 세계/리서치/빅아이디어 등 전개 단계 — 입력 에코 stub. */
function developMd(medium, format, input, role) {
  return [
    `## ${role} (로컬 데모)`,
    `- 매체: ${mediumLabel(medium)} · 포맷: ${formatLabel(format)}`,
    table(["항목", "내용"], [
      ["중심 갈등", val(input.centralConflict)],
      ["핵심 소재·장치", val(input.coreTech)],
      ["세계·관계 구조", val(input.socialShift)],
      ["주제의식", val(input.theme)],
    ]),
    ``,
    `> API 키 연결 시 이 단계가 실제 ${role} 산출물로 확장됩니다.`,
  ].join("\n");
}

/** 구성(아크/시즌/캠페인) 단계 — 구조 타깃 기반 구성표 stub. */
function structureMd(medium, format) {
  const t = mediumStructureTarget(medium, format);
  const n = Math.min(t.count, 8);
  const rows = Array.from({ length: n }, (_, i) => [
    `${i + 1}${t.unit}`,
    i === 0 ? "도입·후크" : i === n - 1 ? "절정·여운" : "전개·상승",
    "—",
  ]);
  return [
    `## 구성안 (로컬 데모)`,
    `- 구조 단위: **${t.unit}** · 목표 분량: **${t.count}${t.unit}** · 러닝타임: ${t.runtime} · 막 구조: ${t.actModel}`,
    ``,
    table([t.unit, "역할", "사건"], rows),
    t.count > n ? `\n> 외 ${t.count - n}${t.unit} 생략(로컬 데모). API 키 연결 시 전체 구성으로 확장됩니다.` : "",
  ].join("\n");
}

/** 대본/콘티/스토리보드 단계 — stub. */
function scriptMd(medium, format, role) {
  const t = mediumStructureTarget(medium, format);
  return [
    `## ${role} (로컬 데모)`,
    `- 이 매체의 ${t.unit} 단위로 실제 대본/콘티가 생성됩니다.`,
    `- 구조 타깃: ${t.count}${t.unit} · ${t.runtime} · ${t.actModel}`,
    ``,
    `> API 키 연결 시 이 단계가 실제 ${role}으로 집필됩니다.`,
  ].join("\n");
}

/** ★연출 설계 단계 — 파트별 감동 + 연출값 표(핵심 산출물). */
function directionMd(medium, format) {
  const m = MEDIA[resolveMedium(medium)];
  const t = mediumStructureTarget(medium, format);
  const dims = m.directing.dimensions;
  const beats = m.directing.emotionBeats;
  const headers = ["파트", "끌어낼 감동", ...dims];
  const rows = beats.map(([part, emotion, how]) => [
    part,
    emotion,
    ...dims.map((d, i) => (i === 0 ? how : "—")),
  ]);
  return [
    `## 파트별 연출 설계 (로컬 데모)`,
    `- 매체: ${mediumLabel(medium)} · 포맷: ${formatLabel(format)} · 구조: ${t.count}${t.unit}`,
    `- 연출값 차원: ${dims.join(" · ")}`,
    ``,
    table(headers, rows),
    ``,
    `## 감정 곡선 요약`,
    `- 도입(${beats[0] ? beats[0][1] : "호기심"}) → 절정(${beats[beats.length - 1] ? beats[beats.length - 1][1] : "카타르시스"})으로 이어지는 감정 설계.`,
    ``,
    `> API 키 연결 시 각 ${t.unit}마다 구체 연출값(색·렌즈·음악·편집 템포 등)이 채워집니다.`,
  ].join("\n");
}

/** 에이전트 tab(역할)에 따라 적절한 로컬 Markdown을 선택. */
function localTextFor(agent, medium, format, input) {
  const tab = (agent.tabs && agent.tabs[0]) || "";
  switch (tab) {
    case "concept":
    case "topic":
    case "insight":
      return conceptMd(medium, format, input);
    case "beats":
    case "episodes":
    case "season":
    case "campaign":
      return structureMd(medium, format);
    case "scene":
    case "script":
    case "board":
      return scriptMd(medium, format, agent.name);
    case "direction":
      return directionMd(medium, format);
    default:
      // world / research / treatment / idea / interview / structure 등 전개 단계
      return developMd(medium, format, input, agent.name);
  }
}

/** 매체 파이프라인의 결정론 폴백 리포트. */
function buildMediaLocalReport(medium, input) {
  const m = resolveMedium(medium);
  const format = resolveFormat(input.format);
  const agentsList = MEDIA_AGENTS[m] || [];
  const agents = {};
  agentsList.forEach((agent) => {
    agents[agent.id] = {
      id: agent.id,
      name: agent.name,
      tabs: agent.tabs,
      text: localTextFor(agent, m, format, input),
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    model: "local-fallback",
    fallback: true,
    agents,
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

module.exports = { buildMediaLocalReport };
