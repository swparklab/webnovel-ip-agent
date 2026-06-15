"use strict";

/**
 * 회차 자체 피드백 (Self-Critique).
 *
 * 생성된 한 회차를 한국 웹소설 독자/편집자 시선으로 냉정하게 평가하고,
 * 강점·약점과 '바로 적용 가능한 구체적 수정 지시(fixes)'를 낸다.
 * fixes 는 '피드백 반영 보완'에서 그대로 재집필 지침으로 쓰인다.
 */

const { buildInputBlock } = require("./agents");

const AXES = ["몰입", "속도", "캐릭터", "개연성", "절단", "장르적합"];

function buildCritiquePrompt({ input, n, chapterText, ctx = {} }) {
  const system = `너는 웹소설 편집자이자 냉정한 독자다. ${n}화 원고 하나를 평가하고, 바로 고칠 수 있는 구체적 지시를 낸다.

[평가 기준 — 6축, 각 0~10]
- 몰입(첫 문단 후킹·끌림), 속도(늘어짐 없는지), 캐릭터(주인공 능동성·매력·일관성),
  개연성(설정·전개의 설득력), 절단(다음 화를 클릭하게 하는 마무리), 장르적합(선택 장르 정서/관습).

[원칙]
- 칭찬만 하지 마라. 약점은 솔직하게. fixes는 추상어 금지, 다음 집필에 바로 반영 가능한 행동 지시로.
- 오직 JSON 객체 하나만 출력한다. 코드펜스·설명·인사말 금지.

{
  "overall": 0~100 정수,
  "scores": { "몰입":0~10, "속도":0~10, "캐릭터":0~10, "개연성":0~10, "절단":0~10, "장르적합":0~10 },
  "strengths": ["강점 2~3개"],
  "weaknesses": ["약점 2~4개"],
  "fixes": ["이 회차를 다시 쓸 때 적용할 구체적 수정 지시 3~5개"]
}`;

  const ctxBlock = [
    ctx.plot ? `## [시즌 설계 참고]\n${String(ctx.plot).slice(0, 900)}` : "",
  ].filter(Boolean).join("\n\n");

  const user = `${buildInputBlock(input)}\n\n${ctxBlock}\n\n## [평가할 ${n}화 원고]\n${String(chapterText).slice(0, 7000)}\n\n위 ${n}화를 6축으로 평가하고 수정 지시(JSON)를 출력하라.`;
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
    scores,
    strengths: arr(obj.strengths),
    weaknesses: arr(obj.weaknesses),
    fixes: arr(obj.fixes),
  };
}

// 결정론적 폴백(키 없을 때) — 길이/구조 기반의 거친 진단.
function localCritique(input, n, chapterText) {
  const len = String(chapterText || "").replace(/\s/g, "").length;
  const hasCliff = /다음 화 예고|시즌 피날레/.test(chapterText || "");
  const short = len < 4000;
  return {
    overall: short ? 68 : 80,
    scores: { 몰입: 7, 속도: short ? 6 : 8, 캐릭터: 7, 개연성: 7, 절단: hasCliff ? 8 : 5, 장르적합: 8 },
    strengths: ["콘셉트와 사건이 분명함", "장르 정서에 맞는 전개"],
    weaknesses: [short ? `분량이 다소 짧음(${len}자, 공백 제외)` : "중반 장면 전개가 평이할 수 있음", hasCliff ? "" : "마지막 절단이 약함"].filter(Boolean),
    fixes: [
      short ? "장면 전개와 갈등을 더 깊게(대사·내면·감각) 늘려 5,000자 이상으로." : "중반 한 장면에 예상 밖 변수를 추가해 긴장 강화.",
      "주인공이 수동적으로 끌려가지 않고 능동적 선택을 한 번 더 하게.",
      hasCliff ? "마지막 절단을 더 구체적 위협/질문으로 날카롭게." : "마지막 문단을 다음 화를 부르는 강한 절단으로 교체.",
    ],
    fallback: true,
  };
}

module.exports = { buildCritiquePrompt, parseCritique, localCritique, AXES };
