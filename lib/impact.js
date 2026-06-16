"use strict";

/**
 * AI 임팩트 리포트 (Before → After 진단).
 *
 * 타깃 사용자: "막연한 아이디어 한 줄은 있지만, 이게 웹소설로 통할지·어떻게 흥행 IP로
 *            만들지 막막한 (예비)웹소설 작가."
 *
 * 이 솔루션의 가치를 '체감'시키는 진단기. 작가의 날것 아이디어를 받아,
 *   BEFORE: 혼자 막연하게 쓸 때의 상업성 점수와 구체적 약점·실패 리스크
 *   AFTER : 이 솔루션(흥행 문법 정렬 + 연재 연속성 + 완성도 심사 + OSMU)을 통과한 결과
 * 를 한 장의 비교 리포트(JSON)로 만든다. server.js가 LLM 호출을 담당한다.
 */

const { getPlaybook, buildPlaybookBlock } = require("./playbook");
const { GENRE_LABELS } = require("./agents");

/** 입력에서 진단 대상이 될 '날것 아이디어/현재 상태' 한 덩어리를 만든다. */
function describeSeed(idea, input = {}) {
  const bits = [];
  if (idea && idea.trim()) bits.push(`아이디어 한 줄: ${idea.trim()}`);
  const pick = (k, label) => { if (input[k] && String(input[k]).trim()) bits.push(`${label}: ${String(input[k]).trim()}`); };
  pick("ipTitle", "현재 제목");
  pick("logline", "현재 로그라인");
  pick("sfPremise", "명제/질문");
  pick("protagonist", "주인공");
  pick("coreTech", "핵심 소재");
  pick("antagonist", "적대");
  pick("seasonGoal", "시즌 목표");
  return bits.length ? bits.join("\n") : (idea || "").trim();
}

function buildImpactPrompt(idea, input = {}, genre = "aiForesight", subgenre = "") {
  const g = getPlaybook(genre, subgenre);
  const seed = describeSeed(idea, input);

  const system = `너는 한국 웹소설 시장의 냉정한 상업성 평가자이자, 흥행 IP 닥터다.
작가가 가져온 '막연한 아이디어'를 보고, 두 가지 미래를 진단한다.
  (A) BEFORE: 작가가 이 상태 그대로 '혼자' 막연하게 연재했을 때 — 실제로 흔히 일어나는 약점과 실패.
  (B) AFTER : 이 솔루션(흥행 문법 자동 정렬 · 회차 연속성 보장 · 완성도 자동 심사 · OSMU 확장)을 통과했을 때.

[평가 원칙]
- BEFORE는 정직하게 낮게. 막연한 아이디어의 전형적 약점을 구체적으로 짚는다(평범한 훅, 흐릿한 결핍·특권, 떡밥 증발, 설정 붕괴, 평범한 제목, 보상 부재 등).
- AFTER는 같은 아이디어의 '핵심 씨앗'은 보존하되, 아래 흥행 문법으로 끌어올린 모습으로 그린다. 과장 금지 — 근거 있는 상승.
- before.score < after.score 가 되도록, 두 점수 모두 0~100 정수로 정직하게 매긴다(보통 BEFORE 35~55, AFTER 78~92).
- 모든 문장은 한국어. 구체적이고 짧게. 추상적 미사여구 금지.

${buildPlaybookBlock(genre, subgenre)}

[출력 형식 — 매우 중요]
- 오직 JSON 객체 하나만 출력한다. 코드펜스·설명·인사말 금지.
- 키는 정확히 아래와 같다(추가/누락 금지).

{
  "verdict": "이 아이디어의 가능성을 한 문장으로 (씨앗은 좋은가, 무엇을 더해야 통하는가)",
  "genreFit": "이 아이디어에 가장 맞는 장르/결을 한 줄로",
  "before": {
    "score": 0,
    "logline": "작가가 혼자 쓸 때 나오기 쉬운 밋밋한 로그라인 1개",
    "title": "평범하게 지을 법한 제목 1개",
    "missing": ["지금 빠져 있는 흥행 요소 3~4개(짧게)"],
    "risks": ["혼자 연재하면 실제로 터질 문제 3개(예: 20화쯤 떡밥 증발, 주인공 수동성, 설정 모순)"]
  },
  "after": {
    "score": 0,
    "logline": "흥행 문법(결핍→특권→회차 검증→즉시 보상)으로 끌어올린 로그라인 1개",
    "titles": ["흥행형 제목 3개(장르 제목 문법 톤)"],
    "hook": "독자가 1화에서 멈출 수 없게 만드는 오프닝 훅 1줄",
    "upgrades": ["이 솔루션이 보강하는 핵심 4개(짧게)"],
    "guarantees": ["이 솔루션이 구조적으로 보장하는 것 4개(예: 흥행 공식 정렬, 회차별 연속성·떡밥 회수, 완성도 자동 심사, 웹툰·글로벌 OSMU 확장)"]
  },
  "keyChanges": ["BEFORE→AFTER 핵심 변화 3개(한 줄씩, '무엇이→무엇으로')"]
}`;

  const user = `장르(현재 선택): ${g.label} (${g.key})

[진단 대상 — 작가의 날것 아이디어/현재 상태]
${seed}

위 아이디어로 Before→After 임팩트 리포트(JSON)를 작성하라.`;

  return { system, user };
}

/** LLM 응답에서 첫 JSON 객체를 견고하게 추출·정규화한다. */
function parseImpact(text) {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const raw = text.slice(start, end + 1);
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
  const obj = tryParse(raw) || tryParse(raw.replace(/,(\s*[}\]])/g, "$1"));
  if (!obj || typeof obj !== "object" || !obj.before || !obj.after) return null;

  const arr = (v, cap = 5) => Array.isArray(v)
    ? v.map((x) => String(x || "").trim()).filter(Boolean).slice(0, cap) : [];
  const clampScore = (v, dflt) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : dflt;
  };
  const before = {
    score: clampScore(obj.before.score, 45),
    logline: String(obj.before.logline || "").trim(),
    title: String(obj.before.title || "").trim(),
    missing: arr(obj.before.missing, 4),
    risks: arr(obj.before.risks, 4),
  };
  const after = {
    score: clampScore(obj.after.score, 85),
    logline: String(obj.after.logline || "").trim(),
    titles: arr(obj.after.titles, 4),
    hook: String(obj.after.hook || "").trim(),
    upgrades: arr(obj.after.upgrades, 5),
    guarantees: arr(obj.after.guarantees, 5),
  };
  // 안전장치: AFTER가 BEFORE보다 낮게 나오면 보정.
  if (after.score <= before.score) after.score = Math.min(95, before.score + 35);
  return {
    verdict: String(obj.verdict || "").trim(),
    genreFit: String(obj.genreFit || "").trim(),
    before,
    after,
    keyChanges: arr(obj.keyChanges, 4),
  };
}

/** 키/구독 없을 때(또는 파싱 실패)의 결정론적 폴백. 장르 프리셋 + 아이디어로 구성. */
function localImpact(idea, input = {}, genre = "aiForesight", subgenre = "") {
  const g = getPlaybook(genre, subgenre);
  const p = g.preset || {};
  const seedLine = (idea && idea.trim()) || input.logline || p.logline || "막연한 한 줄 아이디어";
  const titles = Array.isArray(g.titles) ? g.titles.slice(0, 3)
    : (Array.isArray(g.preset?.titles) ? g.preset.titles.slice(0, 3) : []);
  const firstTitle = titles[0] || `${(idea || "무제").replace(/[.!?].*$/, "").slice(0, 16)} 이야기`;

  return {
    verdict: `씨앗은 있지만 '결핍→특권→보상' 구조가 흐려, 지금 상태로는 ${g.label} 독자를 1화에 붙잡기 어렵습니다.`,
    genreFit: `${g.label} — ${g.core || g.formula || ""}`.trim(),
    before: {
      score: 44,
      logline: seedLine,
      title: firstTitle,
      missing: ["1화에서 주인공이 '잃는 것'이 불명확", "주인공만의 특권(특수성)이 안 보임", "회차마다 줄 '즉시 보상'이 없음", "20화 이상 돌릴 반복 사건 구조 부재"],
      risks: ["초반 설정 설명이 길어 1화 이탈", "중반에 깔아둔 떡밥이 증발·미회수", "주인공이 사건을 관찰만 하는 수동성", "후반 설정 모순으로 몰입 붕괴"],
    },
    after: {
      score: 86,
      logline: p.logline || `${seedLine} — 결핍을 뒤집는 특권으로 매 회차 판을 키운다.`,
      titles: titles.length ? titles : [firstTitle],
      hook: "평범한 하루가, 단 한 줄의 통보로 돌이킬 수 없게 무너진다.",
      upgrades: ["결핍→특권→회차 검증→즉시 보상 구조로 재정렬", "장르 흥행 제목·로그라인·훅 자동 생성", "회차별 연재 메모리로 떡밥·설정 연속성 보장", "공모전 본심 기준 완성도 자동 심사"],
      guarantees: ["흥행 공식에 정렬된 회차 설계", "장거리 연속성·떡밥 회수 추적", "완성도 자동 심사·보완 루프", "웹툰·글로벌 OSMU 확장 분기"],
    },
    keyChanges: [
      "밋밋한 한 줄 → 결핍·특권·보상이 박힌 흥행형 로그라인",
      "평범한 제목 → 장르 문법에 맞춘 클릭되는 제목",
      "휘발되는 설정 → 회차마다 누적·검증되는 연속성",
    ],
    _local: true,
  };
}

module.exports = { buildImpactPrompt, parseImpact, localImpact };
