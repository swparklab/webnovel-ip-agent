"use strict";

/**
 * 채점 목표 검증 (Scoring-Target Harness)
 * ─────────────────────────────────────────
 * "1차 생성은 80점 이상, 2차 보완은 90점 이상"이라는 제품 목표가 코드 수준에서
 * 실제로 달성되는지 고정한다. 생성기(scoringTargetBlock)가 강제하는 흥행 신호와
 * 채점기(localCritique/scoreSignals)가 1:1로 정렬돼 있는지 함께 검증한다.
 *
 * 실행:  npm test
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { localChapter, scoringTargetBlock } = require("../lib/chapters");
const { localCritique, scoreSignals } = require("../lib/critique");

const CASES = [
  { genre: "martial", protagonist: "서리", antagonist: "천하제일문", desire: "빼앗긴 무공", seasonGoal: "가문의 진실", worldRule: "무공 등급이 신분을 결정한다" },
  { genre: "romance", protagonist: "리아", antagonist: "황실", desire: "잃어버린 이름", seasonGoal: "진짜 혈통" },
  { genre: "fantasy", protagonist: "카이", antagonist: "길드연합", desire: "동생", seasonGoal: "균열의 비밀" },
];

// ── 1차 생성 목표: overall ≥ 80 ───────────────────────────────
for (const input of CASES) {
  test(`Scoring[${input.genre}]: 1차 생성 원고가 자체 비평 80점 이상을 받는다`, () => {
    const fresh = localChapter(input, 3, "직전 화", false);
    const c = localCritique(input, 3, fresh);
    assert.ok(c.overall >= 80, `1차 overall ${c.overall} < 80`);
    assert.ok(c.formulaFit >= 80, `1차 formulaFit ${c.formulaFit} < 80`);
  });
}

// ── 2차 보완 목표: overall ≥ 90 이고 1차보다 상승 ─────────────
for (const input of CASES) {
  test(`Scoring[${input.genre}]: 2차 보완본이 90점 이상이며 1차보다 상승한다`, () => {
    const fresh = localChapter(input, 3, "직전 화", false);
    const revised = localChapter(input, 3, "직전 화", false, { note: "보강" });
    const cF = localCritique(input, 3, fresh);
    const cR = localCritique(input, 3, revised);
    assert.ok(cR.overall >= 90, `보완 overall ${cR.overall} < 90`);
    assert.ok(cR.overall > cF.overall, `보완(${cR.overall})이 1차(${cF.overall})보다 높지 않음`);
  });
}

// ── 신호 추출 정확성 (생성기 강제 항목 ↔ 채점기 인식 항목 정렬) ──
test("Signals: 1차 원고는 능동성·절단·복선·가시 보상 신호를 갖춘다", () => {
  const fresh = localChapter(CASES[0], 3, "직전 화", false);
  const s = scoreSignals(fresh);
  assert.ok(s.agency, "주인공 능동성 신호 누락");
  assert.ok(s.cliff, "절단 신호 누락");
  assert.ok(s.foreshadow, "복선 신호 누락");
  assert.ok(s.rewardDistinct >= 1, "가시 보상 신호 누락");
});

test("Signals: 보완본은 수치화된 보상(quantReward)과 더 많은 보상 신호를 추가한다", () => {
  const fresh = localChapter(CASES[2], 3, "직전 화", false);
  const revised = localChapter(CASES[2], 3, "직전 화", false, { note: "보강" });
  const sF = scoreSignals(fresh);
  const sR = scoreSignals(revised);
  assert.ok(!sF.quantReward, "1차에 이미 수치 보상이 있어 보완 차별이 사라짐");
  assert.ok(sR.quantReward, "보완본에 수치화된 보상이 없음");
  assert.ok(sR.rewardDistinct > sF.rewardDistinct, "보완본의 보상 종류가 1차보다 많지 않음");
});

test("Signals: 회차 제목의 'N화' 숫자는 수치 보상으로 오인되지 않는다", () => {
  // '## 3화.'의 3은 보상 수치가 아니다. 보상어 옆 숫자/단위만 quantReward로 인정.
  const s = scoreSignals("## 3화. 시작\n그는 한 걸음 나아갔다. 다음 화 예고\n- 끝");
  assert.equal(s.quantReward, false);
});

// ── 채점 단조성: 신호가 늘면 점수가 오른다 ───────────────────
test("Monotonic: 가시 보상을 추가하면 formulaFit이 오른다", () => {
  const input = CASES[0];
  const base = "## 3화. 시작\n" + "그는 망설였다. ".repeat(40) + "\n## 다음 화 예고\n- 돌이킬 수 없는 일이 시작되려 했다.";
  const withReward = base + "\n그 순간 그의 등급이 320점으로 올라 정식 자리를 획득했다.";
  const cBase = localCritique(input, 3, base);
  const cReward = localCritique(input, 3, withReward);
  assert.ok(cReward.formulaFit > cBase.formulaFit, "보상 추가가 formulaFit을 올리지 못함");
});

// ── 생성 프롬프트 ↔ 채점 기준 정렬 ───────────────────────────
test("Prompt: scoringTargetBlock이 채점 기준(수치 보상·능동성·절단)을 1차 생성에 강제한다", () => {
  const block = scoringTargetBlock(CASES[0], { target: 80 });
  assert.match(block, /80점/);
  assert.match(block, /수치|등급|점수|지위/);
  assert.match(block, /능동/);
  assert.match(block, /절단|클리프행어/);
});

test("Prompt: 보완 모드에서 목표가 90점으로 올라간다", () => {
  const block = scoringTargetBlock(CASES[0], { target: 90 });
  assert.match(block, /90점/);
});
