"use strict";

/**
 * 매체 부가 기능 (Media Features) — 매체 파이프라인을 둘러싼 고객 중심 기능 모듈.
 *
 * 웹소설 제작실이 가진 부가기능(임팩트 진단·자가비평·완성도 심사·도구상자·보상체계
 * 권장값)을 매체(애니/영화/다큐/드라마/광고) 맥락으로 옮기고, 매체 고유 기능
 * (감독 스타일 프리셋·크로스미디어 변환)을 추가한다.
 *
 * 모든 빌더는 lib/medium.js(성공방정식·연출·구조타깃)에 근거해 프롬프트를 만들며,
 * 키 없을 때를 위한 결정론 폴백을 함께 제공한다(local 모드·테스트 대상).
 */

const {
  MEDIA, resolveMedium, resolveFormat, mediumLabel, formatLabel,
  mediumSuccessEquation, mediumStructureTarget, buildMediumBlock, mediumDirectingBlock,
} = require("./medium");

/* ============================================================================
 * 1. 매체별 권장 보상/연출 스티어링 (8축, 기존 steering 바 재사용)
 *    웹소설 장르 권장값과 동형. 매체를 고르면 그 매체 흐름에 맞는 기본값이 깔린다.
 *    축: world(설정/세계) · dopamine(임팩트/사이다) · romance(관계/감정) ·
 *        action(긴장/스펙터클) · mystery(미스터리/정보밀도) · creativity(독창) ·
 *        pacing(속도) · style(문체/비주얼 농도)
 * ========================================================================== */
const MEDIA_STEERING = {
  webnovel:    { world: 56, dopamine: 76, romance: 46, action: 64, mystery: 56, creativity: 52, pacing: 70, style: 62 },
  film:        { world: 64, dopamine: 50, romance: 52, action: 62, mystery: 64, creativity: 74, pacing: 56, style: 78 },
  animation:   { world: 70, dopamine: 64, romance: 54, action: 72, mystery: 56, creativity: 76, pacing: 64, style: 82 },
  documentary: { world: 72, dopamine: 34, romance: 40, action: 38, mystery: 70, creativity: 60, pacing: 48, style: 62 },
  drama:       { world: 58, dopamine: 66, romance: 72, action: 56, mystery: 74, creativity: 60, pacing: 64, style: 70 },
  advertising: { world: 38, dopamine: 80, romance: 50, action: 64, mystery: 40, creativity: 84, pacing: 90, style: 80 },
};
const STEER_KEYS = ["world", "dopamine", "romance", "action", "mystery", "creativity", "pacing", "style"];

function recommendedMediaSteering(medium) {
  const base = MEDIA_STEERING[resolveMedium(medium)] || MEDIA_STEERING.webnovel;
  const out = {};
  STEER_KEYS.forEach((k) => {
    const n = Math.round(Number(base[k]));
    out[k] = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
  });
  return out;
}

/* ============================================================================
 * 2. 감독/연출 스타일 프리셋 (Director / Style Presets)
 *    매체마다 3~4개의 연출 톤 프리셋. 선택 시 모든 매체 에이전트 프롬프트에
 *    '연출 톤 구속'으로 주입된다(고개입 사용자의 강력한 방향 레버).
 * ========================================================================== */
const DIRECTOR_PRESETS = {
  film: [
    ["humanDrama", "감정 휴먼드라마", "절제된 미장센·자연광·롱테이크, 인물 감정의 결을 따라가는 잔잔하지만 깊은 연출. 음악은 최소, 침묵과 표정으로 감정을 끌어낸다."],
    ["genreThriller", "스타일리시 장르 스릴러", "강한 콘트라스트 조명·과감한 카메라 무빙·빠른 교차편집. 긴장과 비주얼 임팩트를 동시에. 사운드 디자인으로 불안을 증폭."],
    ["artMinimal", "미니멀 예술영화", "고정 프레임·여백·자연음 중심. 설명을 배제하고 이미지의 함축으로 주제를 전한다. 느린 호흡과 상징적 미장센."],
    ["blockbuster", "블록버스터 스펙터클", "스케일 큰 와이드숏·다이내믹 액션·웅장한 스코어. 명확한 영웅 서사와 강한 시청각 쾌감, 빠른 페이싱."],
  ],
  animation: [
    ["warmCel", "감성 셀 애니(따뜻한 정서)", "부드러운 색·자연 배경 미술·서정적 음악. 일상의 빛과 바람을 정성껏 그려 정서적 울림을 만든다. 정적인 호흡을 두려워하지 않는다."],
    ["dynamicAction", "다이내믹 액션 작화", "역동적 레이아웃·과장된 모션·임팩트 프레임·이펙트 폭발. 컷의 속도감과 작화 밀도로 카타르시스를 만든다."],
    ["popKitsch", "키치·팝 스타일", "채도 높은 색·과감한 디자인·리듬감 있는 편집. 위트와 개성으로 강한 인상을 남긴다."],
    ["theatricalDrama", "정통 극장판 드라마", "정교한 미술·풀 오케스트라·영화적 연출 호흡. 캐릭터 아크와 주제를 묵직하게 끌고 간다."],
  ],
  documentary: [
    ["observational", "관찰형(다이렉트 시네마)", "내레이션·인터뷰를 최소화하고 현장을 관찰. 핸드헬드·현장음·긴 호흡으로 날것의 진실을 담는다."],
    ["investigative", "내레이션 주도 탐사", "강한 내레이션과 자료·그래픽으로 논점을 추적. 인터뷰·아카이브를 증거로 배치해 설득력을 쌓는다."],
    ["interviewMosaic", "인터뷰 모자이크", "다수 인물의 증언을 교차 편집해 입체적 진실을 구성. 표정 클로즈업과 정적의 편집으로 감정을 끌어낸다."],
    ["poeticEssay", "시적·에세이 다큐", "이미지와 사색적 내레이션, 음악으로 정서와 사유를 전한다. 사실 너머의 감정적 진실에 집중."],
  ],
  drama: [
    ["bingeThriller", "몰아보기 스릴러", "매 화 강한 훅과 클리프행어·빠른 편집·긴장된 OST. 시즌 미스터리를 촘촘히 깔아 자동재생을 부른다."],
    ["melodrama", "감성 멜로", "인물 관계와 감정선 중심·따뜻한 색·서정적 OST. 투샷·시선 처리로 설렘과 아픔을 끌어낸다."],
    ["noir", "텐션 누아르", "어둡고 스타일리시한 톤·낮은 키 조명·도덕적 회색지대. 분위기와 캐릭터의 욕망으로 끌고 간다."],
    ["humanComedy", "휴먼 코미디", "따뜻한 유머와 생활감·경쾌한 편집. 캐릭터 매력과 관계의 재미로 몰입시킨다."],
  ],
  advertising: [
    ["emotionalStory", "감성 스토리텔링", "짧은 서사로 공감을 만들고 브랜드를 결말에 연결. 음악과 표정으로 울림을, 마지막에 메시지를 각인."],
    ["humorViral", "유머·바이럴", "예상 밖 반전과 위트로 3초 안에 시선을 강탈. 공유하고 싶게 만드는 펀치라인과 리듬."],
    ["visualImpact", "임팩트 비주얼", "강렬한 이미지·과감한 색·역동적 컷. 제품의 매력을 시각적 충격으로 각인시킨다."],
    ["persuasive", "정보·설득형", "명확한 베네핏 제시와 시연·근거. 신뢰감 있는 톤과 또렷한 CTA로 행동을 유도."],
  ],
};

function directorPresets(medium) {
  return DIRECTOR_PRESETS[resolveMedium(medium)] || [];
}

/** 선택된 연출 스타일을 프롬프트 구속 블록으로. (없으면 "") */
function directorPresetBlock(medium, key) {
  const found = directorPresets(medium).find((p) => p[0] === key);
  if (!found) return "";
  return `# 연출 톤 구속 (작가 지정 스타일: ${found[1]})\n- ${found[2]}\n- 모든 파트의 연출값(색·카메라·음악·편집·페이싱)을 이 톤으로 일관되게 맞춘다.`;
}

/* ============================================================================
 * 3. 매체 임팩트 진단 (Before → After). 웹소설 impact의 매체판.
 *    parseImpact(impact.js)와 동일한 JSON 스키마를 쓴다(프론트 렌더 재사용).
 * ========================================================================== */
function describeSeed(idea, input = {}) {
  const bits = [];
  if (idea && String(idea).trim()) bits.push(`아이디어 한 줄: ${String(idea).trim()}`);
  const pick = (k, label) => { if (input[k] && String(input[k]).trim()) bits.push(`${label}: ${String(input[k]).trim()}`); };
  pick("ipTitle", "현재 제목");
  pick("logline", "현재 로그라인");
  pick("sfPremise", "명제/핵심 질문");
  pick("protagonist", "주인공/핵심 인물");
  pick("coreTech", "핵심 소재");
  pick("centralConflict", "중심 갈등");
  pick("seasonGoal", "작품 목표");
  return bits.length ? bits.join("\n") : String(idea || "").trim();
}

function buildMediaImpactPrompt(idea, input, medium, format) {
  const m = resolveMedium(medium);
  const f = resolveFormat(format);
  const seed = describeSeed(idea, input);
  const system = `너는 ${mediumLabel(m)} 업계의 냉정한 기획 평가자이자 흥행 닥터다.
가져온 '막연한 아이디어'를 보고 두 미래를 진단한다.
  (A) BEFORE: 이 상태 그대로 '혼자' 만들었을 때 흔히 겪는 약점과 실패.
  (B) AFTER : 이 솔루션(매체 성공 방정식 정렬 · 파트별 연출 설계 · 자가비평·완성도 심사)을 통과했을 때.

[평가 원칙]
- BEFORE는 정직하게 낮게. ${mediumLabel(m)}에서 흔한 전형적 약점을 구체적으로(약한 훅·흐릿한 전제·구조 붕괴·감정 설계 부재·연출 구체성 부족 등).
- AFTER는 같은 아이디어의 씨앗은 보존하되 매체 성공 방정식으로 끌어올린 모습. 과장 금지.
- before.score < after.score (둘 다 0~100 정수, 보통 BEFORE 35~55, AFTER 78~92).
- 한국어. 구체적이고 짧게.

${buildMediumBlock(m, f)}

[출력 — JSON 하나만. 코드펜스·설명 금지. 키 정확히 준수]
{
  "verdict": "이 아이디어의 가능성을 한 문장으로(씨앗은 좋은가, 무엇을 더해야 하는가)",
  "genreFit": "이 아이디어에 가장 맞는 ${mediumLabel(m)} 결/톤을 한 줄로",
  "before": {
    "score": 0,
    "logline": "혼자 만들 때 나오기 쉬운 밋밋한 로그라인 1개",
    "title": "평범하게 지을 법한 제목 1개",
    "missing": ["지금 빠져 있는 흥행/연출 요소 3~4개(짧게)"],
    "risks": ["혼자 만들면 실제로 터질 문제 3개"]
  },
  "after": {
    "score": 0,
    "logline": "매체 성공 방정식으로 끌어올린 로그라인 1개",
    "titles": ["흥행형 제목 3개"],
    "hook": "관객을 사로잡는 오프닝/3초 후크 1줄",
    "upgrades": ["이 솔루션이 보강하는 핵심 4개(짧게)"],
    "guarantees": ["구조적으로 보장하는 것 4개(예: 성공방정식 정렬, 파트별 감동·연출값 설계, 자가비평 보완, 완성도 심사)"]
  },
  "keyChanges": ["BEFORE→AFTER 핵심 변화 3개('무엇이→무엇으로')"]
}`;
  const user = `매체: ${mediumLabel(m)} · 포맷: ${formatLabel(f)}

[진단 대상 — 날것 아이디어/현재 상태]
${seed}

위 아이디어로 ${mediumLabel(m)} Before→After 임팩트 리포트(JSON)를 작성하라.`;
  return { system, user };
}

/** 매체 임팩트 결정론 폴백 (parseImpact와 동일 스키마). */
function localMediaImpact(idea, input, medium, format) {
  const m = resolveMedium(medium);
  const seedLine = (idea && String(idea).trim()) || input.logline || `${mediumLabel(m)} 아이디어 한 줄`;
  const dims = MEDIA[m].directing.dimensions;
  return {
    verdict: `씨앗은 있지만 성공 방정식과 파트별 연출 설계가 흐려, 지금 상태로는 ${mediumLabel(m)}으로 통하기 어렵습니다.`,
    genreFit: `${mediumLabel(m)} — ${mediumSuccessEquation(m)}`,
    before: {
      score: 45,
      logline: seedLine,
      title: String(input.ipTitle || "무제").trim(),
      missing: ["강한 전제/훅이 약함", "파트별 감동 설계가 없음", `연출값(${dims.slice(0, 2).join("·")} 등)이 구체적이지 않음`, "구조 전환점이 흐림"],
      risks: ["초반에 시선을 못 잡아 이탈", "중반이 늘어짐", "주제를 설명으로 전달", "연출이 추상적이라 현장에서 안 통함"],
    },
    after: {
      score: 86,
      logline: `${seedLine} — ${mediumLabel(m)} 성공 방정식으로 끌어올린 버전.`,
      titles: [String(input.ipTitle || "무제").trim()],
      hook: "첫 순간에 시선을 강탈하는 강한 오프닝 훅.",
      upgrades: ["성공 방정식에 정렬", "파트별 감동·연출값 설계", "자가비평으로 약점 보완", "완성도 심사 통과"],
      guarantees: ["매체 성공 방정식 정렬", "파트별 감동 곡선 + 연출값 설계", "자가비평·보완 루프", "완성도 자동 심사"],
    },
    keyChanges: [
      "밋밋한 한 줄 → 매체 성공 방정식이 박힌 전제",
      "연출 부재 → 파트별 감동 요소 + 구체 연출값",
      "휘발되는 기획 → 구조 전환점이 설계된 완성형",
    ],
    _local: true,
  };
}

/* ============================================================================
 * 4. 매체 자가비평 (산출물 평가 → 개선 지침). 웹소설 critique의 매체판.
 *    한 에이전트 산출물(특히 ★연출 설계)을 성공방정식·연출 기준으로 채점.
 * ========================================================================== */
const MEDIA_AXES = ["콘셉트", "구조", "감정설계", "연출구체성", "독창성", "완성도"];

function buildMediaCritiquePrompt({ input, medium, format, targetName = "산출물", text }) {
  const m = resolveMedium(medium);
  const f = resolveFormat(format);
  const system = `너는 깐깐하고 냉정한 ${mediumLabel(m)} 기획·연출 디렉터다. 칭찬은 인색하게, 약점은 가차없이 지적한다. 기준 미달이면 과감히 낮은 점수를 준다(평범=5점에서 시작).

평가의 중심은 '잘 만들었나'가 아니라 '이 매체의 성공 방정식과 연출 설계를 이 산출물이 실제로 이행하는가'다.

[6축 점수 0~10] ${MEDIA_AXES.join("·")}.
[방정식충실도 equationFit 0~100] 매체 성공 방정식과 파트별 감동·연출값 설계를 얼마나 이행했는가. 연출값이 추상어가 아니라 구체값(색·렌즈·음악·편집·페이싱)으로 박혔는지를 특히 본다.

${buildMediumBlock(m, f)}

[원칙]
- violations: 매체 실패 패턴 중 범한 것을 적는다(없으면 빈 배열).
- fixes: '다시 만들 때 바로 적용할' 구체 행동 지시(무엇을·어디서·어떻게). 추상어 금지. 매체 성공 방정식·연출에 맞춘 것.
- 오직 JSON 하나만. 코드펜스·설명 금지.

{
  "overall": 0~100,
  "equationFit": 0~100,
  "scores": { "콘셉트":0~10, "구조":0~10, "감정설계":0~10, "연출구체성":0~10, "독창성":0~10, "완성도":0~10 },
  "violations": ["범한 실패 패턴(없으면 비움)"],
  "strengths": ["강점 1~3개"],
  "weaknesses": ["성공방정식·연출 기준 약점 2~4개"],
  "fixes": ["구체적 수정 지시 3~6개"]
}`;
  const user = `매체: ${mediumLabel(m)} · 포맷: ${formatLabel(f)}
평가 대상: ${targetName}

## [평가할 산출물]
${String(text || "").slice(0, 7000)}

위 산출물을 매체 성공 방정식·연출 기준으로 냉정하게 채점하고 수정 지시(JSON)를 출력하라.`;
  return { system, user };
}

function parseMediaCritique(text) {
  if (!text) return null;
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1 || e <= s) return null;
  const raw = text.slice(s, e + 1);
  let obj = null;
  try { obj = JSON.parse(raw); } catch { try { obj = JSON.parse(raw.replace(/,(\s*[}\]])/g, "$1")); } catch { return null; } }
  if (!obj || typeof obj !== "object") return null;
  const num = (v, fb) => { const n = Number(v); return Number.isFinite(n) ? n : fb; };
  const scores = {};
  MEDIA_AXES.forEach((a) => { scores[a] = num(obj.scores?.[a], 0); });
  const arr = (x) => (Array.isArray(x) ? x.map(String).filter(Boolean) : []);
  return {
    overall: num(obj.overall, Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / MEDIA_AXES.length * 10)),
    equationFit: num(obj.equationFit, 0),
    scores,
    violations: arr(obj.violations),
    strengths: arr(obj.strengths),
    weaknesses: arr(obj.weaknesses),
    fixes: arr(obj.fixes),
  };
}

function localMediaCritique(input, medium, format, text) {
  const t = String(text || "");
  const len = t.replace(/\s/g, "").length;
  const m = resolveMedium(medium);
  const dims = MEDIA[m].directing.dimensions;
  // 연출값 차원이 산출물에 실제로 언급됐는지(구체성 신호).
  const dimHits = dims.filter((d) => t.includes(d.split("(")[0].split("·")[0])).length;
  const hasTable = /\|.*\|/.test(t);
  const hasEmotion = /(감동|감정|울림|긴장|카타르시스|여운|공감|충격)/.test(t);
  let overall = 52 + (len >= 1200 ? 8 : len >= 600 ? 4 : 0) + dimHits * 4 + (hasTable ? 8 : 0) + (hasEmotion ? 6 : 0);
  overall = Math.max(40, Math.min(100, overall));
  let equationFit = 44 + dimHits * 6 + (hasTable ? 10 : 0) + (hasEmotion ? 8 : 0);
  equationFit = Math.max(20, Math.min(100, equationFit));
  const violations = [];
  if (dimHits < 2) violations.push("연출값이 구체적이지 않다(색·카메라·음악·편집 등으로 안 박힘)");
  if (!hasEmotion) violations.push("파트별 끌어낼 감정이 분명하지 않다");
  const clamp = (v) => Math.max(3, Math.min(10, v));
  return {
    overall, equationFit,
    scores: {
      콘셉트: clamp(6 + (hasEmotion ? 1 : 0)),
      구조: clamp(6 + (hasTable ? 2 : 0)),
      감정설계: clamp(5 + (hasEmotion ? 3 : 0)),
      연출구체성: clamp(4 + dimHits),
      독창성: clamp(6),
      완성도: clamp(5 + (len >= 1200 ? 2 : 0)),
    },
    violations,
    strengths: [hasTable ? "파트별 구조가 표로 정리됨" : "방향이 또렷함", hasEmotion ? "감정 설계가 드러남" : "콘셉트가 분명함"],
    weaknesses: [dimHits < 3 ? "연출값을 더 구체적 수치/색/음악으로" : "파트별 감정 곡선의 강약을 더 선명히", "독창성을 한 단계 더"],
    fixes: [
      `각 파트의 연출값을 ${dims.slice(0, 3).join("·")} 등 구체값으로 1줄씩 박아라.`,
      "파트마다 '끌어낼 감정 1개 + 그를 만드는 연출 기법'을 분명히 하라.",
      "성공 방정식의 흐름이 처음→절정→여운으로 이어지게 배치하라.",
    ],
    fallback: true,
  };
}

/* ============================================================================
 * 5. 매체 완성도 심사 (전체 산출물 → 매체 루브릭 채점). audit의 매체판.
 * ========================================================================== */
const MEDIA_DIMS = ["기획력", "구조", "감정설계", "연출구체성", "독창성", "시장성", "완성도"];

function buildMediaAuditPrompt({ input, medium, format, digest }) {
  const m = resolveMedium(medium);
  const f = resolveFormat(format);
  const system = `너는 ${mediumLabel(m)} 분야의 까다로운 심사위원단(투자·편성·페스티벌 심사 수준)이다. 후하게 주지 마라.

[심사 렌즈 — 각 0~100]
- 기획력: 전제·로그라인의 강도와 차별성
- 구조: ${mediumStructureTarget(m, f).actModel} 설계·페이싱·전환점의 응집
- 감정설계: 파트별 감동 곡선이 설계되어 있는가
- 연출구체성: 연출값(색·카메라·음악·편집·페이싱)이 추상어 아닌 구체값으로 박혔는가
- 독창성: 기시감/클리셰의 부재 (어디서 본 듯하면 어디인지 짚어라)
- 시장성: 타깃·채널에서 통할 상업적 잠재력
- 완성도: 일관성·디테일·실현 가능성

${buildMediumBlock(m, f)}

[필수]
- fatalWeaknesses: 레드팀으로서 '왜 투자/편성/수상에서 떨어질 수 있는가'를 치명적인 것부터.
- 점수는 정직하게. 오직 JSON 하나만(코드펜스·설명 금지).

{
  "overall": 0~100,
  "grade": "수준 한 줄 평가(정직하게)",
  "dimensions": { "기획력":0~100, "구조":0~100, "감정설계":0~100, "연출구체성":0~100, "독창성":0~100, "시장성":0~100, "완성도":0~100 },
  "strengths": ["진짜 강점 2~4개"],
  "fatalWeaknesses": [ { "issue":"치명적 약점", "why":"왜 치명적인가", "chapters":[] } ],
  "cliches": ["기시감/클리셰 요소와 어디서 본 듯한지"],
  "inconsistencies": ["연속성·설정 오류"],
  "revisionPlan": ["완성도를 끌어올릴 우선순위 보강 지시 4~6개"],
  "verdict": "한 줄 총평(냉정하게)"
}`;
  const user = `매체: ${mediumLabel(m)} · 포맷: ${formatLabel(f)}
작품: ${String(input.ipTitle || "무제").trim()}

## [산출물 발췌 — 기획~연출 설계]
${String(digest || "").slice(0, 40000)}

위 ${mediumLabel(m)} 기획의 완성도를 심사하고 JSON으로 출력하라.`;
  return { system, user };
}

function localMediaAudit(input, medium, format, digest) {
  const m = resolveMedium(medium);
  return {
    overall: 63,
    grade: "로컬 폴백 추정 — 실제 심사는 키/구독 연결 시 가능",
    dimensions: { 기획력: 64, 구조: 62, 감정설계: 60, 연출구체성: 58, 독창성: 56, 시장성: 62, 완성도: 62 },
    strengths: ["콘셉트와 매체 방향이 분명함"],
    fatalWeaknesses: [
      { issue: "연출 구체성 검증 필요", why: "연출값이 구체값으로 박혔는지는 실제 LLM 심사가 필요", chapters: [] },
    ],
    cliches: ["(키/구독 연결 시 기시감 탐지 가능)"],
    inconsistencies: [],
    revisionPlan: [
      `각 파트의 연출값을 ${MEDIA[m].directing.dimensions.slice(0, 3).join("·")}로 구체화`,
      "파트별 감동 곡선의 강약을 선명히",
      "독창성을 높일 차별화 한 끗 추가",
      "구조 전환점(미드포인트/클라이맥스)의 임팩트 강화",
    ],
    verdict: `${mediumLabel(m)} 기획 폴백 추정치입니다. 실제 완성도 심사는 LLM 연결 후 진행하세요.`,
    fallback: true,
  };
}

/* ============================================================================
 * 6. 크로스미디어 변환 (이 IP를 다른 매체로). 매체 고유 기능.
 *    현재 매체의 산출물 발췌를 받아, 타깃 매체의 성공방정식·연출로 재기획한다.
 * ========================================================================== */
function buildConvertPrompt({ input, fromMedium, toMedium, format, digest }) {
  const from = resolveMedium(fromMedium);
  const to = resolveMedium(toMedium);
  const f = resolveFormat(format);
  const tt = mediumStructureTarget(to, f);
  const system = `너는 IP를 매체 간에 옮기는 각색 전문가다. ${mediumLabel(from)}로 만들어진 IP를 ${mediumLabel(to)}로 재기획한다.
원작의 핵심(세계·인물·갈등·주제)은 보존하되, ${mediumLabel(to)}의 성공 방정식과 구조·연출 문법에 맞게 '번역'한다. 단순 요약이 아니라, 타깃 매체에서 통하도록 재설계한다.

${buildMediumBlock(to, f)}

[출력 구조 — 한국어 Markdown]
## 변환 로그라인
- ${mediumLabel(to)}용으로 다듬은 한 줄.
## 무엇을 살리고 무엇을 바꾸는가
| 요소 | 원작(${mediumLabel(from)}) | ${mediumLabel(to)} 변환 | 이유 |
|---|---|---|---|
(핵심 5~7행)
## ${mediumLabel(to)} 구조 재설계
- ${tt.actModel} 기준으로 ${tt.count}${tt.unit} 단위의 뼈대를 잡는다(핵심 비트/전환점).
## 매체 전환 핵심 연출
- ${mediumLabel(to)}에서 감동을 끌어낼 파트별 연출 포인트 3~5개.
## 리스크와 기회
- 이 변환의 가장 큰 리스크 2개와 기회 2개.`;
  const user = `원작 매체: ${mediumLabel(from)} → 타깃 매체: ${mediumLabel(to)} · 포맷: ${formatLabel(f)}
작품: ${String(input.ipTitle || "무제").trim()}

## [원작 산출물 발췌]
${String(digest || "").slice(0, 20000)}

위 IP를 ${mediumLabel(to)}로 재기획한 변환 설계서를 작성하라.`;
  return { system, user };
}

function localConvert({ input, fromMedium, toMedium, format }) {
  const from = resolveMedium(fromMedium), to = resolveMedium(toMedium), f = resolveFormat(format);
  const tt = mediumStructureTarget(to, f);
  return [
    `## 변환 로그라인 (로컬 데모)`,
    `- ${String(input.logline || input.ipTitle || "이 IP").trim()} — ${mediumLabel(to)} 버전.`,
    ``,
    `## 무엇을 살리고 무엇을 바꾸는가`,
    `- 핵심(세계·인물·갈등·주제)은 보존, 표현·구조·연출을 ${mediumLabel(to)} 문법으로 번역.`,
    `- ${mediumLabel(to)} 성공 방정식: ${mediumSuccessEquation(to)}`,
    ``,
    `## ${mediumLabel(to)} 구조 재설계`,
    `- ${tt.actModel} 기준 ${tt.count}${tt.unit} 단위로 재구성.`,
    ``,
    `> API 키 연결 시 실제 변환 설계서로 확장됩니다.`,
  ].join("\n");
}

/* ============================================================================
 * 7. 매체 도구상자 확장 (tools.js ctx에 매체 주입 + 매체용 도구 종류)
 * ========================================================================== */
const MEDIA_TOOL_KINDS = {
  logline: "로그라인 후보",
  title: "제목 후보",
  tagline: "태그라인/카피 후보",
  character: "캐릭터/인물 아이디어",
  scene: "장면/시퀀스 아이디어",
  hook: "오프닝/3초 후크 아이디어",
};

module.exports = {
  // 스티어링
  MEDIA_STEERING, recommendedMediaSteering,
  // 감독 프리셋
  DIRECTOR_PRESETS, directorPresets, directorPresetBlock,
  // 임팩트
  buildMediaImpactPrompt, localMediaImpact,
  // 자가비평
  MEDIA_AXES, buildMediaCritiquePrompt, parseMediaCritique, localMediaCritique,
  // 완성도 심사
  MEDIA_DIMS, buildMediaAuditPrompt, localMediaAudit,
  // 크로스미디어 변환
  buildConvertPrompt, localConvert,
  // 도구
  MEDIA_TOOL_KINDS,
};
