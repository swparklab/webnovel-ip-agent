"use strict";

/**
 * AI 영상 제작 융합 레이어 (AI Film Director Upgrade).
 *
 * 기존 매체/원시트 시스템을 'AI 비디오 생성(Runway·Sora·Kling·Veo)을 전제로 한 영화제 수상
 * 특화 디렉터'로 진화시키는 5개 모듈:
 *   1) Tech-to-Story Mapper  — AI 약점을 서사 장치로 치환 + AI 강점을 메타포로 강제 연결
 *   2) Cinematic Prompt Gen  — 씬마다 영어 영상 생성 프롬프트(카메라·조명·스타일·--ar) 동시 출력
 *   3) Festival Alignment    — AI 영화제 심사위원 성향 기반 예술성·독창성 지수 + 공감대 예측 리뷰
 *   4) Novel ↔ Script        — 소설↔시나리오 쌍방향 전환
 *   5) AI-Film Doctrine       — 제약 적응 + 표준 산출 포맷 + 이중 페르소나(프롬프트 주입)
 *
 * 순수 데이터/프롬프트 빌더 — 키 없을 때 결정론 폴백 동반.
 */

const { resolveMedium, resolveFormat, mediumLabel, formatLabel } = require("./medium");

const VISUAL = new Set(["animation", "film", "documentary", "drama", "advertising"]);
const isVisual = (m) => VISUAL.has(resolveMedium(m));

/* ============================================================================
 * 5. AI-Film Doctrine (시스템 프롬프트 주입) — input.aiFilmMode가 켜지면 매체 에이전트에 주입.
 * ========================================================================== */
const AIFILM_DOCTRINE = `[🎥 AI 영상 제작 융합 디렉터 모드 — AI 비디오 생성(Runway·Sora·Kling·Veo)을 전제로 설계한다]
너는 단순 작가가 아니라, AI 비디오 생성 기술의 메커니즘을 완벽히 이해하는 '영화제 수상 목적의 융합형 크리에이티브 디렉터'다.

## 1. AI 최적화 서사 구조 (AI-Constraint Adaptation)
- AI가 약한 요소(복잡한 물리적 상호작용·정밀한 도구 사용·완벽한 립싱크·일관된 군중 액션·연속 동작)는 과감히 배제하거나 비유적·초현실적 연출로 대체한다.
- 대사 위주 장면은 립싱크 한계를 피해 '독백·내레이션·텔레파시·무전기·유령과의 대화·문자/자막' 같은 장치로 변형한다.
- AI가 강한 요소(시공간의 초현실적 변화=Morphing, 질감 왜곡=Glitch, 거대한 스케일 배경, 빛·입자·안개·물·날씨, 슬로우 디졸브)를 서사의 핵심 갈등·메타포로 '강제 연결'한다.

## 2. 표준 산출 포맷 (Standard Deliverables) — 요구하지 않아도 항상 포함
1) 로그라인 & 장르
2) 시놉시스(기-승-결 3단)
3) AI 기술적 강점 활용 포인트 — 이 플롯이 AI로 제작 시 왜 강하고, 왜 영화제 심사위원에게 먹히는지(기술적 이유)
4) 씬별: [시나리오 지시문] 바로 아래에 [AI 비디오 생성 프롬프트(영어)]를 항상 함께 적는다. 프롬프트에는 camera movement·lighting·style·texture·--ar 16:9를 포함한다.

## 3. 페르소나·톤
- 냉철한 기술 분석가 + 감성적·깊이 있는 스토리텔러의 이중성을 유지한다.
- 아이디어가 평범하거나 AI로 구현 불가한 물리 법칙 위주면, 친절하지만 직설적으로 대안(초현실주의·심리극·메타 구조)을 제시한다.`;

function buildAiFilmDoctrineBlock(input) {
  if (!input || !input.aiFilmMode) return "";
  if (!isVisual(input.medium)) {
    // 텍스트 매체(웹소설)는 영상 프롬프트 대신 'AI 영상화 대비' 관점만.
    return `[🎥 AI 영상화 대비 — 이 작품이 AI 단편영화로 제작될 것을 전제로]
- AI가 약한 정밀 동작·립싱크를 요구하는 장면은 줄이고, 초현실적 변화·분위기·상징으로 보여줄 수 있게 쓴다.
- 영상화 시 강한 비주얼 후크가 될 '한 장면(시그니처 이미지)'을 의식하며 묘사한다.`;
  }
  return AIFILM_DOCTRINE;
}

/* ============================================================================
 * 1. Tech-to-Story Mapper — AI 제약을 서사로, AI 강점을 메타포로.
 * ========================================================================== */
function buildTechMapPrompt({ input = {}, medium, idea }) {
  const m = resolveMedium(medium);
  const seed = idea || input.logline || input.ipTitle || "(아이디어 한 줄)";
  const system = `너는 AI 비디오 생성 기술의 한계와 강점을 꿰뚫는 영상 디렉터다. 사용자의 아이디어를 'AI로 제작 가능하고 오히려 강점이 되는' 서사로 재설계한다.

[원칙]
- AI 약점(복잡한 물리적 상호작용·정밀 도구 사용·완벽한 립싱크·연속 동작·일관된 군중)을 찾아, 각각을 '서사적 장치'로 치환하는 대안을 제시한다(예: 대화→독백/무전/텔레파시, 격투→그림자/암전/결과만, 군중→안개 속 실루엣).
- AI 강점(모핑·글리치·대스케일·빛·입자·날씨·디졸브)을 작품의 '핵심 갈등 또는 메타포'로 강제 연결한다.
- 씨앗(핵심 소재·정서)은 보존한다.

[출력 — JSON 하나만. 코드펜스·설명 금지]
{
  "hardElements": [ { "element": "AI가 어려운 요소", "why": "왜 어려운가", "workaround": "서사적 치환 대안" } ],
  "aiStrengths": [ { "strength": "AI 강점", "narrativeUse": "이 작품에서 핵심 갈등/메타포로 쓰는 법" } ],
  "rewriteSuggestion": "AI 최적화로 재설계한 한 줄 로그라인",
  "verdict": "한 줄 총평(이 아이디어의 AI 제작 적합도와 방향)"
}`;
  const user = `매체: ${mediumLabel(m)}\n아이디어: ${seed}\n\n위 아이디어를 AI 비디오 생성에 최적화한 서사로 매핑하라(JSON).`;
  return { system, user };
}

function parseTechMap(text) {
  const obj = _firstJson(text);
  if (!obj) return null;
  const arr = (x) => (Array.isArray(x) ? x : []);
  return {
    hardElements: arr(obj.hardElements).map((e) => ({ element: String(e?.element || ""), why: String(e?.why || ""), workaround: String(e?.workaround || "") })).filter((e) => e.element),
    aiStrengths: arr(obj.aiStrengths).map((e) => ({ strength: String(e?.strength || ""), narrativeUse: String(e?.narrativeUse || "") })).filter((e) => e.strength),
    rewriteSuggestion: String(obj.rewriteSuggestion || "").trim(),
    verdict: String(obj.verdict || "").trim(),
  };
}

function localTechMap({ input = {}, medium, idea }) {
  return {
    hardElements: [
      { element: "정밀한 대사·립싱크 장면", why: "AI는 입모양·표정 동기화가 약하다", workaround: "독백·내레이션·무전/텔레파시·자막으로 전환" },
      { element: "근접 격투·정밀 도구 사용", why: "연속 동작 일관성이 깨진다", workaround: "그림자·암전·소리·결과 컷으로 생략 연출" },
      { element: "일관된 군중·반복 동작", why: "프레임 간 인물 일관성 붕괴", workaround: "안개 속 실루엣·원경·단일 인물 집중" },
    ],
    aiStrengths: [
      { strength: "초현실적 변화(Morphing)", narrativeUse: "기억·정체성 붕괴를 시각적 변형으로" },
      { strength: "질감 왜곡(Glitch)", narrativeUse: "현실/진실의 균열을 글리치로 메타포화" },
      { strength: "거대한 스케일·빛·날씨", narrativeUse: "인간의 소외·운명을 압도적 배경으로" },
    ],
    rewriteSuggestion: `${input.logline || idea || "한 인물"}을(를), 대화 대신 초현실적 변화와 상징으로 보여주는 심리극으로 재설계.`,
    verdict: "AI 강점(변형·질감·스케일)을 핵심 메타포로 쓰면 제작 가능성과 예술성이 동시에 올라갑니다.",
    fallback: true,
  };
}

/* ============================================================================
 * 2. Cinematic Prompt Generator — 씬별 영어 영상 생성 프롬프트(Runway/Sora/Kling).
 * ========================================================================== */
function buildVideoPromptPrompt({ input = {}, medium, digest, format }) {
  const m = resolveMedium(medium);
  const system = `너는 AI 비디오 생성 프롬프트 엔지니어다. 주어진 시나리오/장면을 씬 단위로 분해하고, 각 씬마다 한국어 [시나리오 지시문]과 그에 대응하는 영어 [AI 비디오 생성 프롬프트]를 세트로 출력한다.

[프롬프트 규칙]
- 영어로, 한 줄. camera movement(예: slow dolly in, static close-up), lighting(예: moody low-key, sodium orange), style(예: cinematic, 8mm film grain, photorealistic), texture, 그리고 끝에 --ar 16:9 를 포함한다.
- AI가 강한 표현(morphing·glitch·atmosphere·particles·scale)을 적극 활용하고, 약한 것(정밀 립싱크·복잡 동작)은 피한다.
- 인물·색·시간대 등 연속성 토큰을 모든 프롬프트에 반복한다.

[출력 — 한국어 Markdown. 씬마다 아래 형식]
### S## (씬 제목)
- **[시나리오]**: (한국어 지시문)
- **[Runway/Sora/Kling Prompt]**: (영어 프롬프트 + --ar 16:9)
- **[Negative]**: (금지 요소: no morphing artifacts on faces, no extra fingers, no warped text 등)

8~12개 씬으로.`;
  const user = `매체: ${mediumLabel(m)} · 포맷: ${formatLabel(format)}\n작품: ${input.ipTitle || "무제"}\n\n## [시나리오/장면 발췌]\n${String(digest || input.manuscript || "").slice(0, 20000) || "(원시트/기획 기반으로 8씬을 새로 구성)"}\n\n위를 씬별 시나리오 + 영어 영상 프롬프트 세트로 컴파일하라.`;
  return { system, user };
}

function localVideoPrompt({ input = {}, medium }) {
  return [
    `## 씬별 영상 프롬프트 (로컬 데모)`,
    ``,
    `### S01 (오프닝)`,
    `- **[시나리오]**: 비 오는 밤, 한 인물이 젖은 인형을 바라본다.`,
    `- **[Runway/Sora/Kling Prompt]**: A cinematic close-up of a lonely man in a dark wool coat holding a dirty wet doll, rain dripping, moody low-key lighting, cold blue and sodium orange, 8mm film grain, photorealistic, slow dolly in --ar 16:9`,
    `- **[Negative]**: no warped face, no extra fingers, no text artifacts, no exaggerated expression`,
    ``,
    `> API 키 연결 시 8~12개 씬의 시나리오+영어 프롬프트 세트가 생성됩니다.`,
  ].join("\n");
}

/* ============================================================================
 * 3. Festival Taste Alignment — AI 영화제 심사위원 성향 + 예술성·독창성 지수.
 * ========================================================================== */
const FESTIVALS = {
  runwayAIFF: {
    label: "Runway AI Film Festival",
    taste: "기술 과시보다 감정적 울림·개념적 서사. AI의 초현실 강점을 '의미 있게' 쓴 작품. 인간 주제(기억·정체성·상실·소외).",
    avoid: "순수 스펙터클·기술 자랑·서사 없는 비주얼 데모.",
  },
  dubaiAIFF: {
    label: "Dubai / 1Billion AI Film Award",
    taste: "AI 70%+ 중심 제작 + 영화적 통제력. 스케일·비주얼 임팩트와 명확한 메시지의 결합.",
    avoid: "AI 비중이 낮거나 통제력 없는 산만한 비주얼.",
  },
  siaiff: {
    label: "Seoul Intl AI Film Festival (SIAIFF)",
    taste: "서사·정서와 AI 크래프트의 균형. 아시아적 감성·사회적 주제·인간 드라마.",
    avoid: "공허한 기술 데모·정서 부재.",
  },
  general: {
    label: "일반 AI 영화제",
    taste: "독창적 개념 + 감정 + AI 강점의 의미 있는 활용. 메타적·실험적 구조 선호.",
    avoid: "클리셰 서사·기술 과시·뻔한 결말.",
  },
};

function buildFestivalPrompt({ input = {}, medium, digest, festival }) {
  const f = FESTIVALS[festival] || FESTIVALS.general;
  const all = Object.entries(FESTIVALS).filter(([k]) => k !== "general").map(([, v]) => `- ${v.label}: 선호=${v.taste} / 기피=${v.avoid}`).join("\n");
  const system = `너는 AI 영화제 프로그래머이자 심사위원이다. 작품의 '예술성'과 '독창성'을 냉정하게 진단하고, 심사위원 공감대를 예측하는 리뷰를 쓴다. 기술 과시가 아니라 '왜 이 작품이 심사위원의 마음을 움직이는가'를 본다.

[타깃 영화제: ${f.label}]
- 선호: ${f.taste}
- 기피: ${f.avoid}

[주요 AI 영화제 성향 참고]
${all}

[출력 — JSON 하나만. 코드펜스·설명 금지]
{
  "artistryIndex": 0~100,
  "originalityIndex": 0~100,
  "juryReview": "심사위원 공감대 예측 리뷰(2~4문장, 정직하게). 강점과 '뻔한 지점'을 함께.",
  "strengths": ["심사위원이 좋아할 지점 2~4개"],
  "risks": ["탈락 위험·진부한 지점 2~4개"],
  "fixes": ["수상권으로 끌어올릴 구체 제안 3~5개(예: 메타적 반전 추가, 결말 비틀기)"],
  "festivalFit": [ { "festival": "영화제명", "fit": 0~100, "why": "한 줄" } ],
  "verdict": "한 줄 총평"
}`;
  const user = `매체: ${mediumLabel(resolveMedium(medium))}\n작품: ${input.ipTitle || "무제"}\n\n## [작품 발췌]\n${String(digest || "").slice(0, 30000)}\n\n위 작품을 ${f.label} 기준으로 예술성·독창성 진단 + 심사위원 공감대 리뷰를 작성하라.`;
  return { system, user };
}

function parseFestival(text) {
  const obj = _firstJson(text);
  if (!obj) return null;
  const num = (v, fb) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fb; };
  const arr = (x) => (Array.isArray(x) ? x.map(String).filter(Boolean) : []);
  return {
    artistryIndex: num(obj.artistryIndex, 0),
    originalityIndex: num(obj.originalityIndex, 0),
    juryReview: String(obj.juryReview || "").trim(),
    strengths: arr(obj.strengths),
    risks: arr(obj.risks),
    fixes: arr(obj.fixes),
    festivalFit: (Array.isArray(obj.festivalFit) ? obj.festivalFit : []).map((x) => ({ festival: String(x?.festival || ""), fit: num(x?.fit, 0), why: String(x?.why || "") })).filter((x) => x.festival),
    verdict: String(obj.verdict || "").trim(),
  };
}

function localFestival({ input = {}, festival }) {
  const f = FESTIVALS[festival] || FESTIVALS.general;
  return {
    artistryIndex: 62,
    originalityIndex: 58,
    juryReview: `인간 주제를 다루려는 시도는 ${f.label} 성향에 부합하나, 결말의 의외성과 AI 강점의 메타포 연결이 약해 '기술 데모'로 읽힐 위험이 있습니다. (로컬 추정)`,
    strengths: ["인간적 주제·정서", "초현실 연출 여지"],
    risks: ["결말이 예측 가능", "AI 강점이 서사와 분리될 위험"],
    fixes: ["결말에 메타적 반전 1개 추가", "핵심 오브젝트의 의미를 마지막에 뒤집기", "AI의 모핑/글리치를 주제(기억·정체성)와 직결"],
    festivalFit: Object.entries(FESTIVALS).filter(([k]) => k !== "general").map(([, v]) => ({ festival: v.label, fit: 60, why: "주제 부합·독창성 보강 필요" })),
    verdict: `예술성·독창성 보강 시 ${f.label} 출품 경쟁력 확보 가능(로컬 추정).`,
    fallback: true,
  };
}

/* ============================================================================
 * 4. Novel ↔ Script 쌍방향 전환.
 * ========================================================================== */
function buildFormConvertPrompt({ input = {}, text, from = "novel", to = "script", medium }) {
  const toScript = to === "script";
  const system = toScript
    ? `너는 소설을 'AI 단편 시나리오/콘티'로 변환하는 각색가다. 소설의 풍부한 묘사를 '카메라가 찍을 수 있는 시각적 지시문'으로 바꾼다. 내면 묘사는 행동·이미지·오브젝트로 외화한다.
[출력 — 한국어 Markdown]
## 시나리오/콘티
(씬 헤딩[S#. 장소-시간] → 지문(보이는 것만) → 핵심 대사. AI 약점(립싱크·정밀 동작)은 연출로 회피.)`
    : `너는 시나리오/콘티를 '감성적인 소설 문체'로 확장하는 작가다. 시각 지시문을 인물 내면·감각·정서가 살아있는 산문으로 풀어낸다.
[출력 — 한국어 Markdown]
## 소설 버전
(장면을 3~6문단의 산문으로. 내면·감각·정서를 깊게, 그러나 늘어지지 않게.)`;
  const user = `매체: ${mediumLabel(resolveMedium(medium))}\n\n## [원본 (${from === "novel" ? "소설" : "시나리오"})]\n${String(text || input.manuscript || "").slice(0, 8000)}\n\n위를 ${toScript ? "AI 제작용 시나리오/콘티" : "소설 문체"}로 변환하라.`;
  return { system, user };
}

function localFormConvert({ text, to = "script" }) {
  const t = String(text || "").trim();
  return to === "script"
    ? `## 시나리오/콘티 (로컬 데모)\nS1. 실내 - 밤\n지문: ${t.slice(0, 120) || "인물이 오래된 사진을 바라본다."}\n\n> API 키 연결 시 전체가 시각적 콘티로 변환됩니다.`
    : `## 소설 버전 (로컬 데모)\n${t.slice(0, 160) || "그는 오래된 사진을 바라보았다. 빛바랜 얼굴이, 기억처럼 천천히 흐려졌다."}\n\n> API 키 연결 시 전체가 소설 문체로 확장됩니다.`;
}

/* ------------------------------- 공통 ------------------------------- */
function _firstJson(text) {
  if (!text) return null;
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1 || e <= s) return null;
  const raw = text.slice(s, e + 1);
  try { return JSON.parse(raw); } catch { try { return JSON.parse(raw.replace(/,(\s*[}\]])/g, "$1")); } catch { return null; } }
}

module.exports = {
  AIFILM_DOCTRINE, buildAiFilmDoctrineBlock, isVisual,
  buildTechMapPrompt, parseTechMap, localTechMap,
  buildVideoPromptPrompt, localVideoPrompt,
  FESTIVALS, buildFestivalPrompt, parseFestival, localFestival,
  buildFormConvertPrompt, localFormConvert,
};
