"use strict";

/**
 * 기획 아키텍트 (Concept Architect).
 *
 * 작가가 던진 막연한 아이디어 한 줄을 받아, 선택 장르의 흥행 문법에 맞춰
 * Core IP 폼 전체(제목·로그라인·명제·기술·제약·인물·세계규칙·시즌목표·톤 등)를
 * 구조화된 JSON으로 채운다. 프런트는 이 JSON을 폼에 그대로 적용한다.
 *
 * 파이프라인 에이전트가 아니라 "입력을 만들어 주는" 단발 LLM 호출이다.
 */

const { getPlaybook, buildPlaybookBlock } = require("./playbook");
const { GENRE_LABELS } = require("./agents");

// 기획 도우미가 채우는 필드(폼 id와 1:1). platform·cadence는 사용자가 직접 고른다.
const IDEATE_FIELDS = [
  ["ipTitle", "작품 제목 (장르 제목 문법에 맞게)"],
  ["targetReader", "타깃 독자 한 줄"],
  ["logline", "한 문장 로그라인 (주인공·핵심 장치·압력·보상 포함)"],
  ["futureYear", "시대/배경 시점"],
  ["sfPremise", "작품 명제 / 끝까지 붙들 핵심 질문"],
  ["coreTech", "핵심 소재·장치 (결핍을 뒤집는 특권)"],
  ["scienceConstraint", "핵심 제약·규칙 (장치의 대가·한계)"],
  ["socialShift", "세계·사회·관계 구조"],
  ["protagonist", "주인공 (이름·직업·결핍)"],
  ["desire", "주인공의 핵심 욕망"],
  ["aiEntity", "핵심 존재 (조력/적대/시스템: 이름·목적·태도)"],
  ["antagonist", "적대 압력"],
  ["worldRule", "세계 규칙 (금기·보상·비용)"],
  ["seasonGoal", "시즌 목표 (25화 안에 증명할 것)"],
  ["tone", "톤 앤 매너"],
  ["coreTags", "검색·태깅용 핵심 태그 6~10개 (콤마로)"],
  // 심화 기획(IP Bible)
  ["powerSystem", "힘·능력·마법 체계와 성장 등급 단계"],
  ["factions", "핵심 세력·진영·조직과 그 이해관계"],
  ["worldHistory", "작품 이전사·세계관 핵심 연표 사건 1~3개"],
  ["protagonistSecret", "주인공의 비밀·치명적 약점·숨긴 과거"],
  ["supportingCast", "조력자·동료들의 이름·역할·관계 2~3명"],
  ["loveInterest", "관계 상대·히로인과 관계 온도(없으면 빈 문자열)"],
  ["antagonistLogic", "적대자의 목적과 스스로 정당하다 믿는 논리"],
  ["centralConflict", "작품 전체를 관통하는 중심 갈등 한 줄"],
  ["coreMystery", "끝까지 끌고 갈 중심 떡밥·미스터리"],
  ["twistPlan", "계획된 큰 반전과 주인공의 금지된 선택/딜레마"],
  ["payoffPlan", "성장 단계 슬로프와 떡밥 회수 계획"],
  ["theme", "작품의 주제의식·메시지(결국 무엇에 대한 이야기인가)"],
  ["usp", "유사작과 다른 결정적 차별점(USP) 한 줄"],
  ["comps", "비교작·레퍼런스(예: A의 세계관 × B의 속도)"],
  ["contentRating", "연령등급·수위(전체·15·19, 잔혹·선정 정도)"],
];

const FIELD_KEYS = IDEATE_FIELDS.map((f) => f[0]);
const GENRE_CODES = Object.keys(GENRE_LABELS);

function buildIdeatePrompt(idea, genre, subgenre, blendGenres) {
  const g = getPlaybook(genre, subgenre);
  const genreList = GENRE_CODES.map((c) => `${c}=${GENRE_LABELS[c]}`).join(", ");
  const fieldSpec = IDEATE_FIELDS.map(([k, desc]) => `  "${k}": "${desc}"`).join(",\n");

  const system = `너는 웹소설 기획 아키텍트다. 작가가 던진 막연한 아이디어 한 줄을 받아, 선택 장르의 흥행 문법에 맞춰 연재 가능한 Core IP 설정으로 구조화한다.

[원칙]
- 장르명을 나열하지 말고 '결핍 → 특권(주인공 특수성) → 회차 검증 → 즉시 보상 → 세계 확장' 구조가 드러나게 각 필드를 채운다.
- 아래 흥행 문법(주인공 유형·5화 공식·반복 루프·제목 문법·생성 변수·실패 패턴)을 적극 활용한다.
- 아이디어가 빈약해도 작가의 의도를 살려 구체적이고 매력적인 설정으로 확장한다. 단, 아이디어의 핵심 소재는 반드시 유지한다.
- 현재 선택 장르가 아이디어와 잘 안 맞으면 더 적합한 장르 코드로 바꾸고 "genre"에 그 코드를 넣는다.

[장르 코드 목록] ${genreList}

${buildPlaybookBlock(genre, subgenre, blendGenres)}
${g.sub ? `\n[세부 장르] '${g.sub.label}'의 성공 방정식을 정확히 따른다: ${g.sub.formula}` : ""}

[출력 형식 — 매우 중요]
- 오직 JSON 객체 하나만 출력한다. 코드펜스(\`\`\`)·설명·인사말 금지.
- 모든 값은 한국어 문자열. 빈 값 없이 모두 채운다.
- 키는 정확히 아래와 같다(추가/누락 금지). "genre"는 ${GENRE_CODES.join("|")} 중 하나의 코드.

{
  "genre": "장르 코드",
${fieldSpec}
}`;

  const user = `장르(현재 선택): ${g.label} (${g.key})
작가의 아이디어: ${String(idea).trim()}

위 아이디어로 Core IP 설정 JSON을 작성하라.`;

  return { system, user };
}

/** LLM 응답 텍스트에서 첫 JSON 객체를 견고하게 추출한다. */
function extractFields(text) {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const raw = text.slice(start, end + 1);
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
  let obj = tryParse(raw) || tryParse(raw.replace(/,(\s*[}\]])/g, "$1"));
  if (!obj || typeof obj !== "object") return null;
  // 알려진 키만 남기고 문자열로 정규화한다.
  const out = {};
  if (typeof obj.genre === "string" && GENRE_CODES.includes(obj.genre.trim())) {
    out.genre = obj.genre.trim();
  }
  FIELD_KEYS.forEach((k) => {
    if (obj[k] != null) out[k] = String(obj[k]).trim();
  });
  return Object.keys(out).length ? out : null;
}

/** API/CLI 실패 또는 local 모드일 때의 결정론적 폴백. 장르 프리셋에 아이디어를 녹인다. */
function localIdeate(idea, genre, subgenre) {
  const g = getPlaybook(genre, subgenre);
  const preset = g.preset || {};
  const text = String(idea || "").trim();
  const fields = { genre: g.key };
  FIELD_KEYS.forEach((k) => { if (preset[k] != null) fields[k] = preset[k]; });
  if (text) {
    // 아이디어를 로그라인/명제에 직접 반영해 '내 아이디어가 반영됐다'는 체감을 준다.
    fields.logline = text.length >= 12 ? text : (preset.logline || text);
    fields.sfPremise = preset.sfPremise || `${text} — 이 전제가 인물의 선택을 어떻게 압박하는가?`;
    if (!preset.ipTitle) fields.ipTitle = text.replace(/[.!?]/g, "").slice(0, 24);
    if (!fields.coreTags && Array.isArray(g.devices)) {
      fields.coreTags = g.devices.map((d) => d[0]).slice(0, 6).join(", ");
    }
  }
  return fields;
}

module.exports = { buildIdeatePrompt, extractFields, localIdeate, IDEATE_FIELDS, FIELD_KEYS };
