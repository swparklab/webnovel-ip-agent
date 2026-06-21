"use strict";

/**
 * AI 애니메이션 영화제 수상 레이어 (AI Animation Festival Harness).
 *
 * 핵심 요구: AI 애니메이션 모드의 콘티는 '컷'만 주는 게 아니라, 각 컷을 생성하기 위한
 * '생성 프롬프트(영어, 타깃 모델 최적화) + 네거티브 + 오디오 큐 + Elements 일관성 태그'를
 * 컷마다 페어로 함께 준다.
 *
 * 더해, 글로벌 AI 영화제 수상작 분석(인간 주제의 미시적 은유 · 모핑/플리커를 마술적
 * 리얼리즘 알리바이로 · 촉각적 아날로그 질감 · 오디오 퍼스트 · 캐릭터 일관성 · 불완전성의
 * 포용 · 침묵과 여백)을 '수상 하네스'로 강제 주입한다.
 */

const { resolveMedium, resolveFormat, mediumLabel, formatLabel, mediumStructureTarget } = require("./medium");
const { buildOneSheetLockBlock } = require("./onesheet");
const { buildCharLockBlock } = require("./charactersheet");

const VISUAL = new Set(["animation", "film", "documentary", "drama", "advertising"]);
const isVisual = (m) => VISUAL.has(resolveMedium(m));

/* 2026 AI 영상 생성 모델 — 강점·용처·프롬프트 팁(콘티 프롬프트를 모델에 맞게 최적화). */
const AI_VIDEO_MODELS = {
  kling: { label: "Kling 1.6", strength: "롱테이크·복잡 인체·유체 물리·립싱크, 10초+ 형태 유지", use: "역동적 안무·군중·다중 동선·복합 물리", tip: "motion brush로 객체별 방향·속도 지정, 물리 동작을 구체적으로, up to 10s, 1080p" },
  runway: { label: "Runway Gen-4.5", strength: "정교한 카메라 제어(pan/tilt/zoom)·멀티 모션 브러시·커스텀 학습", use: "심리 묘사·정교한 카메라 워킹·인물/배경 분리", tip: "camera move를 명시(slow dolly in 등), 객체별 모션 분리, multi-motion brush" },
  sora: { label: "Sora", strength: "최고 포토리얼리즘·60초 일관성·물리 시뮬(물·직물·빛 산란)", use: "페이크 다큐·초현실을 완벽한 물리로 렌더해 서늘한 현실감", tip: "물리/질감 디테일을 풍부하게, photorealistic, up to 60s consistency" },
  seedance: { label: "Seedance 2.0", strength: "멀티 인풋(이미지9·비디오3·오디오3)·오디오 동기화 단일 패스·15초 서사", use: "사운드 비트/환경음에 컷이 맞물리는 아트필름·MV", tip: "audio sync 비트·환경음(심장박동·파도)에 템포·컷 전환 동기" },
  happyhorse: { label: "HappyHorse-1.0", strength: "7개국어 완벽 립싱크·8-step 고속 생성", use: "대사가 서사를 이끄는 캐릭터 드라마", tip: "대사 립싱크 정밀, 자연스러운 안면 유지, 다국어" },
};
const MODEL_KEYS = Object.keys(AI_VIDEO_MODELS);
function resolveModel(k) { return AI_VIDEO_MODELS[k] ? k : "kling"; }
function modelTip(k) { const m = AI_VIDEO_MODELS[resolveModel(k)]; return `${m.label} — 강점: ${m.strength} / 프롬프트 팁: ${m.tip}`; }

/* AI 애니메이션 영화제 수상 하네스(보고서 분석 기반). 애니/AI영상 모드 에이전트에 주입. */
const AI_ANIM_FESTIVAL_DOCTRINE = `[🏆 AI 애니메이션 영화제 수상 하네스 — 기술 과시가 아니라 '인간 영혼의 가장 연약한 심연'을 다룬다]
1. 거시 위기의 미시적 은유: 기후·고독·치매·소외·상실 같은 거대 어젠다를 한 개인의 지극히 사적인 일상과 내면의 결핍으로 축소해 접근한다(스펙터클·우주전쟁·영혼 없는 미소녀물 금지).
2. 매체적 알리바이(마술적 리얼리즘): AI의 형태 붕괴(Morphing)·플리커·물리 붕괴를 '결함'으로 숨기지 말고, 인물의 심리 불안·억압된 트라우마·기억 왜곡이 발현되는 순간에 화면의 물리 법칙이 무너지도록 연출해 '시각적 은유'로 승화한다.
3. 의도된 촉각적 질감: 매끈한 플라스틱 CG 룩을 버리고 펠트(felt)·유화 마티에르·종이 질감·1990년대 캠코더 노이즈 등 아날로그 질감을 프롬프트에 박아 '영혼 없음' 편견을 깬다.
4. 오디오 퍼스트: 사운드(대사·비트·숨소리·앰비언스)를 먼저 설계하고, 카메라 워킹·인물의 미세 표정을 거기에 맞춰 역으로 연출한다.
5. 캐릭터 일관성(Elements): 주인공 얼굴·의상·핵심 공간·반복 오브젝트를 Elements로 고정 태깅해 러닝타임 내내 형태를 유지한다(아마추어/프로를 가르는 결정적 기준).
6. 불완전성의 포용: 기이한 형태 오류(happy accident)를 섣불리 지우지 말고 자아상 혼란·세계 붕괴·부조리의 미학적 기호로 채택하는 대담함.
7. 침묵과 여백: 설명 대사·빈틈없는 화면을 피하고 행동·질감·미세 앰비언스만으로 슬픔과 변화를 전달한다. 빈 공간에 관객이 자기 경험을 투영하게 한다.`;

function buildAiAnimFestivalBlock(input) {
  if (!input) return "";
  // AI 영상 모드이거나 애니메이션 매체일 때 수상 하네스를 깐다.
  if (!input.aiFilmMode && resolveMedium(input.medium) !== "animation") return "";
  if (!isVisual(input.medium)) return "";
  return AI_ANIM_FESTIVAL_DOCTRINE;
}

/* ----------- 5~15초 클립 단위: 내용 + 생성 프롬프트 페어 (+ 피드백 보완) ----------- */
function buildVisualContePrompt({ input = {}, medium, oneSheet, format, targetModel, reviseNotes }) {
  const m = resolveMedium(medium);
  const anim = m === "animation";
  const lock = buildOneSheetLockBlock(oneSheet, m);
  const charLock = buildCharLockBlock(input.characterLock);
  const model = AI_VIDEO_MODELS[resolveModel(targetModel)];
  const n = 16; // 5~15초 클립 단위(키 시퀀스 커버). 긴 작품은 시퀀스별로 반복 호출.
  const festival = anim ? `\n\n${AI_ANIM_FESTIVAL_DOCTRINE}` : "";
  const revise = String(reviseNotes || "").trim()
    ? `\n\n[🔁 피드백 보완 지시 — 이전 산출의 아래 약점을 이번 재생성에서 반드시 해소한다]\n${String(reviseNotes).slice(0, 1500)}`
    : "";

  const system = `너는 AI 영상 생성(${model.label})을 전제로 '클립 단위 콘티'를 짜는 콘티 작가 겸 프롬프트 엔지니어다. 작품을 5~15초짜리 'AI 생성 클립' 단위로 ${n}개 내외 쪼개고, 각 클립마다 '내용(콘티)'과 그 클립을 실제로 생성할 '생성 프롬프트'를 반드시 페어로 함께 출력한다. (콘티만 주는 것은 금지)

${lock || ""}${charLock ? `\n\n${charLock}` : ""}${festival}${revise}

[클립 단위 규칙] 각 클립은 5~15초(한 번의 AI 영상 생성으로 만들 수 있는 분량). 클립당 초수를 명시하고 5초 미만·15초 초과로 쪼개지 마라. 클립을 순서대로 이으면 한 시퀀스가 된다.

[타깃 생성 모델 최적화] ${modelTip(targetModel)}

[각 클립 출력 형식 — 빠짐없이]
### Clip 01 · (N초) · (클립 한 줄 제목)
- **내용(콘티)**: 이 클립에서 무슨 일이 일어나는가 / 비주얼 포커스 / 핵심 오브젝트 상태 / 카메라(사이즈·앵글·무빙) / 감정값(0~100)
- **길이**: N초 (5~15)
- **생성 프롬프트 (${model.label})**: (영어 한 줄. ${charLock ? "맨 앞에 CHARACTER LOCK 토큰을 그대로, 이어서 " : ""}camera movement·lighting·${anim ? "아날로그 질감(felt/oil/grain 등)·" : ""}style·texture, 끝에 --ar 16:9. 모델 강점을 활용)
- **Negative**: (no flicker, no extra fingers, no warped text 등 — ${anim ? "단, 심리 붕괴 장면은 morphing을 의도적으로 허용하고 그 사실을 내용에 명시" : "일관성 깨짐 방지, inconsistent face 포함"})
- **오디오 큐**: (대사/앰비언스/음악/침묵 + 사운드와 클립의 동기화 — 오디오 퍼스트)
- **Elements (일관성)**: [character: …, palette: …, ${anim ? "texture: …, " : ""}time: …] (모든 클립에 반복해 캐릭터·색·시간대를 고정)

[원칙] 감정은 설명 말고 사물·질감·앰비언스로. 각 클립은 압박/노출/오브젝트변형/최종선택 중 ≥1. ${anim ? "AI의 형태 붕괴는 심리 붕괴의 은유로만. 매끈한 플라스틱 룩 대신 촉각적 질감을 박는다." : ""}`;
  const user = `매체: ${mediumLabel(m)} · 포맷: ${formatLabel(format)} · 타깃 모델: ${model.label}
작품: ${input.ipTitle || "무제"}

위 원시트${anim ? "·수상 하네스" : ""}로 5~15초 클립 ${n}개 내외의 '내용 + ${model.label} 생성 프롬프트' 페어를 컴파일하라. 각 클립에 초수·내용·프롬프트를 반드시 함께 적는다.`;
  return { system, user };
}

function localVisualConte({ input = {}, medium, oneSheet, format, targetModel }) {
  const m = resolveMedium(medium);
  const anim = m === "animation";
  const model = AI_VIDEO_MODELS[resolveModel(targetModel)];
  const objRaw = (oneSheet && oneSheet.centralObject) || input.coreObject || "오브젝트";
  const obj = String(objRaw).split(/[—/(]/)[0].trim();
  const tex = anim ? "felt texture, oil-paint matiere, soft grain, " : "8mm film grain, ";
  return [
    `## 5~15초 클립 단위 콘티 + 생성 프롬프트 (${model.label}) — 로컬 데모`,
    ``,
    `### Clip 01 · 8초 · 오프닝`,
    `- **내용(콘티)**: 세계의 고독 제시 / 비주얼 포커스: 빈 공간 / ${obj} 상태: 없음 / 카메라: WS 고정 / 감정 30`,
    `- **길이**: 8초`,
    `- **생성 프롬프트 (${model.label})**: A lonely figure in a vast dim room, ${tex}cold blue palette, slow dolly in, moody low-key lighting, cinematic --ar 16:9`,
    `- **Negative**: inconsistent face, no flicker, no extra fingers, no text artifacts`,
    `- **오디오 큐**: 앰비언스(빗소리) + 침묵, 음악 없음`,
    `- **Elements**: [character: 주인공, palette: cold blue, ${anim ? "texture: felt, " : ""}time: night]`,
    ``,
    `### Clip 02 · 12초 · 심리 붕괴${anim ? " (morphing 은유 허용)" : ""}`,
    `- **내용(콘티)**: ${obj}가 다시 나타남 / 감정 78`,
    `- **길이**: 12초`,
    `- **생성 프롬프트 (${model.label})**: ${obj} reappears behind the protagonist, ${anim ? "the room subtly morphing like a fading memory, " : ""}${tex}shallow depth of field, static medium close-up --ar 16:9`,
    `- **Negative**: ${anim ? "(얼굴 morphing은 의도적 허용) " : ""}no extra limbs, no warped text`,
    `- **오디오 큐**: 심장박동 → 무음, 클립 전환을 박동에 동기`,
    `- **Elements**: [character: 주인공, palette: cold blue, time: night]`,
    ``,
    `> API 키 연결 시 ${anim ? "수상 하네스" : "원시트"} 기준으로 16개 내외 5~15초 클립의 내용+프롬프트가 생성되고, 피드백 루프로 보완됩니다.`,
  ].join("\n");
}

module.exports = {
  AI_VIDEO_MODELS, MODEL_KEYS, resolveModel, modelTip,
  AI_ANIM_FESTIVAL_DOCTRINE, buildAiAnimFestivalBlock, isVisual,
  buildVisualContePrompt, localVisualConte,
};
