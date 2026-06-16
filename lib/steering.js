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
  DIMENSIONS, DIM_KEYS, PRESETS,
  normalize, buildSteeringBlock, steeringTemperature, outlineSteeringHint, steeringSummary,
};
