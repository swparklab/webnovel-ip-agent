"use strict";

/**
 * AI 애니메이션 그림풍 추천기 (Art Style Recommender).
 *
 * 작품(원시트·설계값·주제·정서)에 '알맞은' 그림풍을 추천하고, A/B/C 변형마다 이미지 생성
 * 프롬프트(영어)를 뽑는다: 공통 서사 베이스는 유지하고 스타일 블록만 갈아끼워 비교 생성.
 *   - 메인 키비주얼 프롬프트
 *   - 캐릭터 기준 이미지(캐릭터 시트) 프롬프트
 *   - 핵심 장면 프롬프트
 *   - 피해야 할 요소(Negative)
 *   - 짧은 스타일 태그
 *   - 추천 순위 + 샷 확장 공통 템플릿
 *
 * 영화제 수상 경향(촉각적 아날로그 질감·인간 주제·모핑=은유)을 반영. 키 없을 때 결정론 폴백.
 */

const { mediumStructureTarget, formatLabel } = require("./medium");
const { resolveModel, AI_VIDEO_MODELS } = require("./aianimation");
const { buildCharLockBlock } = require("./charactersheet");
const { buildWorldLockBlock } = require("./canon");

/** 기본 그림풍 카탈로그. 매체 5종처럼 전문가 워크플로(artstyle-catalog.json)로 보강된다. */
const BASE_STYLES = [
  { key: "charcoal2_5d", label: "차콜 흑백 + 2.5D 제한 애니", family: "손그림·흑백", festivalWeight: 5, bestModel: "runway",
    fitThemes: ["기억", "상실", "노년", "죽음", "고독", "트라우마", "회한", "흑백", "아날로그", "치매"],
    whyFit: "결함조차 은유로 승화하는 차콜의 질감이 상실·기억의 정서에 가장 강하다(영화제형).",
    promptCore: "melancholic black-and-white charcoal and graphite drawing on textured paper, 2.5D limited animation, soft paper grain, subtle old film flicker, monochrome with deep black, ash gray, warm paper white and faint sepia, poetic restrained arthouse aesthetic",
    shortTag: "charcoal drawing, graphite on textured paper, monochrome, 2.5D limited animation, arthouse, soft film flicker, poetic memory",
    avoid: ["과도한 컬러", "사실적 실사 피부", "복잡한 배경 소품", "과장된 표정", "만화적으로 귀여운 비율"] },
  { key: "stopMotionPuppet", label: "스톱모션 인형극(펠트·천)", family: "공예·스톱모션", festivalWeight: 4, bestModel: "kling",
    fitThemes: ["우화", "동화", "따뜻함", "향수", "상실", "치유", "공예", "외로움", "연대"],
    whyFit: "수공예의 체온이 'AI=영혼 없음' 편견을 깨고 우화적 정서를 증폭한다.",
    promptCore: "handcrafted stop-motion puppet aesthetic, felt, fabric, paper and wood textures, miniature set design, tactile handmade details, soft practical lighting, muted monochrome palette with gray, ivory, charcoal and faded sepia, slightly imperfect but beautiful",
    shortTag: "stop-motion puppet animation, handcrafted miniature set, felt and fabric textures, soft practical lighting, nostalgic, tactile",
    avoid: ["공포스러운 인형 얼굴", "장난감처럼 밝은 색", "과한 세트 디테일", "과도한 왜곡", "귀여움 위주 캐릭터화"] },
  { key: "watercolorInk", label: "수채·잉크워시", family: "회화·페인터리", festivalWeight: 4, bestModel: "sora",
    fitThemes: ["서정", "치유", "자연", "유년", "기억", "잔잔함", "이별", "성장"],
    whyFit: "번지는 안료와 여백이 잔잔한 정서·기억의 흐릿함을 시적으로 담는다.",
    promptCore: "soft watercolor and ink wash animation, bleeding pigments, delicate ink lines, paper texture, airy negative space, gentle muted palette, hand-painted poetic look",
    shortTag: "watercolor, ink wash, bleeding colors, paper texture, delicate lines, soft negative space, poetic",
    avoid: ["진한 윤곽선 과다", "과채도", "디지털 매끈함", "빈틈없는 화면"] },
  { key: "flatCel", label: "플랫 2D 셀 애니", family: "디지털·그래픽", festivalWeight: 3, bestModel: "kling",
    fitThemes: ["일상", "드라마", "관계", "사회", "청춘", "대중", "코미디", "도시"],
    whyFit: "읽기 쉬운 그래픽과 감정 명료성으로 안정적·대중 친화적이다.",
    promptCore: "clean flat 2D cel animation, clean outlines, limited shading, graphic-novel sensibility, restrained palette, strong readable silhouette, cinematic framing, emotionally clear",
    shortTag: "flat 2D cel animation, clean outlines, limited shading, graphic novel composition, cinematic framing",
    avoid: ["애니풍 큰 눈", "디테일 과다", "화려한 캐릭터 디자인", "화면 내 텍스트", "동세 큰 포즈"] },
  { key: "lofiCamcorder", label: "90s 캠코더 로파이(VHS)", family: "로파이·실험", festivalWeight: 4, bestModel: "sora",
    fitThemes: ["향수", "기억", "다큐", "현실", "청춘", "상실", "가족"],
    whyFit: "VHS 노이즈·열화의 아날로그 향수가 기억·현실의 질감을 즉각 만든다.",
    promptCore: "1990s home camcorder lo-fi look, VHS noise and scanlines, faded analog colors, subtle date stamp, handheld imperfection, soft bloom, nostalgic warmth",
    shortTag: "1990s camcorder, VHS noise, scanlines, faded analog, handheld, nostalgic lo-fi",
    avoid: ["선명한 4K", "깨끗한 디지털 룩", "과한 안정화", "현대적 UI"] },
  { key: "sumiInk", label: "수묵·붓 선(동양화)", family: "손그림·흑백", festivalWeight: 4, bestModel: "runway",
    fitThemes: ["동양", "민속", "무속", "무협", "호러", "전통", "여백", "운명"],
    whyFit: "붓의 기세와 여백이 한국·동양 민속 소재에 신선한 미학적 충격을 준다.",
    promptCore: "east-asian ink brush painting (sumi-e) animation, expressive brush strokes, rich negative space, monochrome with a single red accent, rice-paper texture, calligraphic energy",
    shortTag: "ink brush, sumi-e, expressive strokes, negative space, monochrome with red accent, rice paper texture",
    avoid: ["서구 카툰 톤", "과채도", "빈틈없는 배경", "매끈 벡터"] },
  { key: "oilImpasto", label: "유화·임파스토", family: "회화·페인터리", festivalWeight: 4, bestModel: "sora",
    fitThemes: ["격정", "비극", "역사", "고전", "열망", "광기", "무게"],
    whyFit: "두터운 마티에르와 붓자국이 격정·비극의 무게를 화면에 새긴다.",
    promptCore: "thick oil paint impasto animation, visible heavy brush strokes, rich matiere, painterly chiaroscuro light, textured canvas, classical fine-art palette",
    shortTag: "oil painting, impasto, visible brushstrokes, painterly chiaroscuro, textured canvas, fine-art",
    avoid: ["플랫 벡터", "매끈 CG", "과한 채도 네온", "디지털 광택"] },
  { key: "paperCutout", label: "종이 컷아웃·콜라주", family: "공예·실험", festivalWeight: 3, bestModel: "runway",
    fitThemes: ["우화", "동심", "실험", "풍자", "꿈", "사회"],
    whyFit: "겹겹의 종이 레이어와 손맛이 우화·풍자에 따뜻한 실험성을 더한다.",
    promptCore: "paper cutout collage animation, layered paper shapes with visible torn edges, handmade craft texture, flat depth layers, soft cast shadows between layers",
    shortTag: "paper cutout, collage animation, layered torn paper, handmade craft, flat graphic layers",
    avoid: ["사실적 음영", "3D 렌더", "매끈 그라데이션", "과한 디테일"] },
  { key: "pastelStorybook", label: "파스텔 동화책(과슈)", family: "회화·페인터리", festivalWeight: 3, bestModel: "kling",
    fitThemes: ["동화", "유년", "따뜻함", "판타지", "희망", "성장"],
    whyFit: "부드러운 과슈·둥근 형태가 동화적 온기와 희망을 전한다.",
    promptCore: "soft pastel and gouache storybook illustration animation, warm gentle palette, rounded friendly shapes, picture-book charm, grainy paper tooth",
    shortTag: "pastel, gouache, storybook illustration, warm gentle palette, rounded shapes, picture-book",
    avoid: ["어두운 호러 톤", "과한 디테일", "날카로운 윤곽", "차가운 무채색"] },
  { key: "claymation", label: "클레이메이션", family: "공예·스톱모션", festivalWeight: 3, bestModel: "kling",
    fitThemes: ["우화", "코미디", "따뜻함", "동심", "기괴", "변형"],
    whyFit: "지문이 남는 점토 질감이 변형·우화·따뜻한 기괴함에 강하다.",
    promptCore: "claymation, plasticine clay texture with visible fingerprint marks, handcrafted, soft studio lighting, tactile stop-motion, gentle muted colors",
    shortTag: "claymation, plasticine clay, fingerprint texture, handcrafted, stop-motion, tactile",
    avoid: ["매끈 CG", "공포스러운 디테일", "과채도", "딱딱한 기계적 움직임"] },
];

let ENRICHED = [];
try { ENRICHED = require("./artstyle-catalog.json"); } catch { ENRICHED = []; }
// 전문가 워크플로 카탈로그가 있으면 그것을(더 풍부) 쓰고, 없으면 기본 KB로 폴백.
const ART_STYLES = (Array.isArray(ENRICHED) && ENRICHED.length >= 6) ? ENRICHED : BASE_STYLES;

function styleByKey(k) { return ART_STYLES.find((s) => s.key === k); }

/** 작품의 주제·정서 텍스트 블롭(추천 점수용). */
function workThemeText(input = {}, oneSheet) {
  const ds = (input.designSpec && typeof input.designSpec === "object") ? Object.values(input.designSpec).join(" ") : "";
  const os = oneSheet ? [oneSheet.moralQuestion, oneSheet.emotionalWound, oneSheet.worldTexture, oneSheet.corePremise].filter(Boolean).join(" ") : "";
  return [input.theme, input.tone, input.logline, input.genre, input.message, ds, os].filter(Boolean).join(" ");
}

/** 작품에 알맞은 그림풍 추천(점수순). A/B/C는 서로 다른 화풍 군에서 뽑아 '비교' 가치를 만든다. */
function recommendStyles(input = {}, oneSheet, n = 3) {
  const text = workThemeText(input, oneSheet);
  const scored = ART_STYLES.map((s) => {
    let hits = 0;
    (s.fitThemes || []).forEach((kw) => { if (kw && text.includes(kw)) hits += 1; });
    return { style: s, score: hits * 10 + (s.festivalWeight || 3) };
  }).sort((a, b) => b.score - a.score);
  // 화풍 군 다양성: 가능한 한 다른 family에서 뽑되, 모자라면 점수순으로 채운다.
  const picks = [];
  const usedFamily = new Set();
  for (const x of scored) {
    if (picks.length >= n) break;
    const fam = x.style.family || x.style.key;
    if (!usedFamily.has(fam)) { picks.push(x.style); usedFamily.add(fam); }
  }
  for (const x of scored) {
    if (picks.length >= n) break;
    if (!picks.includes(x.style)) picks.push(x.style);
  }
  return picks.map((s, i) => ({ ...s, rank: i + 1, why: s.whyFit }));
}

/* ----------------------- 공통 베이스 추출 ----------------------- */
function commonBase(input = {}, oneSheet) {
  const ds = (input.designSpec && typeof input.designSpec === "object") ? input.designSpec : {};
  const g = (k) => (oneSheet && String(oneSheet[k] || "").trim()) || "";
  return {
    title: input.ipTitle || "Untitled",
    genre: input.genre || "기억·상실",
    protagonist: input.protagonist || g("characterEngine") || "한 인물",
    space: ds.setting || g("worldTexture") || "어두운 작업실",
    object: ds.coreObject || g("centralObject") || input.coreTech || "상징물 한 점",
    keyScene: g("emotionalWound") || input.logline || "주인공이 잃어버린 것과 마주하는 순간",
  };
}

/* ----------------------- 생성 프롬프트(LLM) ----------------------- */
function buildArtStylePrompt({ input = {}, oneSheet, format, targetModel }) {
  const recs = recommendStyles(input, oneSheet, 3);
  const base = commonBase(input, oneSheet);
  const model = AI_VIDEO_MODELS[resolveModel(targetModel)];
  const styleList = recs.map((s, i) => `${"ABC"[i]}안. ${s.label} (${s.family}, 영화제 적합 ${s.festivalWeight}/5, 추천 모델 ${s.bestModel}) — promptCore: ${s.promptCore} / shortTag: ${s.shortTag} / 피하기: ${(s.avoid || []).join("·")}`).join("\n");
  const system = `너는 AI 애니메이션 아트디렉터다. 작품에 알맞은 그림풍 3개(A/B/C)를 추천하고, 각 스타일마다 이미지 생성기에 바로 넣을 영어 프롬프트를 뽑는다. 공통 서사 정보는 유지하고 스타일 블록만 바꿔 비교 생성하게 한다.

[추천된 3개 그림풍 — 이 스타일들을 A/B/C로 쓴다]
${styleList}

[작품 공통 베이스 — 세 스타일 공통 유지]
- 제목: ${base.title} / 장르: ${base.genre}
- 주인공: ${base.protagonist}
- 공간: ${base.space}
- 핵심 오브젝트: ${base.object}
- 핵심 장면: ${base.keyScene}
${buildWorldLockBlock(input.worldLock) ? "\n" + buildWorldLockBlock(input.worldLock) + "\n(배경·프롭·시각 코드를 위 WORLD LOCK에 맞춰 일관 유지하라)" : ""}
${buildCharLockBlock(input.characterLock) ? "\n" + buildCharLockBlock(input.characterLock) + "\n(캐릭터 기준 이미지·핵심 장면 프롬프트에 위 CHARACTER LOCK 토큰을 반영해 동일 인물을 유지하라)" : ""}

[영화제 원칙] 매끈한 플라스틱 CG 금지, 촉각적 아날로그 질감 선호. AI의 형태 붕괴(morphing)는 심리 붕괴·기억의 흐릿함의 은유로만. 감정은 사물·질감으로.

[출력 — 한국어 Markdown. 아래 구조를 정확히]
# 0. 공통 베이스 설정
(위 공통 베이스를 정리)

# 1~3. A/B/C안 (각 스타일마다)
## 메인 키비주얼 프롬프트
(영어. promptCore + 공통 베이스를 녹인 한 단락 프롬프트)
## 캐릭터 기준 이미지 프롬프트
(영어. 캐릭터 시트용)
## 핵심 장면 프롬프트
(영어. 핵심 장면용)
## 피해야 할 요소
(한국어 불릿)
## 짧은 스타일 태그
(영어 태그 한 줄)

# 추천 순위
(A/B/C를 영화제 느낌+AI 안정성 기준으로 1~3위, 한 줄 근거)

# 샷 확장 공통 템플릿
(스타일명만 바꿔 넣는 영어 템플릿 1개. 끝에 --ar 16:9)`;
  const user = `매체: AI 애니메이션 · 포맷: ${formatLabel(format)} · 타깃 생성 모델: ${model.label}\n작품: ${base.title}\n\n위 공통 베이스로 A/B/C 그림풍별 생성 프롬프트 세트를 작성하라.`;
  return { system, user, recommended: recs.map((s) => ({ key: s.key, label: s.label, rank: s.rank })) };
}

/** 결정론 폴백 — 추천 3스타일 × 공통 베이스로 A/B/C 블록 생성. */
function localArtStyle({ input = {}, oneSheet, format, targetModel }) {
  const recs = recommendStyles(input, oneSheet, 3);
  const base = commonBase(input, oneSheet);
  const model = AI_VIDEO_MODELS[resolveModel(targetModel)];
  const subj = `an elderly protagonist (${base.protagonist}) alone with ${base.object} in ${base.space}`;
  const blocks = recs.map((s, i) => {
    const tag = "ABC"[i];
    return [
      `# ${i + 1}. ${tag}안 — ${s.label}`,
      `## 메인 키비주얼 프롬프트`,
      "```text",
      `Key visual for the animated short "${base.title}". ${subj}, looking at ${base.object} whose meaning is fading. ${s.promptCore}. Cinematic restrained composition, festival arthouse mood. --ar 16:9`,
      "```",
      `## 캐릭터 기준 이미지 프롬프트`,
      "```text",
      `Character design sheet of ${base.protagonist} for an arthouse animated short. ${s.promptCore}. Minimal expressions, consistent proportions for animation. --ar 16:9`,
      "```",
      `## 핵심 장면 프롬프트`,
      "```text",
      `${base.keyScene}. ${subj}. ${s.promptCore}. The central object is emphasized; subtle distortion reads as fading memory, not technical error. --ar 16:9`,
      "```",
      `## 피해야 할 요소`,
      (s.avoid || []).map((x) => `- ${x}`).join("\n"),
      `## 짧은 스타일 태그`,
      "```text",
      s.shortTag,
      "```",
      ``,
    ].join("\n");
  });
  return [
    `# 0. 공통 베이스 설정`,
    `- 제목: ${base.title} / 장르: ${base.genre}`,
    `- 주인공: ${base.protagonist}`,
    `- 공간: ${base.space}`,
    `- 핵심 오브젝트: ${base.object}`,
    `- 핵심 장면: ${base.keyScene}`,
    ``,
    ...blocks,
    `# 추천 순위`,
    recs.map((s, i) => `${i + 1}위. ${s.label} — ${s.why} (영화제 적합 ${s.festivalWeight}/5, 추천 모델 ${s.bestModel})`).join("\n"),
    ``,
    `# 샷 확장 공통 템플릿`,
    "```text",
    `An emotional keyframe from "${base.title}". Scene: [장면]. Main subject: ${base.protagonist}. Core object: ${base.object} (meaning emphasized). Mood: longing, fragile nostalgia. Style: [A/B/C 스타일 태그 삽입]. Composition: cinematic, readable, restrained, festival-quality. --ar 16:9`,
    "```",
    ``,
    `> (로컬 폴백. 키/구독 연결 시 ${model.label} 최적화로 작품 맞춤 프롬프트가 생성됩니다.)`,
  ].join("\n");
}

module.exports = {
  ART_STYLES, BASE_STYLES, styleByKey,
  recommendStyles, commonBase,
  buildArtStylePrompt, localArtStyle,
};
