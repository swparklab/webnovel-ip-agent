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

const MAX_CHAPTER = 10;

function condense(text, limit = 1500) {
  const s = String(text || "").trim();
  return s.length <= limit ? s : `${s.slice(0, limit)}\n…(생략)`;
}

function ctxBlock(ctx = {}) {
  return [
    ctx.foresight ? `## [기획 브리프]\n${condense(ctx.foresight, 800)}` : "",
    ctx.world ? `## [세계관 바이블]\n${condense(ctx.world, 1000)}` : "",
    ctx.plot ? `## [시즌 설계 / 회차 엔진]\n${condense(ctx.plot, 1400)}` : "",
  ].filter(Boolean).join("\n\n");
}

/** 회차 전반부: 도입 훅 + 장면 전개(약 2,800~3,200자). 회차를 끝맺지 않는다. */
function buildChapterFirstPrompt({ input, n, prevText, ctx = {} }) {
  const system = `너는 웹소설 본문 작가다. 확정된 기획/세계관/시즌 설계와 직전 화에 이어 ${n}화를 쓴다. 지금은 이 회차의 [전반부]만 쓴다.

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

/** 회차 후반부: 세계관/과학소재 정보 + 갈등·반전 + 다음 화 후킹(약 2,500~3,000자). 회차를 완성한다. */
function buildChapterSecondPrompt({ input, n, prevText, ctx = {}, firstText }) {
  const system = `너는 같은 ${n}화를 마무리하는 작가다. 아래 [이번 화 전반부]에 자연스럽게 이어 [후반부]를 써서 회차를 완성한다.

[규칙]
- 제목·도입을 다시 쓰지 마라. 전반부의 마지막 흐름을 그대로 이어받아 곧바로 본문을 계속한다.
- 후반부 구성: 설정·세계관(SF면 과학소재) 정보 800~1,200자 → 갈등·반전 1,000~1,500자 → 다음 화 후킹.
- 공백 포함 약 2,500~3,000자.
- 마지막은 다음 화를 클릭하게 만드는 강한 절단으로 끝낸 뒤, 줄을 바꿔 '## 다음 화 예고'와 한 줄을 덧붙인다.
- 전반부 내용을 반복 요약하지 말고 한 걸음 더 전진시킨다. 한국어. 본문만.`;

  const user = `${buildInputBlock(input)}\n\n${ctxBlock({ plot: ctx.plot })}\n\n## [이번 화 전반부]\n${condense(firstText, 2600)}\n\n위 전반부에 자연스럽게 이어 ${n}화의 후반부를 써서 회차를 완성하라.`;
  return { system, user };
}

/** 결정론적 폴백(키 없을 때). 길이는 미리보기 수준. */
function localChapter(input, n, prevText) {
  const name = String(input.protagonist || "주인공").split(/[,，]/)[0].trim() || "주인공";
  const foe = input.antagonist || "거대한 압력";
  const want = input.desire || "빼앗긴 것";
  const open = prevText
    ? `직전 화의 끝에서 멈췄던 순간이 다시 움직였다. ${name}은(는) 숨을 골랐다. 물러설 자리는 없었다.`
    : `${input.logline || `${name}의 평범한 하루가 한순간에 무너졌다.`}`;
  return [
    `## ${n}화. ${n === 1 ? "시작된 균열" : `${name}, 멈출 수 없는 ${n}`}`,
    ``,
    open,
    ``,
    `${name}은(는) ${foe} 앞에서 물러서지 않았다. 모두가 안 된다고 말한 길로, ${name}은(는) 한 걸음 더 들어갔다. ${want}을(를) 되찾기 위해서라면.`,
    ``,
    `그리고 ${n}화의 마지막, 예상치 못한 사실 하나가 ${name}의 발밑을 무너뜨렸다. 돌이킬 수 없는 다음이 막 시작되려 하고 있었다.`,
    ``,
    `## 다음 화 예고`,
    `- ${name}이(가) 붙잡은 진실은, 사실 ${name} 자신을 겨누고 있었다.`,
    ``,
    `> (로컬 폴백 미리보기입니다. 키/구독 연결 시 회당 5,000~6,000자의 실제 원고로 생성됩니다.)`,
  ].join("\n");
}

module.exports = {
  buildChapterFirstPrompt,
  buildChapterSecondPrompt,
  localChapter,
  MAX_CHAPTER,
};
