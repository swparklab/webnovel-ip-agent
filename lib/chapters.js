"use strict";

/**
 * 연속 회차 집필 (Sequential Chapter Writer).
 *
 * 원고 탭에서 1화 → 2화 → … → 최대 10화까지 이어 쓴다.
 * 각 회차는 (확정된 기획/세계관/시즌 설계 + 직전 화 원고)를 맥락으로 받아 이어진다.
 *
 * 길이 보장: 단일 호출로는 모델이 한국어 5,500자 지시를 보수적으로 따라 ~4,000자에 그친다.
 * 그래서 한 회차를 [전반부]+[후반부] 2단계로 생성한다(각 ~2,800자는 안정적으로 지켜짐 →
 * 합쳐서 공백 포함 5,000~6,000자). 두 호출의 출력은 같은 회차로 이어 붙여 스트리밍한다.
 */

const { buildInputBlock } = require("./agents");

const MAX_CHAPTER = 60; // 하드 안전 상한. 실제 결말 지점은 요청의 total(시즌 길이)로 정한다.

function condense(text, limit = 1500) {
  const s = String(text || "").trim();
  return s.length <= limit ? s : `${s.slice(0, limit)}\n…(생략)`;
}

function ctxBlock(ctx = {}) {
  return [
    ctx.foresight ? `## [기획 브리프]\n${condense(ctx.foresight, 800)}` : "",
    ctx.world ? `## [세계관 바이블]\n${condense(ctx.world, 1000)}` : "",
    ctx.plot ? `## [시즌 설계 / 회차 엔진]\n${condense(ctx.plot, 1400)}` : "",
    // 연재 메모리(롤링 캐논): 이전 회차들의 누적 요약. 장거리 연속성의 핵심.
    ctx.storySoFar ? condense(ctx.storySoFar, 3000) : "",
  ].filter(Boolean).join("\n\n");
}

// 시즌 안에서 현재 화의 위치를 알려주는 페이싱 힌트.
function pacingHint(n, total) {
  const t = total || 25;
  if (n >= t) return `이 작품은 총 ${t}화 시즌이고 이번이 마지막 ${t}화(결말)다. 모든 핵심 갈등을 매듭짓는다.`;
  const ratio = n / t;
  const stage = ratio <= 0.2 ? "도입부(세계·결핍·특권 제시)"
    : ratio <= 0.5 ? "전개부(반복 루프로 판을 키움)"
    : ratio <= 0.8 ? "위기 고조부(복선 회수 시작, 적의 본진 노출)"
    : "피날레 직전(결정적 선택을 향해 모든 줄기를 모음)";
  return `이 작품은 총 ${t}화 시즌이고 현재 ${n}화 — ${stage} 구간이다. 이 위치에 맞게 사건 밀도와 복선을 조절한다.`;
}

// 개선(수정) 모드일 때 프롬프트에 붙는 '하네스' 블록.
function reviseBlock(revise, n) {
  if (!revise || !revise.note) return "";
  // 완성도(공모전) 보강 모드 — 상업 공식보다 작품 완성도를 우선한다.
  if (revise.mode === "literary") {
    return `\n[완성도 보강 하네스 — 공모전 '완성도' 기준. 전부 충족]
1. 상업적 사이다·클리셰보다 '작품으로서의 완성도'를 우선한다: 문장의 정확성과 리듬, 장면의 밀도, 개연성·내적 정합성, 캐릭터의 내면과 동기, 주제의식, 정서적 울림.
2. 기시감·클리셰 표현을 제거하고 신선한 묘사·전개로 바꾼다.
3. 아래 [보강 지시]의 약점을 빠짐없이 해소한다. 연속성·설정 오류가 지적됐으면 바로잡는다.
4. 원본의 사건·복선·연속성은 유지하되 문장과 장면을 더 정교하게 다시 쓴다. 분량·구조 기준(5,000~6,000자, 2단계)은 동일.

[보강 지시]
${String(revise.note).slice(0, 1400)}
${revise.original ? `\n## [원본 ${n}화]\n${String(revise.original).slice(0, 2400)}` : ""}`;
  }
  return `\n[개선 하네스 — 아래를 전부 충족해야 한다. 하나라도 어기면 실패다]
1. 작품 코어/명제와 장르 흥행 공식(결핍 → 특권 → 회차 검증 → 즉시 보상 → 세계 확장)을 이 회차가 한 바퀴 '이행'하도록 다시 쓴다. (위 '흥행 문법' 블록을 기준으로 삼아라)
2. 아래 [수정 지시]를 항목별로 빠짐없이 반영한다. 한 항목이라도 누락 금지.
3. '피해야 할 실패 패턴'을 하나도 범하지 않는다 — 특히 주인공 수동성, 설정 나열, 흐릿한 결핍·특권, 추상적 보상, 반복 루프 부재.
4. 이 회차의 보상을 레벨/점수/지위/호감/랭킹/돈 등 '눈에 보이는' 수치·관계 변화로 박는다.
5. 원본의 좋은 사건·복선·연속성은 유지하되, 지적된 약점은 확실히 제거한다. 원본을 그대로 베끼지 말고 장면을 다시 써라. 분량·구조 기준(5,000~6,000자, 2단계)은 동일하게 지킨다.

[수정 지시]
${String(revise.note).slice(0, 1400)}
${revise.original ? `\n## [원본 ${n}화]\n${String(revise.original).slice(0, 2400)}` : ""}`;
}

/** 회차 전반부: 도입 훅 + 장면 전개(약 2,800~3,200자). 회차를 끝맺지 않는다. */
function buildChapterFirstPrompt({ input, n, prevText, ctx = {}, total = 25, revise = null }) {
  const system = `너는 웹소설 본문 작가다. 확정된 기획/세계관/시즌 설계와 직전 화에 이어 ${n}화를 쓴다. 지금은 이 회차의 [전반부]만 쓴다.${revise ? " (기존 회차를 개선해 다시 쓰는 작업이다)" : ""}

[시즌 위치] ${pacingHint(n, total)}${reviseBlock(revise, n)}

[규칙]
- '## ${n}화. (회차 제목)'으로 시작한다.
- 직전 화의 절단(클리프행어)을 받아, 도입 훅(강렬한 첫 장면) → 장면 전개 순으로 공백 포함 약 2,800~3,200자를 충실히 쓴다.
- 아직 회차를 끝내지 마라. 갈등의 절정·결정적 반전·'다음 화 예고'는 쓰지 않는다. 장면이 고조되는 도중에 자연스럽게 멈춘다.
- 설정을 나열해 설명하지 말고 장면·대사·내면으로 보여준다. 주인공은 판을 바꾸는 행위자다.
- 선택된 장르의 정서·문체. 한국어. 인사말·메타 발언 없이 본문만.`;

  const prevBlock = prevText
    ? `## [직전 ${n - 1}화 원고]\n${condense(prevText, 1500)}`
    : `(직전 화 없음 — 이번이 1화다. 설명 없이 강한 오프닝 사건으로 시작하라.)`;

  const user = `${buildInputBlock(input)}\n\n${ctxBlock(ctx)}\n\n${prevBlock}\n\n위 설계와 직전 화에 이어 ${n}화의 전반부를 써라.`;
  return { system, user };
}

/** 회차 후반부: 세계관/과학소재 정보 + 갈등·반전 + (피날레면) 결말 / (아니면) 다음 화 후킹. */
function buildChapterSecondPrompt({ input, n, prevText, ctx = {}, firstText, total = 25, isFinale = false, revise = null }) {
  const ending = isFinale
    ? `- 이 화는 시즌의 '마지막 화(결말)'다. 클리프행어로 끝내지 마라. 입력의 '시즌 목표'를 매듭짓고, 핵심 갈등을 해소하며 판이 뒤집히는 피날레로 결말을 낸다. 감정적 카타르시스를 준다.
- 마지막은 줄을 바꿔 '## 시즌 피날레'와, 다음 시즌으로 이어질 여운(차기 떡밥) 한 줄로 마무리한다.`
    : `- 마지막은 다음 화를 클릭하게 만드는 강한 절단으로 끝낸 뒤, 줄을 바꿔 '## 다음 화 예고'와 한 줄을 덧붙인다.`;
  const system = `너는 같은 ${n}화를 마무리하는 작가다. 아래 [이번 화 전반부]에 자연스럽게 이어 [후반부]를 써서 회차를 완성한다. (총 ${total}화 시즌의 ${n}화)${revise ? `\n\n[개선 임무] 이 회차는 기존 원고를 개선해 다시 쓰는 중이다. 지침: ${String(revise.note).slice(0, 800)}` : ""}

[규칙]
- 제목·도입을 다시 쓰지 마라. 전반부의 마지막 흐름을 그대로 이어받아 곧바로 본문을 계속한다.
- 후반부 구성: 설정·세계관(SF면 과학소재) 정보 800~1,200자 → 갈등·반전 1,000~1,500자 → ${isFinale ? "결말" : "다음 화 후킹"}.
- 공백 포함 약 2,500~3,000자.
${ending}
- 전반부 내용을 반복 요약하지 말고 한 걸음 더 전진시킨다. 한국어. 본문만.`;

  const user = `${buildInputBlock(input)}\n\n${ctxBlock({ plot: ctx.plot, storySoFar: ctx.storySoFar })}\n\n## [이번 화 전반부]\n${condense(firstText, 2600)}\n\n위 전반부에 자연스럽게 이어 ${n}화의 후반부를 써서 회차를 완성하라.`;
  return { system, user };
}

/** 결정론적 폴백(키 없을 때). 길이는 미리보기 수준. */
function localChapter(input, n, prevText, isFinale = false) {
  const name = String(input.protagonist || "주인공").split(/[,，]/)[0].trim() || "주인공";
  const foe = input.antagonist || "거대한 압력";
  const want = input.desire || "빼앗긴 것";
  const goal = input.seasonGoal || "마침내 판을 뒤집을 진실";
  const open = prevText
    ? `직전 화의 끝에서 멈췄던 순간이 다시 움직였다. ${name}은(는) 숨을 골랐다. 물러설 자리는 없었다.`
    : `${input.logline || `${name}의 평범한 하루가 한순간에 무너졌다.`}`;
  const body = [
    `## ${n}화. ${isFinale ? "마지막 예언" : n === 1 ? "시작된 균열" : `${name}, 멈출 수 없는 ${n}`}`,
    ``,
    open,
    ``,
    `${name}은(는) ${foe} 앞에서 물러서지 않았다. 모두가 안 된다고 말한 길로, ${name}은(는) 한 걸음 더 들어갔다. ${want}을(를) 되찾기 위해서라면.`,
    ``,
  ];
  if (isFinale) {
    body.push(
      `그리고 마침내 ${name}은(는) ${goal}에 도달했다. ${foe}이(가) 쌓아 올린 질서가 무너지고, ${name}은(는) ${want}을(를) 손에 넣었다. 길었던 싸움의 끝이었다.`,
      ``,
      `## 시즌 피날레`,
      `- 한 판은 끝났다. 그러나 더 큰 세계가, 이제 막 ${name}의 이름을 부르기 시작했다.`,
    );
  } else {
    body.push(
      `그리고 ${n}화의 마지막, 예상치 못한 사실 하나가 ${name}의 발밑을 무너뜨렸다. 돌이킬 수 없는 다음이 막 시작되려 하고 있었다.`,
      ``,
      `## 다음 화 예고`,
      `- ${name}이(가) 붙잡은 진실은, 사실 ${name} 자신을 겨누고 있었다.`,
    );
  }
  body.push(``, `> (로컬 폴백 미리보기입니다. 키/구독 연결 시 회당 5,000~6,000자의 실제 원고로 생성됩니다.)`);
  return body.join("\n");
}

module.exports = {
  buildChapterFirstPrompt,
  buildChapterSecondPrompt,
  localChapter,
  MAX_CHAPTER,
};
