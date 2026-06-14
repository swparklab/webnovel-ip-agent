"use strict";

/**
 * 연속 회차 집필 (Sequential Chapter Writer).
 *
 * 원고 탭에서 1화 → 2화 → … → 최대 10화까지 이어 쓴다.
 * 각 회차는 (확정된 기획/세계관/시즌 설계 + 직전 화 원고)를 맥락으로 받아
 * 이야기가 끊기지 않게 이어진다. 1회 1화, 또는 배치로 한 번에 여러 화도 생성한다.
 */

const { buildInputBlock } = require("./agents");

const MAX_CHAPTER = 10;

function condense(text, limit = 1500) {
  const s = String(text || "").trim();
  return s.length <= limit ? s : `${s.slice(0, limit)}\n…(생략)`;
}

function buildChapterPrompt({ input, n, prevText, ctx = {} }) {
  const system = `너는 웹소설 본문 작가다. 이미 확정된 기획/세계관/시즌 설계와 직전 화 원고에 이어서 ${n}화를 집필한다.

[집필 규칙]
- 직전 화의 마지막 절단(클리프행어)을 자연스럽게 받아 첫 문단을 연다. (1화면 설명 없이 강한 오프닝 사건으로 시작)
- 시즌 설계의 '초반 12화 회차 엔진'에 ${n}화 항목이 있으면 그 사건 비트·독자 보상·절단을 그대로 구현한다.
- 설정을 나열해 설명하지 말고 장면·대사·행동으로 보여준다. 주인공은 관찰자가 아니라 판을 바꾸는 행위자다.
- 매 회차 끝에는 다음 화를 클릭하게 만드는 강한 절단을 남긴다.
- 선택된 장르의 정서·문체를 따른다. 분량은 1,600~2,400자.
- 앞 화에서 이미 나온 사건을 반복 요약하지 말고, 한 걸음 더 전진시킨다.

[출력 형식]
- 한국어. 인사말·메타 발언("알겠습니다" 등) 없이 본문만.
- 아래 구조를 정확히 따른다.

## ${n}화. (회차 제목)
(본문 — 문단 단위. 마지막 문단은 다음 화를 부르는 강한 절단)

## 다음 화 예고
- 다음 화를 궁금하게 만드는 한 줄.`;

  const ctxBlock = [
    ctx.foresight ? `## [기획 브리프]\n${condense(ctx.foresight, 900)}` : "",
    ctx.world ? `## [세계관 바이블]\n${condense(ctx.world, 1100)}` : "",
    ctx.plot ? `## [시즌 설계 / 회차 엔진]\n${condense(ctx.plot, 1500)}` : "",
  ].filter(Boolean).join("\n\n");

  const prevBlock = prevText
    ? `## [직전 ${n - 1}화 원고]\n${condense(prevText, 1700)}`
    : `(직전 화 없음 — 이번이 1화다. 강한 오프닝 사건으로 시작하라.)`;

  const user = `${buildInputBlock(input)}\n\n${ctxBlock}\n\n${prevBlock}\n\n위 설계와 직전 화에 이어 ${n}화를 집필하라.`;
  return { system, user };
}

/** 결정론적 폴백(키 없을 때). */
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
    `> (로컬 폴백 미리보기입니다. 키/구독 연결 시 실제 원고로 생성됩니다.)`,
  ].join("\n");
}

module.exports = { buildChapterPrompt, localChapter, MAX_CHAPTER };
