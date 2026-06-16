"use strict";

/**
 * 시즌 아웃라인 / 비트 시트 (Story Outline & Beat Sheet).
 *
 * '몇 화에 완결'(total)을 받아 기승전결 4막을 회차 구간에 매핑하고,
 * 그 사이사이에 '도파민 비트'(사이다·각성·반전·보상·관계·위기·떡밥·회수)를
 * 특정 회차에 배치한다. 이 아웃라인은 각 회차 집필 프롬프트에 '이번 화 지침'으로
 * 주입되어, 큰 구조와 작은 보상이 설계대로 터지게 만든다.
 */

const { buildPlaybookBlock, getPlaybook } = require("./playbook");
const { genreLabel } = require("./agents");

const BEAT_TYPES = ["사이다", "각성", "반전", "보상", "관계", "위기", "떡밥", "회수"];

function clampN(v, total) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(1, Math.min(total, n)) : null;
}

/** 작품 요약(아웃라인 프롬프트용). */
function ipDigest(input) {
  const pick = (k) => String(input[k] ?? "").trim();
  return [
    `- 제목: ${pick("ipTitle") || "무제"}`,
    `- 장르: ${genreLabel(input.genre)}`,
    pick("logline") && `- 로그라인: ${pick("logline")}`,
    pick("sfPremise") && `- 명제: ${pick("sfPremise")}`,
    pick("protagonist") && `- 주인공: ${pick("protagonist")}`,
    pick("desire") && `- 핵심 욕망: ${pick("desire")}`,
    pick("antagonist") && `- 적대: ${pick("antagonist")}`,
    pick("worldRule") && `- 세계 규칙: ${pick("worldRule")}`,
    pick("centralConflict") && `- 중심 갈등: ${pick("centralConflict")}`,
    pick("coreMystery") && `- 중심 떡밥: ${pick("coreMystery")}`,
    pick("twistPlan") && `- 계획된 반전: ${pick("twistPlan")}`,
    pick("seasonGoal") && `- 시즌 목표: ${pick("seasonGoal")}`,
  ].filter(Boolean).join("\n");
}

function buildOutlinePrompt({ input, total = 25 }) {
  const g = getPlaybook(input.genre, input.subgenre);
  const system = `너는 웹소설 시즌 구조 설계자다. 작품을 '정확히 ${total}화에 완결'되는 기승전결 4막 구조로 설계하고, 회차 사이사이에 독자를 붙잡는 '도파민 비트'를 배치한다.

[설계 원칙]
- 4막(기·승·전·결)을 ${total}화에 비례 배분한다(기 ~20%, 승 ~35%, 전 ~30%, 결 ~15% 가 기본이되 작품에 맞게 조정).
- 각 막은 '목표'와 그 막을 닫는 '전환점(turn)'을 가진다. 막이 끝날 때 판이 한 단계 커져야 한다.
- 도파민 비트는 ${BEAT_TYPES.join("/")} 중에서 고른다. 초반(기)에는 사이다·각성·보상을 촘촘히, 중반(승·전)에는 반전·위기·관계·떡밥을, 후반(결)에는 회수·사이다를 몰아 카타르시스를 만든다.
- 비트는 최소 ${Math.max(6, Math.round(total / 2))}개 이상, 회차 번호(1~${total})에 분산 배치한다. 같은 회차에 2개까지 허용.
- 마지막 화(${total}화)는 시즌 목표를 매듭짓고 차기 시즌 떡밥 한 줄을 남긴다.

${buildPlaybookBlock(input.genre, input.subgenre, input.blendGenres)}
${g.sub ? `\n[세부 장르] '${g.sub.label}'의 성공 방정식을 따른다: ${g.sub.formula}` : ""}

[출력 형식 — 매우 중요]
- 오직 JSON 객체 하나만 출력한다. 코드펜스·설명·인사말 금지. 모든 값은 한국어.
- 회차 번호는 1~${total} 정수.

{
  "logline": "한 줄 로그라인",
  "endingType": "이 시즌의 완결 형태(예: 1막 완결 + 차기 시즌 떡밥)",
  "acts": [
    {"act":"기","from":1,"to":<int>,"goal":"이 막의 목표","turn":"막을 닫는 전환점","events":["핵심 사건 2~3개"]},
    {"act":"승","from":<int>,"to":<int>,"goal":"...","turn":"...","events":["..."]},
    {"act":"전","from":<int>,"to":<int>,"goal":"...","turn":"...","events":["..."]},
    {"act":"결","from":<int>,"to":${total},"goal":"...","turn":"...","events":["..."]}
  ],
  "beats": [
    {"n":<int>,"type":"${BEAT_TYPES[0]}","desc":"무슨 도파민이 터지는지 한 줄"}
  ]
}`;

  const user = `[작품]
${ipDigest(input)}

위 작품을 정확히 ${total}화 완결 기준으로 기승전결 + 도파민 비트 아웃라인(JSON)으로 설계하라.`;

  return { system, user };
}

/** LLM 응답에서 아웃라인 JSON을 견고하게 추출·정규화한다. */
function parseOutline(text, total = 25) {
  if (!text) return null;
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1 || e <= s) return null;
  const raw = text.slice(s, e + 1);
  const tryParse = (x) => { try { return JSON.parse(x); } catch { return null; } };
  const obj = tryParse(raw) || tryParse(raw.replace(/,(\s*[}\]])/g, "$1"));
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.acts)) return null;

  const strArr = (v, cap = 4) => Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean).slice(0, cap) : [];
  const acts = obj.acts.map((a) => ({
    act: String(a?.act || "").trim(),
    from: clampN(a?.from, total) || 1,
    to: clampN(a?.to, total) || total,
    goal: String(a?.goal || "").trim(),
    turn: String(a?.turn || "").trim(),
    events: strArr(a?.events, 4),
  })).filter((a) => a.act).sort((x, y) => x.from - y.from);
  if (!acts.length) return null;

  const beats = (Array.isArray(obj.beats) ? obj.beats : [])
    .map((b) => ({ n: clampN(b?.n, total), type: String(b?.type || "").trim(), desc: String(b?.desc || "").trim() }))
    .filter((b) => b.n && b.desc)
    .sort((x, y) => x.n - y.n);

  return {
    total,
    logline: String(obj.logline || "").trim(),
    endingType: String(obj.endingType || "").trim(),
    acts,
    beats,
  };
}

/** 키 없을 때의 결정론적 폴백. 기승전결을 비율로 나누고 비트를 규칙적으로 배치. */
function localOutline({ input, total = 25 }) {
  const g = getPlaybook(input.genre, input.subgenre);
  const cut = (r) => Math.max(1, Math.round(total * r));
  const a1 = cut(0.2), a2 = cut(0.55), a3 = cut(0.85);
  const acts = [
    { act: "기", from: 1, to: a1, goal: "주인공의 결핍·특권 제시와 첫 보상", turn: "특권이 공개되며 판에 들어선다", events: ["결핍과 부당한 사건", "특권(특수성)의 암시·공개", "첫 번째 작은 보상"] },
    { act: "승", from: a1 + 1, to: a2, goal: "반복 루프로 세력·실력·관계를 키운다", turn: "더 큰 적/판의 존재가 드러난다", events: ["반복 사건으로 성장", "조력자·관계 형성", "중간 보스와 충돌"] },
    { act: "전", from: a2 + 1, to: a3, goal: "복선 회수 시작, 적의 본진·진실 노출", turn: "주인공이 치명적 선택을 강요받는다", events: ["숨은 진실·반전", "최대 위기·상실", "금지된 선택"] },
    { act: "결", from: a3 + 1, to: total, goal: "핵심 갈등 해소와 카타르시스, 시즌 목표 달성", turn: "판을 뒤집고 결말, 차기 시즌 여운", events: ["최종 결전", "복선 일괄 회수", "결말 + 차기 떡밥"] },
  ];
  // 도파민 비트: 막 구간에 맞춰 규칙적으로 배치.
  const beats = [];
  const push = (n, type, desc) => { if (n >= 1 && n <= total) beats.push({ n, type, desc }); };
  push(Math.min(3, total), "각성", "주인공의 특권/특수성이 처음 빛난다");
  push(a1, "사이다", "무시하던 자들을 처음으로 통쾌하게 역전");
  for (let n = a1 + 3; n < a2; n += 4) push(n, "사이다", "반복 루프의 누적 보상이 터진다");
  push(Math.round((a1 + a2) / 2), "관계", "핵심 관계가 한 단계 가까워진다");
  push(a2, "반전", "예상을 뒤집는 진실의 일부가 드러난다");
  push(Math.round((a2 + a3) / 2), "위기", "주인공이 가장 크게 잃는 순간");
  push(a3, "반전", "적의 본진/설계자가 노출되고 금지된 선택을 강요");
  for (let n = a3 + 2; n < total; n += 2) push(n, "회수", "깔아둔 떡밥이 연쇄로 회수된다");
  push(total, "사이다", "시즌 목표 달성 — 판을 뒤집는 피날레 카타르시스");
  beats.sort((x, y) => x.n - y.n);

  return {
    total,
    logline: input.logline || `${input.ipTitle || "주인공"}의 ${genreLabel(input.genre)} 여정`,
    endingType: "1막(시즌) 완결 + 차기 시즌 떡밥",
    acts,
    beats,
    _local: true,
  };
}

/**
 * 특정 회차 n에 대한 '이번 회차 아웃라인 지침' 블록을 만든다.
 * 회차 집필 프롬프트에 주입되어 큰 구조와 배치된 도파민 비트가 설계대로 터지게 한다.
 */
function outlineGuideFor(outline, n) {
  if (!outline || !Array.isArray(outline.acts) || !outline.acts.length) return "";
  const act = outline.acts.find((a) => n >= a.from && n <= a.to) || outline.acts[outline.acts.length - 1];
  const here = (outline.beats || []).filter((b) => b.n === n);
  const soon = (outline.beats || []).filter((b) => b.n > n && b.n <= n + 2);
  const lines = [
    `## [이번 ${n}화 아웃라인 지침 — 큰 구조 + 도파민 설계]`,
    act ? `- 현재 막: ${act.act} (${act.from}~${act.to}화) · 막 목표: ${act.goal}${act.turn ? ` · 닫는 전환점: ${act.turn}` : ""}` : "",
    here.length
      ? `- 이번 화에 '반드시 터뜨릴' 도파민 비트: ${here.map((b) => `[${b.type}] ${b.desc}`).join(" / ")}`
      : `- 이번 화에 배치된 고정 비트는 없다. 막 목표를 향해 전진하되 회차 끝 절단(클리프행어)은 유지한다.`,
    soon.length ? `- 곧 다가올 비트(빌드업 해둘 것): ${soon.map((b) => `${b.n}화 [${b.type}]`).join(", ")}` : "",
    `- 이 회차는 위 막 목표를 향해 한 걸음 전진시키고, 배치된 비트가 있으면 장면으로 확실히 터뜨린다(설명 말고 사건으로).`,
  ].filter(Boolean);
  return lines.join("\n");
}

module.exports = { buildOutlinePrompt, parseOutline, localOutline, outlineGuideFor, BEAT_TYPES };
