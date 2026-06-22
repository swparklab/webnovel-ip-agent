"use strict";

/**
 * 세계관·캐논 일관성 (Canon Consistency).
 *
 * 캐릭터 LOCK(charactersheet)과 같은 패턴을 세계·설정에 적용한다.
 *  - 세계 설정 LOCK: 세계 규칙·금기·비용/보상·핵심 장소·반복 프롭·시각 코드를 재사용
 *    토큰으로 고정 → 모든 산출(콘티·그림풍·회차)에 주입해 회차/컷 간 설정이 안 흔들리게.
 *  - 캐논 연속성 검사: 산출물을 원시트·LOCK과 대조해 설정 모순/연속성 오류를 잡는 분석기.
 *
 * 키 없을 때 결정론 폴백 제공.
 */

const { resolveMedium, mediumLabel } = require("./medium");

/** 세계 설정 LOCK 주입 블록 — 토큰 있을 때만(없으면 ""). buildCharLockBlock과 동형. */
function buildWorldLockBlock(lockToken) {
  const t = String(lockToken || "").trim();
  if (!t) return "";
  return `[🌍 WORLD LOCK — 세계 설정 고정값, 모든 산출에서 이 규칙을 한 글자도 어기지 마라]
${t}
- 위 세계 규칙·금기·비용/보상·핵심 장소·반복 프롭·시각 코드를 회차·컷·장면이 바뀌어도 동일하게 유지한다. 새로 만들지 말고 이 설정 안에서만 전개한다.`;
}

/* ----------------------- 세계 설정 LOCK 생성 (world bible) ----------------------- */
function buildWorldBiblePrompt({ input = {}, oneSheet = {}, medium }) {
  const m = resolveMedium(medium);
  const title = String(input.ipTitle || "무제").trim();
  const seed = [
    input.sfPremise && `명제: ${input.sfPremise}`,
    input.socialShift && `세계/사회: ${input.socialShift}`,
    input.worldRule && `세계 규칙: ${input.worldRule}`,
    input.powerSystem && `힘 체계: ${input.powerSystem}`,
    input.coreObject && `핵심 오브젝트: ${input.coreObject}`,
    oneSheet.continuityBible && `연속성 바이블: ${oneSheet.continuityBible}`,
    oneSheet.centralObject && `중심 사물: ${oneSheet.centralObject}`,
  ].filter(Boolean).join("\n");
  const system = `너는 ${mediumLabel(m)} IP의 세계관 바이블을 설계하고 '고정값'으로 못 박는 설정 디렉터다.
회차·컷·장면이 아무리 늘어도 설정이 흔들리지 않도록, 세계의 규칙을 재사용 가능한 LOCK으로 압축한다.

[출력 — JSON 하나만. 코드펜스·설명 금지]
{
  "lockToken": "이 세계의 핵심 고정값을 35~70단어로 압축(세계 규칙·금기·힘의 비용/보상·시간/공간 법칙·시각 톤). 모든 산출 프롬프트에 그대로 반복 삽입할 재사용 토큰.",
  "rules": ["이 세계에서 반복 작동하는 규칙·법칙 4~6개(예: 능력에는 반드시 대가가 따른다 등)"],
  "taboos": ["깨면 안 되는 금기·제약 2~4개"],
  "costReward": "힘/마법/기술의 비용과 보상 구조 한 줄",
  "keyPlaces": ["핵심 장소 2~4개 + 한 줄 설정"],
  "recurringProps": ["반복 등장 핵심 프롭/오브젝트 2~4개 + 고정 묘사"],
  "visualCode": "이 세계의 시각/분위기 코드 한 줄(색·질감·시간대)",
  "negative": "이 세계에서 나오면 안 되는 것(설정 위반 요소) 한 줄"
}`;
  const user = `매체: ${mediumLabel(m)}
작품: ${title}
${seed || "(설정 입력이 비어 있음 — 명제/톤에서 합리적으로 구축)"}

위 작품의 세계 설정 바이블을 만들고 재사용 WORLD LOCK 토큰을 뽑아라(JSON).`;
  return { system, user };
}

function parseWorldBible(text) {
  if (!text) return null;
  const s = text.indexOf("{"); const e = text.lastIndexOf("}");
  if (s === -1 || e === -1 || e <= s) return null;
  let obj = null;
  try { obj = JSON.parse(text.slice(s, e + 1)); } catch { try { obj = JSON.parse(text.slice(s, e + 1).replace(/,(\s*[}\]])/g, "$1")); } catch { return null; } }
  if (!obj || !obj.lockToken) return null;
  const arr = (x) => (Array.isArray(x) ? x.map(String).filter(Boolean) : []);
  return {
    lockToken: String(obj.lockToken).trim(),
    rules: arr(obj.rules), taboos: arr(obj.taboos),
    costReward: String(obj.costReward || ""),
    keyPlaces: arr(obj.keyPlaces), recurringProps: arr(obj.recurringProps),
    visualCode: String(obj.visualCode || ""), negative: String(obj.negative || ""),
  };
}

function localWorldBible({ input = {}, oneSheet = {}, medium }) {
  const m = resolveMedium(medium);
  const obj = String((oneSheet && oneSheet.centralObject) || input.coreObject || "핵심 사물").split(/[—/(]/)[0].trim();
  const rule = String(input.worldRule || "능력에는 반드시 대가가 따른다").trim();
  const token = `[${mediumLabel(m)} 세계] 규칙: ${rule}. 핵심 사물 '${obj}'는 세계의 상징으로 일관 등장. 시각 톤·금기·비용 구조를 회차/컷 간 고정. 새 규칙을 즉흥으로 만들지 않는다.`;
  return {
    lockToken: token,
    rules: [rule, "세계의 법칙은 인물에게 예외를 두지 않는다", "정보는 대가를 치르고서야 열린다"],
    taboos: ["설정에 없는 새 능력/규칙을 즉흥 도입 금지", `'${obj}'의 의미를 회차마다 바꾸지 않기`],
    costReward: "큰 힘/정보를 얻으면 그만한 상실/대가를 치른다",
    keyPlaces: ["중심 무대 — 갈등이 반복되는 장소", "금기의 장소 — 규칙이 깨지는 곳"],
    recurringProps: [`${obj} — 세계의 상징`],
    visualCode: "일관된 색·질감·시간대로 세계의 정체성 유지",
    negative: "설정과 모순되는 능력·장소·톤",
    _local: true,
  };
}

/* --------------------- 캐논 연속성 검사 (analyzer) --------------------- */
function buildCanonCheckPrompt({ input = {}, medium, oneSheet = {}, worldLock = "", text = "" }) {
  const m = resolveMedium(medium);
  const refs = [
    oneSheet.theme && `주제: ${oneSheet.theme}`,
    oneSheet.centralObject && `중심 사물: ${oneSheet.centralObject}`,
    oneSheet.continuityBible && `연속성 바이블: ${oneSheet.continuityBible}`,
    input.worldRule && `세계 규칙: ${input.worldRule}`,
    worldLock && `WORLD LOCK: ${worldLock}`,
    input.characterLock && `CHARACTER LOCK: ${input.characterLock}`,
  ].filter(Boolean).join("\n");
  const system = `너는 ${mediumLabel(m)}의 캐논(설정) 감수자다. 산출물이 정해진 세계 설정·인물 설정·원시트와 모순되지 않는지 냉정하게 대조한다.

[기준 설정(캐논)]
${refs || "(명시 캐논이 적음 — 산출물 내부 일관성 위주로 검사)"}

[검사 항목] 세계 규칙 위반 / 인물 설정·말투 모순 / 능력·비용 구조 붕괴 / 시간선·장소 연속성 / 핵심 오브젝트 의미 변질 / 톤 이탈.

[출력 — JSON 하나만. 코드펜스·설명 금지]
{
  "overall": 0~100,
  "scores": { "세계규칙일관성":0~100, "인물일관성":0~100, "연속성":0~100, "상징일관성":0~100 },
  "flags": [ { "issue": "발견한 모순/연속성 오류", "severity": "high|medium|low", "where": "어디서(회차/장면/컷)" } ],
  "fixes": ["모순을 해소할 구체 수정 지시 3~6개"],
  "verdict": "한 줄 총평(캐논 안정성)"
}`;
  const user = `매체: ${mediumLabel(m)} · 작품: ${String(input.ipTitle || "무제").trim()}

## 검사할 산출물
${String(text || "").slice(0, 14000) || "(발췌 없음 — 산출물을 먼저 생성하세요)"}

위를 캐논 기준으로 대조해 모순/연속성 오류를 JSON으로 출력하라.`;
  return { system, user };
}

function localCanonCheck({ input = {}, medium, oneSheet = {}, text = "" }) {
  const t = String(text || "");
  const len = t.replace(/\s/g, "").length;
  const flags = [];
  if (len < 400) flags.push({ issue: "검사 대상 분량이 적어 캐논 검사 신뢰도가 낮다(산출물을 먼저 생성)", severity: "high", where: "" });
  const obj = String((oneSheet && oneSheet.centralObject) || input.coreObject || "").split(/[—/(]/)[0].trim();
  if (obj && t && !t.includes(obj)) flags.push({ issue: `중심 오브젝트 '${obj}'가 산출물에 드러나지 않음(상징 일관성 확인 필요)`, severity: "medium", where: "" });
  const base = Math.max(40, Math.min(88, 60 + (len >= 1500 ? 10 : len >= 600 ? 4 : -6)));
  return {
    overall: base,
    scores: { 세계규칙일관성: base, 인물일관성: base, 연속성: Math.max(35, base - 6), 상징일관성: obj && t.includes(obj) ? base + 4 : base - 10 },
    flags,
    fixes: [
      "원시트·WORLD LOCK·CHARACTER LOCK을 잠근 뒤 다시 생성하면 모순이 크게 줄어듭니다.",
      "정밀 캐논 대조는 API 키/구독 연결 후 가능합니다.",
    ],
    verdict: "캐논 검사 로컬 추정치입니다. LOCK을 채우고 키 연결 후 정밀 대조하세요.",
    fallback: true,
  };
}

module.exports = {
  buildWorldLockBlock,
  buildWorldBiblePrompt, parseWorldBible, localWorldBible,
  buildCanonCheckPrompt, localCanonCheck,
};
