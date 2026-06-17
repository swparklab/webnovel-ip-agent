"use strict";

/**
 * 장르별 권장 보상체계 검증 (Genre Recommended Steering)
 * ─────────────────────────────────────────────────────
 * 작가가 장르를 고르면 '보상체계 그래프바'에 그 장르에 맞는 권장 기본값이 채워지고,
 * 그 값이 실제로 프롬프트 주입(서사 가중치)으로 이어지는지(중립이 아니어서 의도가 깔리는지)
 * 검증한다. 처음 글을 쓸 때부터 보상 의도가 강하게 박히는 것이 목표다.
 *
 * 실행:  npm test
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DIM_KEYS, GENRE_STEERING, recommendedSteering, normalize, buildSteeringBlock,
} = require("../lib/steering");

const GENRES = Object.keys(GENRE_STEERING);

test("모든 장르가 8개 차원·0~100 범위의 권장값을 갖는다", () => {
  for (const g of GENRES) {
    const w = recommendedSteering(g);
    assert.equal(Object.keys(w).length, DIM_KEYS.length, `${g}: 차원 수 불일치`);
    for (const k of DIM_KEYS) {
      assert.ok(Number.isInteger(w[k]) && w[k] >= 0 && w[k] <= 100, `${g}.${k} 범위 이탈: ${w[k]}`);
    }
  }
});

test("권장값은 중립(전부 50)이 아니어서 실제 프롬프트 의도로 주입된다", () => {
  for (const g of GENRES) {
    const w = recommendedSteering(g);
    assert.ok(normalize(w), `${g}: 권장값이 중립이라 서사 가중치가 주입되지 않음`);
    const block = buildSteeringBlock(w);
    assert.ok(block.length > 0, `${g}: 서사 가중치 블록이 비어 있음`);
  }
});

test("보상 곡선이 장르 문법과 일치한다(사이다 강세 vs 잔잔)", () => {
  // 무림 회귀물은 사이다 최고치, 힐링은 절제 — 보상 의도가 장르별로 분명해야 한다.
  assert.ok(recommendedSteering("murimReturn").dopamine >= 85, "회귀 무협 사이다 약함");
  assert.ok(recommendedSteering("modernFantasy").dopamine >= 85, "헌터물 사이다 약함");
  assert.ok(recommendedSteering("healing").dopamine <= 45, "힐링이 과하게 사이다");
  assert.ok(recommendedSteering("healing").pacing <= 40, "힐링이 과하게 빠름");
  // 스릴러는 미스터리 최우선.
  assert.ok(recommendedSteering("thriller").mystery >= 85, "스릴러 미스터리 약함");
  // 로맨스 계열은 관계 비중이 높다.
  assert.ok(recommendedSteering("modernRomance").romance >= 85, "현대로맨스 관계 약함");
  assert.ok(recommendedSteering("romanceFantasy").romance >= 80, "로판 관계 약함");
});

test("미등록 장르는 family 기본값으로 폴백한다", () => {
  const sf = recommendedSteering("unknownGenreX", "sf");
  const general = recommendedSteering("unknownGenreY", "general");
  assert.ok(normalize(sf) && normalize(general));
  // SF 폴백은 설정·미스터리형, general 폴백은 사이다·속도형.
  assert.ok(sf.mystery >= 60, "SF 폴백 미스터리 약함");
  assert.ok(general.dopamine >= 70, "general 폴백 사이다 약함");
});
