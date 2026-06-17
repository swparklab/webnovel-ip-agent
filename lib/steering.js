"use strict";

/**
 * 서사 가중치 / 방향 제어 (Narrative Steering).
 *
 * 같은 재료(세계관·인물·사건)라도 '어디에 무게를 두느냐'가 작품의 정체성을 가른다.
 * 본 모듈은 사용자가 정한 가중치를, 자연어 요청이 아니라 '제약 주입의 재구성'으로 사상한다:
 *   - 텍스트 강조 지시(buildSteeringBlock) → 모든 에이전트·회차 프롬프트에 주입
 *   - 생성 온도(steeringTemperature) → 창의성 가중을 temperature로
 *   - 구조 설계 편향(outlineSteeringHint) → 도파민/관계 등 비트 유형 분포로
 *
 * 각 차원은 0~100 정수(기본 50=중립).
 */

// UI·검증용 차원 정의.
const DIMENSIONS = [
  { key: "world", label: "세계관·설정", lo: "가볍게", hi: "깊고 구체적으로" },
  { key: "dopamine", label: "사이다·보상", lo: "절제", hi: "매 회차 통쾌하게" },
  { key: "romance", label: "로맨스·관계", lo: "비중 낮게", hi: "관계 중심으로" },
  { key: "action", label: "액션·긴장", lo: "잔잔하게", hi: "치열하게" },
  { key: "mystery", label: "떡밥·미스터리", lo: "단순하게", hi: "복선 촘촘히" },
  { key: "creativity", label: "창의성", lo: "안전한 클리셰", hi: "실험적·신선" },
  { key: "pacing", label: "전개 속도", lo: "느리게(분위기)", hi: "빠르게(사건 밀도↑)" },
  { key: "style", label: "문체", lo: "간결·담백", hi: "생생·감각적" },
];
const DIM_KEYS = DIMENSIONS.map((d) => d.key);

const PRESETS = {
  balanced: { label: "균형(기본)", weights: { world: 50, dopamine: 50, romance: 50, action: 50, mystery: 50, creativity: 50, pacing: 50, style: 50 } },
  orthodox: { label: "정통형", weights: { world: 72, dopamine: 50, romance: 40, action: 66, mystery: 60, creativity: 45, pacing: 45, style: 58 } },
  speed: { label: "속도형(사이다)", weights: { world: 35, dopamine: 90, romance: 35, action: 66, mystery: 45, creativity: 40, pacing: 86, style: 50 } },
  romance: { label: "관계형", weights: { world: 45, dopamine: 56, romance: 90, action: 32, mystery: 50, creativity: 55, pacing: 46, style: 76 } },
  lore: { label: "설정심화형", weights: { world: 90, dopamine: 42, romance: 46, action: 52, mystery: 76, creativity: 62, pacing: 32, style: 66 } },
};

/**
 * 장르별 권장 기본값 (Recommended defaults per genre).
 *
 * 작가가 장르를 고르는 순간, '보상체계 그래프바'에 그 장르의 흥행 문법에 맞는 가중치가
 * 미리 채워지도록 한다. 특히 dopamine(사이다·보상)·pacing(속도)을 장르 보상 곡선에 맞춰
 * 기본 세팅해, 처음 글을 쓸 때부터 점수·보상체계에 대한 강한 의도가 깔리게 만든다.
 * 값은 0~100(50=중립). 누락 장르는 family 기본값으로 폴백한다.
 */
const GENRE_STEERING = {
  // ── SF 계열 — 세계관·미스터리 비중이 크고 보상은 중상 ──
  aiForesight:   { world: 70, dopamine: 56, romance: 34, action: 50, mystery: 80, creativity: 72, pacing: 56, style: 60 },
  cyberpunk:     { world: 68, dopamine: 64, romance: 40, action: 72, mystery: 66, creativity: 68, pacing: 66, style: 66 },
  posthuman:     { world: 70, dopamine: 48, romance: 42, action: 44, mystery: 82, creativity: 80, pacing: 44, style: 64 },
  climate:       { world: 72, dopamine: 54, romance: 36, action: 58, mystery: 60, creativity: 62, pacing: 52, style: 56 },
  space:         { world: 74, dopamine: 58, romance: 36, action: 64, mystery: 64, creativity: 66, pacing: 56, style: 56 },
  solarpunk:     { world: 76, dopamine: 46, romance: 44, action: 42, mystery: 56, creativity: 72, pacing: 42, style: 62 },
  sfApocalypse:  { world: 66, dopamine: 62, romance: 34, action: 76, mystery: 58, creativity: 60, pacing: 68, style: 56 },
  // ── 웹소설 메인 — 사이다·속도 보상이 핵심 ──
  romanceFantasy:{ world: 52, dopamine: 74, romance: 88, action: 40, mystery: 58, creativity: 52, pacing: 66, style: 74 },
  modernFantasy: { world: 50, dopamine: 88, romance: 34, action: 82, mystery: 52, creativity: 44, pacing: 86, style: 54 },
  academyFantasy:{ world: 60, dopamine: 72, romance: 56, action: 64, mystery: 60, creativity: 56, pacing: 66, style: 60 },
  martialArts:   { world: 64, dopamine: 80, romance: 34, action: 84, mystery: 54, creativity: 46, pacing: 72, style: 58 },
  modernRomance: { world: 40, dopamine: 60, romance: 90, action: 30, mystery: 46, creativity: 56, pacing: 56, style: 78 },
  bl:            { world: 44, dopamine: 58, romance: 90, action: 36, mystery: 50, creativity: 58, pacing: 54, style: 78 },
  chaebol:       { world: 52, dopamine: 82, romance: 56, action: 46, mystery: 56, creativity: 48, pacing: 74, style: 60 },
  entertainment: { world: 46, dopamine: 84, romance: 54, action: 44, mystery: 48, creativity: 56, pacing: 78, style: 62 },
  altHistory:    { world: 78, dopamine: 66, romance: 38, action: 64, mystery: 60, creativity: 58, pacing: 56, style: 58 },
  thriller:      { world: 56, dopamine: 50, romance: 32, action: 66, mystery: 90, creativity: 64, pacing: 72, style: 60 },
  healing:       { world: 48, dopamine: 40, romance: 56, action: 24, mystery: 38, creativity: 56, pacing: 32, style: 72 },
  // ── 무협 특화 — 액션·사이다 강세, 회귀물은 사이다 최고치 ──
  wuxiaOrthodox: { world: 70, dopamine: 70, romance: 34, action: 86, mystery: 56, creativity: 44, pacing: 62, style: 60 },
  wuxiaNew:      { world: 58, dopamine: 76, romance: 38, action: 74, mystery: 60, creativity: 72, pacing: 68, style: 58 },
  xianxia:       { world: 78, dopamine: 72, romance: 32, action: 72, mystery: 64, creativity: 56, pacing: 60, style: 58 },
  murimReturn:   { world: 56, dopamine: 90, romance: 32, action: 82, mystery: 58, creativity: 44, pacing: 84, style: 56 },
  fusionMurim:   { world: 58, dopamine: 86, romance: 36, action: 78, mystery: 54, creativity: 66, pacing: 80, style: 56 },
};

// family 폴백(키가 없을 때): SF는 설정·미스터리형, 그 외는 사이다·속도형.
const FAMILY_STEERING = {
  sf:      { world: 70, dopamine: 56, romance: 38, action: 56, mystery: 70, creativity: 66, pacing: 56, style: 60 },
  general: { world: 56, dopamine: 76, romance: 46, action: 64, mystery: 56, creativity: 52, pacing: 70, style: 62 },
};

/**
 * 장르(+세부장르)에 권장되는 보상체계 가중치를 돌려준다. UI 그래프바 기본값·프롬프트 주입용.
 * @param {string} genre
 * @param {string} [family]  'sf' | 'general' (장르 미등록 시 폴백 선택)
 * @returns {Object} 8차원 가중치(항상 8키 채움)
 */
function recommendedSteering(genre, family = "general") {
  const base = GENRE_STEERING[genre] || FAMILY_STEERING[family] || FAMILY_STEERING.general;
  const out = {};
  DIM_KEYS.forEach((k) => { out[k] = clamp(base[k]); });
  return out;
}

function clamp(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
}

/** 입력의 steering을 정규화(누락 차원은 50). 모두 중립이면 null. */
function normalize(steering) {
  if (!steering || typeof steering !== "object") return null;
  const out = {};
  let deviates = false;
  DIM_KEYS.forEach((k) => {
    const v = clamp(steering[k]);
    out[k] = v;
    if (Math.abs(v - 50) >= 12) deviates = true;
  });
  return deviates ? out : null;
}

// 강도형 차원(높을수록 '강하게')의 라벨.
function strengthLabel(v) {
  if (v >= 82) return "매우 강하게";
  if (v >= 64) return "강하게";
  if (v <= 18) return "거의 배제";
  if (v <= 36) return "약하게";
  return null; // 중립 → 생략
}

// 차원별 방향 문구. 중립이면 null.
function dimDirective(key, v) {
  switch (key) {
    case "world": { const s = strengthLabel(v); return s && `세계관·설정 묘사를 ${s} — ${v >= 50 ? "규칙·역사·세력을 깊고 구체적으로 보여준다" : "설정 설명을 줄이고 사건 위주로 간다"}`; }
    case "dopamine": { const s = strengthLabel(v); return s && `사이다·즉시보상을 ${s} — ${v >= 50 ? "회차마다 통쾌한 역전·보상을 박는다" : "보상을 절제하고 긴장을 길게 끈다"}`; }
    case "romance": { const s = strengthLabel(v); return s && `로맨스·관계선을 ${s} — ${v >= 50 ? "감정·관계 변화를 중심 동력으로 둔다" : "관계는 배경으로 최소화한다"}`; }
    case "action": { const s = strengthLabel(v); return s && `액션·긴장을 ${s} — ${v >= 50 ? "전투·추격·대치의 밀도를 높인다" : "물리적 충돌보다 심리·관계에 집중한다"}`; }
    case "mystery": { const s = strengthLabel(v); return s && `떡밥·미스터리를 ${s} — ${v >= 50 ? "복선을 촘촘히 깔고 의문을 끌고 간다" : "수수께끼보다 직진형 전개로 단순하게 간다"}`; }
    case "creativity": return v >= 64 ? "창의성: 클리셰를 피하고 신선·실험적 전개를 시도한다(단, 장르 약속은 지킨다)" : v <= 36 ? "창의성: 검증된 장르 클리셰·안전한 전개를 우선한다" : null;
    case "pacing": return v >= 64 ? "전개 속도: 빠르게 — 사건 밀도를 높이고 군더더기·설명을 덜어낸다" : v <= 36 ? "전개 속도: 느리게 — 분위기·묘사·내면에 충분히 시간을 준다" : null;
    case "style": return v >= 64 ? "문체: 생생하고 감각적인 묘사 위주(보여주기)" : v <= 36 ? "문체: 간결하고 담백하게, 빠르게 읽히도록" : null;
    default: return null;
  }
}

/** 모든 에이전트·회차 프롬프트에 주입할 '서사 가중치' 지시 블록. 중립이면 "". */
function buildSteeringBlock(steering) {
  const w = normalize(steering);
  if (!w) return "";
  const lines = DIM_KEYS.map((k) => dimDirective(k, w[k])).filter(Boolean);
  if (!lines.length) return "";
  return `# 서사 가중치 (작가가 지정한 방향 — 아래 강약대로 비중을 조절해 쓴다. 장르 흥행 공식·세계관 일관성은 그대로 유지)\n${lines.map((l) => `- ${l}`).join("\n")}`;
}

/** 창의성 가중을 temperature로 사상. base 기준 ±0.18 범위. */
function steeringTemperature(steering, base = 0.85) {
  const w = normalize(steering);
  if (!w) return base;
  const t = base + ((w.creativity - 50) / 50) * 0.18;
  return Math.max(0.2, Math.min(1.1, Math.round(t * 100) / 100));
}

/** 아웃라인(구조 설계) 생성 시 비트 유형 분포를 편향시키는 힌트. 중립이면 "". */
function outlineSteeringHint(steering) {
  const w = normalize(steering);
  if (!w) return "";
  const hints = [];
  if (w.dopamine >= 64) hints.push("'사이다·보상' 비트를 평소보다 더 많이");
  if (w.dopamine <= 36) hints.push("'사이다' 비트는 절제하고 긴장 유지");
  if (w.romance >= 64) hints.push("'관계' 비트를 곳곳에 배치");
  if (w.action >= 64) hints.push("'위기·액션' 비트를 늘림");
  if (w.mystery >= 64) hints.push("'떡밥·회수' 비트를 촘촘히");
  if (w.pacing >= 64) hints.push("막 길이를 짧게 끊어 빠른 전개");
  if (w.pacing <= 36) hints.push("도입·전개를 충분히 두는 느린 호흡");
  if (!hints.length) return "";
  return `\n[작가 지정 비트 편향] ${hints.join(", ")}.`;
}

/** 가중치 → 한 줄 요약(UI/디버그용). */
function steeringSummary(steering) {
  const w = normalize(steering);
  if (!w) return "균형";
  const top = DIMENSIONS
    .map((d) => ({ d, v: w[d.key], dev: Math.abs(w[d.key] - 50) }))
    .filter((x) => x.dev >= 20)
    .sort((a, b) => b.dev - a.dev)
    .slice(0, 3)
    .map((x) => `${x.d.label}${x.v >= 50 ? "↑" : "↓"}`);
  return top.length ? top.join(" · ") : "균형";
}

module.exports = {
  DIMENSIONS, DIM_KEYS, PRESETS, GENRE_STEERING,
  normalize, buildSteeringBlock, steeringTemperature, outlineSteeringHint, steeringSummary,
  recommendedSteering,
};
