"use strict";

/**
 * 회차 자체 피드백 (Self-Critique) — 하네스(harness) 버전.
 *
 * 두루뭉술한 칭찬 대신, '우리가 부여한 흥행 공식·코어·실패패턴'을 기준으로
 * 냉정하게 채점한다. 출력의 fixes/violations 는 '피드백 반영 보완'의
 * 강제 수정 지침으로 그대로 쓰여, before→after 개선을 측정 가능하게 만든다.
 */

const { buildInputBlock } = require("./agents");
const { getPlaybook, COMMON } = require("./playbook");

const AXES = ["몰입", "속도", "캐릭터", "개연성", "절단", "장르적합"];

// 비평/보완에 공통으로 박는 '공식·코어·실패패턴' 하네스 블록.
function harnessBlock(input) {
  const g = getPlaybook(input.genre, input.subgenre);
  return [
    `# 채점 기준 — 우리 작품의 공식과 코어 (이걸 벗어나면 감점)`,
    `- 장르 코어: ${g.core}`,
    `- 흥행 공식: ${g.formula}`,
    `- 핵심 독자 보상: ${g.reward}`,
    `- 반복 루프(회차 사건 생성기): ${g.loop}`,
    `- 작품 명제/코어(작가 지정): ${input.sfPremise || input.logline || "(미지정)"}`,
    `- 공통 성공 구조: ${COMMON.successFlow.join(" → ")}`,
    ``,
    `# 절대 범하면 안 되는 실패 패턴 (하나라도 있으면 violations에 적고 강하게 감점)`,
    COMMON.failurePatterns.map(([p, why]) => `- ${p} → ${why}`).join("\n"),
  ].join("\n");
}

function buildCritiquePrompt({ input, n, chapterText, ctx = {} }) {
  const system = `너는 깐깐하고 냉정한 웹소설 편집자다. 칭찬은 인색하게, 약점은 가차없이 지적한다. 기준 미달이면 과감히 낮은 점수를 준다(기본값은 '평범=5점'에서 시작해, 명확히 충족될 때만 올린다).

평가의 중심은 '잘 썼나'가 아니라 '우리가 부여한 흥행 공식과 코어를 이 회차가 실제로 이행하는가'다. 막연한 호평·총평 금지. 모든 지적은 공식/코어/실패패턴에 근거해야 한다.

[6축 점수 0~10] 몰입·속도·캐릭터(주인공 능동성)·개연성·절단·장르적합.
[공식충실도 formulaFit 0~100] 결핍→특권→회차 검증→즉시 보상(수치/지위/관계)→세계 확장 구조와 코어를 이 회차가 얼마나 이행했는가. 보상이 '눈에 보이게' 수치화됐는지, 주인공이 능동적으로 판을 바꿨는지를 특히 본다.

[원칙]
- violations: 위에 적힌 실패 패턴 중 이 회차가 범한 것을 그대로 적는다(없으면 빈 배열).
- fixes: '다음에 다시 쓸 때 바로 적용할' 구체적 행동 지시. 반드시 공식/코어에 맞춘 것. 추상어("더 흥미롭게") 금지. 무엇을·어디서·어떻게.
- 오직 JSON 객체 하나만 출력. 코드펜스·설명·인사말 금지.

{
  "overall": 0~100 정수,
  "formulaFit": 0~100 정수,
  "scores": { "몰입":0~10, "속도":0~10, "캐릭터":0~10, "개연성":0~10, "절단":0~10, "장르적합":0~10 },
  "violations": ["범한 실패 패턴(없으면 비움)"],
  "strengths": ["강점 1~3개"],
  "weaknesses": ["공식/코어 기준 약점 2~4개"],
  "fixes": ["공식·코어에 맞춘 구체적 수정 지시 3~6개"]
}`;

  const ctxBlock = ctx.plot ? `## [시즌 설계 참고]\n${String(ctx.plot).slice(0, 900)}` : "";
  const user = `${buildInputBlock(input)}\n\n${harnessBlock(input)}\n\n${ctxBlock}\n\n## [평가할 ${n}화 원고]\n${String(chapterText).slice(0, 7000)}\n\n위 ${n}화를 공식·코어·실패패턴 기준으로 냉정하게 채점하고 수정 지시(JSON)를 출력하라.`;
  return { system, user };
}

function parseCritique(text) {
  if (!text) return null;
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1 || e <= s) return null;
  const raw = text.slice(s, e + 1);
  let obj = null;
  try { obj = JSON.parse(raw); } catch { try { obj = JSON.parse(raw.replace(/,(\s*[}\]])/g, "$1")); } catch { return null; } }
  if (!obj || typeof obj !== "object") return null;
  const scores = {};
  AXES.forEach((a) => { scores[a] = Number(obj.scores?.[a]) || 0; });
  const arr = (x) => (Array.isArray(x) ? x.map(String).filter(Boolean) : []);
  return {
    overall: Number(obj.overall) || Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / AXES.length * 10),
    formulaFit: Number(obj.formulaFit) || 0,
    scores,
    violations: arr(obj.violations),
    strengths: arr(obj.strengths),
    weaknesses: arr(obj.weaknesses),
    fixes: arr(obj.fixes),
  };
}

// 결정론적 폴백(키 없을 때) — 길이/구조 기반의 거친 진단.
function localCritique(input, n, chapterText) {
  const t = String(chapterText || "");
  const len = t.replace(/\s/g, "").length;
  const short = len < 4500;
  const hasCliff = /다음 화 예고|시즌 피날레/.test(t);
  const hasReward = /(레벨|점수|등급|지위|랭킹|보상|획득|상승|호감|크레딧|돈|승급)/.test(t);
  const violations = [];
  if (short) violations.push("분량/밀도 부족 — 사건이 얕다");
  if (!hasReward) violations.push("보상이 추상적이다 (수치·지위·관계로 안 보임)");
  if (!hasCliff) violations.push("반복 루프/절단이 약하다");
  const formulaFit = Math.max(20, 90 - violations.length * 18 - (short ? 10 : 0));
  return {
    overall: short ? 64 : hasReward ? 80 : 72,
    formulaFit,
    scores: { 몰입: 7, 속도: short ? 5 : 8, 캐릭터: 7, 개연성: 7, 절단: hasCliff ? 8 : 5, 장르적합: 8 },
    violations,
    strengths: ["콘셉트와 사건이 분명함"],
    weaknesses: [
      short ? `분량이 짧아 결핍→특권→보상 한 사이클이 얕음(${len}자)` : "중반 전개가 평이",
      hasReward ? "보상의 체감 강도가 더 필요" : "보상이 수치/지위로 안 보임",
    ],
    fixes: [
      short ? "장면 전개·갈등을 더 깊게 늘려 5,000자 이상으로, 결핍→특권→검증→보상 한 사이클을 완결." : "회차 중반에 주인공의 능동적 선택을 1회 추가.",
      hasReward ? "보상을 더 구체적 수치/지위/관계 변화로 한 번 더 명시." : "이 회차의 보상을 레벨/점수/지위/호감 등 '눈에 보이는' 변화로 박아라.",
      hasCliff ? "마지막 절단을 더 구체적 위협/질문으로 날카롭게." : "마지막 문단을 다음 화를 부르는 강한 절단으로 교체.",
    ],
    fallback: true,
  };
}

module.exports = { buildCritiquePrompt, parseCritique, localCritique, AXES, harnessBlock };
