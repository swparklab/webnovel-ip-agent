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
  // 명시된 유한 숫자는 그대로 존중한다(0점도 유효). 없을 때만 fallback.
  const num = (v, fb) => { const n = Number(v); return Number.isFinite(n) ? n : fb; };
  const scores = {};
  AXES.forEach((a) => { scores[a] = num(obj.scores?.[a], 0); });
  const arr = (x) => (Array.isArray(x) ? x.map(String).filter(Boolean) : []);
  return {
    overall: num(obj.overall, Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / AXES.length * 10)),
    formulaFit: num(obj.formulaFit, 0),
    scores,
    violations: arr(obj.violations),
    strengths: arr(obj.strengths),
    weaknesses: arr(obj.weaknesses),
    fixes: arr(obj.fixes),
  };
}

/**
 * 회차 텍스트에서 흥행 채점 신호를 추출한다(결정론적). localCritique·테스트가 공유한다.
 * 생성기(scoringTargetBlock)가 강제하는 항목과 1:1로 대응한다.
 */
function scoreSignals(chapterText) {
  const t = String(chapterText || "");
  const len = t.replace(/\s/g, "").length;
  const rewardTokens = t.match(/(레벨|등급|점수|랭킹|지위|호감|획득|상승|승급|보상|크레딧|코인|포인트|공헌)/g) || [];
  const rewardDistinct = new Set(rewardTokens).size;
  // '수치화된 보상' — 단위가 붙은 숫자, 또는 보상어 근처의 숫자(회차 제목의 'N화'는 제외).
  const quantReward = /\d+\s*(점|레벨|등급|랭크|위|골드|코인|포인트|크레딧|배|%|％)|(?:호감도|점수|등급|랭킹|공헌)\s*[^\n]{0,4}\d/.test(t);
  const agency = /(선택했다|선택하기로|나섰다|뒤집었다|움직였다|움직이기로|결심했다|먼저 두었다|먼저 움직|손을 뻗었다|깨뜨렸다|깨뜨리기로)/.test(t);
  const cliff = /(다음 화 예고|시즌 피날레|돌이킬 수 없|시작되려)/.test(t);
  const foreshadow = /(떡밥|복선|진실|정체|비밀|징조|미끼|실마리)/.test(t);
  return { len, rewardDistinct, quantReward, agency, cliff, foreshadow, midLen: len >= 900, fullLen: len >= 1500 };
}

// 결정론적 폴백(키 없을 때) — 신호 가산식 루브릭. 잘 갖춰진 1차 ≥80, 보강본 ≥90.
function localCritique(input, n, chapterText) {
  const s = scoreSignals(chapterText);

  let overall = 54;
  overall += s.fullLen ? 6 : s.midLen ? 4 : 0;
  overall += s.rewardDistinct >= 3 ? 17 : s.rewardDistinct === 2 ? 13 : s.rewardDistinct === 1 ? 8 : 0;
  overall += s.quantReward ? 10 : 0;
  overall += s.agency ? 8 : 0;
  overall += s.cliff ? 7 : 0;
  overall += s.foreshadow ? 5 : 0;
  overall = Math.max(40, Math.min(100, overall));

  let formulaFit = 42;
  formulaFit += s.rewardDistinct >= 3 ? 28 : s.rewardDistinct === 2 ? 22 : s.rewardDistinct === 1 ? 16 : 0;
  formulaFit += s.quantReward ? 8 : 0;
  formulaFit += s.agency ? 16 : 0;
  formulaFit += s.cliff ? 8 : 0;
  formulaFit += s.midLen ? 6 : 0;
  formulaFit = Math.max(20, Math.min(100, formulaFit));

  const violations = [];
  if (!s.midLen) violations.push("분량/밀도 부족 — 사건이 얕다");
  if (s.rewardDistinct === 0) violations.push("보상이 추상적이다 (수치·지위·관계로 안 보임)");
  if (!s.cliff) violations.push("반복 루프/절단이 약하다");
  if (!s.agency) violations.push("주인공이 관찰자에 머문다 (판을 바꾸는 선택 부재)");

  const clamp = (v) => Math.max(3, Math.min(10, v));
  return {
    overall,
    formulaFit,
    scores: {
      몰입: clamp(7 + (s.foreshadow ? 1 : 0) + (s.midLen ? 1 : 0)),
      속도: clamp(5 + (s.midLen ? 3 : 0)),
      캐릭터: clamp(6 + (s.agency ? 3 : 0)),
      개연성: clamp(7 + (s.quantReward ? 1 : 0)),
      절단: clamp(5 + (s.cliff ? 4 : 0)),
      장르적합: clamp(7 + (s.rewardDistinct >= 1 ? 2 : 0)),
    },
    violations,
    strengths: [
      s.agency ? "주인공이 능동적으로 판을 바꾼다" : "콘셉트와 사건이 분명함",
      s.rewardDistinct >= 1 ? "보상이 눈에 보이는 변화로 드러난다" : "전개의 방향이 또렷하다",
    ],
    weaknesses: [
      s.rewardDistinct >= 2 ? "보상의 체감 강도를 한 번 더 끌어올릴 여지" : "보상을 수치/지위/관계로 더 선명히",
      s.fullLen ? "후반 밀도를 균질하게" : "분량을 늘려 사이클을 더 깊게",
    ],
    fixes: [
      s.quantReward ? "수치 보상을 1회 더, 관계 변화까지 함께 박아 체감을 키워라." : "이 회차의 보상을 레벨/점수/등급/지위/호감 등 '눈에 보이는' 수치·관계 변화로 박아라.",
      s.agency ? "능동적 선택의 대가(리스크)를 한 장면 더 보여 개연성을 높여라." : "회차 중반에 주인공이 직접 판을 바꾸는 능동적 선택을 1회 추가하라.",
      s.cliff ? "절단을 더 구체적 위협/질문으로 날카롭게." : "마지막 문단을 다음 화를 부르는 강한 절단으로 교체하라.",
    ],
    fallback: true,
  };
}

module.exports = { buildCritiquePrompt, parseCritique, localCritique, scoreSignals, AXES, harnessBlock };
