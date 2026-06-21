"use strict";

/**
 * 캐릭터 시트 고정 (Character Sheet Lock).
 *
 * AI 영상/이미지 생성에서 가장 깨지기 쉬운 '캐릭터 일관성'을 고정한다.
 *   1) 캐릭터 디자인 시트(턴어라운드: 정면·3/4·측면·후면 + 표정 6종) 생성 프롬프트
 *   2) 모든 샷/이미지 프롬프트에 그대로 반복 삽입할 '재사용 CHARACTER LOCK 토큰'
 *   3) 타깃 생성 모델별 일관성 고정법(Kling 레퍼런스·Runway Act-One·Seedance 멀티이미지·
 *      Midjourney --cref·ComfyUI IPAdapter/InstantID 등)
 *   4) 일관성 네거티브 프롬프트
 *
 * 토큰(lockToken)이 잠기면 콘티·그림풍·영상 프롬프트에 CHARACTER LOCK 블록으로 자동 주입된다.
 * (순환 의존성 방지를 위해 medium.js만 require 한다)
 */

const { resolveMedium } = require("./medium");

/* 모델/도구별 캐릭터 일관성 고정법(현장 워크플로). */
const CONSISTENCY_METHODS = {
  kling: { label: "Kling 1.6", how: "캐릭터 정면 시트 1장을 Face/Element 레퍼런스 이미지로 업로드해 동일 인물 유지. 모든 샷에 같은 레퍼런스를 건다." },
  runway: { label: "Runway Gen-4.5", how: "References(레퍼런스 이미지) 고정 또는 Custom model 학습 + Act-One으로 표정·연기를 동일 캐릭터에 이식. 동일 시드 반복." },
  sora: { label: "Sora", how: "Cameo로 캐릭터를 등록하고 동일 스토리보드 안에서 일관 유지. 상세 고정 묘사 토큰을 모든 샷에 반복." },
  seedance: { label: "Seedance 2.0", how: "멀티 이미지 인풋(최대 9장)에 캐릭터 정면·측면·표정을 함께 넣어 단일 패스로 일관 생성." },
  happyhorse: { label: "HappyHorse-1.0", how: "동일 캐릭터 레퍼런스 + 안면 골격 묘사 고정 + 립싱크." },
};
const GENERAL_METHODS = [
  "캐릭터 시트(턴어라운드: 정면·3/4·측면·후면 + 표정 6종)를 먼저 1장 생성해 '마스터 기준 이미지'로 삼는다.",
  "모든 샷 프롬프트 맨 앞에 동일한 CHARACTER LOCK 토큰(외형·헤어·체형·의상·식별 포인트·색)을 한 글자도 바꾸지 않고 반복 삽입한다.",
  "Midjourney면 --cref(character reference)+--cw 100, --sref(style reference)로 캐릭터·스타일 고정.",
  "ComfyUI/SD면 IPAdapter·InstantID·ReActor 또는 캐릭터 LoRA로 얼굴을 고정.",
  "LTX/M Studio 등 파이프라인이면 주인공을 Elements로 등록·태깅해 프로젝트 전반에 고정.",
  "시드(seed)·팔레트·스타일을 고정하고, 네거티브에 'inconsistent face, different person, face morphing'을 넣는다.",
];

function resolveModelKey(k) { return CONSISTENCY_METHODS[k] ? k : "kling"; }

/** 잠긴 CHARACTER LOCK 토큰을 콘티·이미지 프롬프트에 주입하는 블록. (없으면 "") */
function buildCharLockBlock(lockToken) {
  const s = String(lockToken || "").trim();
  if (!s) return "";
  return `[🧍 CHARACTER LOCK — 모든 컷/이미지 프롬프트 맨 앞에 아래 고정 토큰을 한 글자도 바꾸지 말고 그대로 반복 삽입해 캐릭터를 동일하게 유지한다. 네거티브에 'inconsistent face, different person, face morphing' 포함]
${s}`;
}

/* ----------------------- 캐릭터 시트 고정 생성(LLM) ----------------------- */
function buildCharSheetPrompt({ input = {}, oneSheet, styleCore, targetModel }) {
  const mk = resolveModelKey(targetModel);
  const method = CONSISTENCY_METHODS[mk];
  const proto = input.protagonist || (oneSheet && oneSheet.characterEngine) || "주인공";
  const cont = (oneSheet && oneSheet.continuityBible) || "";
  const ds = (input.designSpec && typeof input.designSpec === "object") ? Object.values(input.designSpec).filter(Boolean).slice(0, 6).join(" · ") : "";
  const styleLine = styleCore || input._styleCore || "the chosen art style of the film";

  const system = `너는 AI 애니메이션 캐릭터 디자이너이자 일관성(consistency) 엔지니어다. 주인공의 '캐릭터 시트'를 만들고, 그 캐릭터가 모든 샷에서 동일하게 유지되도록 '고정(LOCK)' 프롬프트를 설계한다.

[캐릭터 정보]
- 주인공: ${proto}
- 연속성 고정값(있으면): ${cont || "(없음 — 새로 구체화)"}
- 설계 노브(있으면): ${ds || "(없음)"}
- 적용 아트 스타일: ${styleLine}
- 타깃 생성 모델: ${method.label}

[원칙]
- lockToken은 '재사용 가능한 단일 영어 묘사 블록'이다(약 35~60단어). 얼굴(골격·눈·코·입·주름)·헤어·체형·피부·의상·식별 포인트(상처·안경·소품)·색 팔레트를 '변하지 않는 고정값'으로 못 박는다. 장면·감정·배경은 넣지 않는다(그건 샷마다 바뀜).
- 이 토큰을 모든 샷 프롬프트 맨 앞에 그대로 반복 삽입하면 캐릭터가 동일하게 유지된다.

[출력 — JSON 하나만. 코드펜스·설명 금지]
{
  "lockToken": "재사용 CHARACTER LOCK 토큰(영어, 35~60단어, 고정 외형만)",
  "sheetPrompt": "캐릭터 디자인 시트 생성 프롬프트(영어). character turnaround: front, 3/4, side, back views, neutral T-pose, model sheet, consistent proportions, on plain background, 아트 스타일 반영, --ar 16:9",
  "expressionSheet": "표정 시트 생성 프롬프트(영어). same character, expression sheet of 6 emotions(neutral, quiet sadness, faint hope, anger, fear, realization), consistent face --ar 16:9",
  "negative": "일관성 네거티브(영어). inconsistent face, different person, face morphing, changing hairstyle, different clothing, extra fingers, warped features 등",
  "modelMethod": "${method.label}에서 이 캐릭터를 고정하는 구체적 방법 한 줄(한국어)"
}`;
  const user = `위 주인공의 캐릭터 시트 + 재사용 CHARACTER LOCK 토큰(${method.label} 기준)을 설계하라(JSON).`;
  return { system, user };
}

function parseCharSheet(text) {
  if (!text) return null;
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1 || e <= s) return null;
  const raw = text.slice(s, e + 1);
  let obj = null;
  try { obj = JSON.parse(raw); } catch { try { obj = JSON.parse(raw.replace(/,(\s*[}\]])/g, "$1")); } catch { return null; } }
  if (!obj || typeof obj !== "object") return null;
  const str = (v) => String(v == null ? "" : v).trim();
  if (!str(obj.lockToken)) return null;
  return {
    lockToken: str(obj.lockToken),
    sheetPrompt: str(obj.sheetPrompt),
    expressionSheet: str(obj.expressionSheet),
    negative: str(obj.negative) || "inconsistent face, different person, face morphing, changing hairstyle, different clothing, extra fingers, warped features",
    modelMethod: str(obj.modelMethod),
  };
}

function localCharSheet({ input = {}, oneSheet, styleCore, targetModel }) {
  const mk = resolveModelKey(targetModel);
  const method = CONSISTENCY_METHODS[mk];
  const proto = String(input.protagonist || (oneSheet && oneSheet.characterEngine) || "an elderly protagonist").split(/[,，(]/)[0].trim();
  const style = styleCore || "the film's art style";
  const lockToken = `Consistent character: ${proto}, late 70s, thin build, slightly hunched, deep facial wrinkles, tired gentle eyes, short gray hair, age-marked hands, wearing a plain dark cardigan over a collared shirt; muted cold palette; ${style}. Keep face, hair, build and clothing identical in every shot.`;
  return {
    lockToken,
    sheetPrompt: `Character design model sheet of ${proto}: front, 3/4, side and back turnaround views, neutral T-pose, consistent proportions, plain neutral background, ${style}, clean reference sheet --ar 16:9`,
    expressionSheet: `Expression sheet of the same character (${proto}): six emotions — neutral, quiet sadness, faint hope, restrained anger, fear, realization — identical face and hair, ${style} --ar 16:9`,
    negative: "inconsistent face, different person, face morphing, changing hairstyle, different clothing, extra fingers, warped features, age drift",
    modelMethod: method.how,
    methods: GENERAL_METHODS,
    fallback: true,
  };
}

module.exports = {
  CONSISTENCY_METHODS, GENERAL_METHODS, resolveModelKey,
  buildCharLockBlock, buildCharSheetPrompt, parseCharSheet, localCharSheet,
};
