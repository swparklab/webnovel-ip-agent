"use strict";

/**
 * 핵심 메커니즘 검증 하네스 (Core-Mechanism Evaluation Harness)
 * ──────────────────────────────────────────────────────────────
 * 이 솔루션의 4대 차별 메커니즘이 '마케팅 문구'가 아니라 '실제로 코드에서 동작하는
 * 불변식(invariant)'임을 기계적으로 증명한다. 외부 의존성 0 — Node 18+ 내장
 * node:test / node:assert 만 사용한다.
 *
 *   1) 캐논 락(Canon Lock)        — 길이 압박 하에서도 세계관 규칙이 잘리지 않는가
 *   2) 비트 시트(Beat-Sheet)      — 기승전결이 회차에 비례 매핑되고 비트가 회차에 박히는가
 *   3) 의존성 웨이브(Wave)         — 위상정렬이 의존성을 어기지 않는가(실제 에이전트 그래프 포함)
 *   4) 복선 차집합(Foreshadowing) — 미회수 복선을 정확히 추적하고 오판하지 않는가
 *
 * 실행:  npm test   (= node --test test/)
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { composeCanonLock, composeStorySoFar, unresolvedThreads } = require("../lib/memory");
const { localOutline, outlineGuideFor } = require("../lib/outline");
const { planWaves } = require("../lib/orchestrator");
const { AGENTS } = require("../lib/agents");

// ───────────────────────────────────────────────────────────────
// 1. 캐논 락 — 드리프트 방지 불변식
// ───────────────────────────────────────────────────────────────
test("CanonLock: 초기 세계관 규칙이 모두 보존된다", () => {
  const input = {
    worldRule: "마나는 유한하며 소진 시 수명을 태운다",
    powerSystem: "각성 등급 F~SSS, 등급 강등 불가",
    factions: "협회 / 길드연합 / 균열 너머 세력",
    worldHistory: "10년 전 1차 대균열로 인류 절반 소멸",
  };
  const block = composeCanonLock({}, input);
  assert.match(block, /CANON LOCK/);
  for (const v of Object.values(input)) {
    assert.ok(block.includes(v), `세계관 규칙이 캐논 락에서 누락됨: ${v}`);
  }
});

test("CanonLock: '동일한 강제력' 지시가 항상 최상단에 주입된다", () => {
  const block = composeCanonLock({}, { worldRule: "X" });
  assert.match(block, /동일한 강제력/);
  // 헤더가 블록의 맨 앞(첫 80자 이내)에 와야 한다 → 최상단·풀웨이트 주입.
  assert.ok(block.indexOf("CANON LOCK") < 80);
});

test("CanonLock: 누적 canon은 중복 제거되고 보존된다(요약과 분리)", () => {
  const memories = {
    1: { canon: ["주인공의 진짜 이름은 '서리'다", "검은 칼은 봉인구다"] },
    2: { canon: ["검은 칼은 봉인구다", "협회장은 배신자다"] }, // 중복 1건
  };
  const block = composeCanonLock(memories, {});
  assert.ok(block.includes("서리"));
  assert.ok(block.includes("협회장은 배신자다"));
  // '검은 칼은 봉인구다'가 정확히 1회만(중복 제거).
  const occurrences = block.split("검은 칼은 봉인구다").length - 1;
  assert.equal(occurrences, 1);
});

test("CanonLock: 줄거리 요약은 길이에 밀려 잘려도, canon 블록은 별도로 풀웨이트 유지된다", () => {
  // 회차가 많아 storySoFar는 압축되지만 canon은 분리 보존되는지 확인.
  const memories = {};
  for (let i = 1; i <= 40; i++) {
    memories[i] = {
      synopsis: `${i}화: ` + "사건이 길게 이어진다. ".repeat(20),
      canon: i === 1 ? ["세계의 진실: 태양은 인공물이다"] : [],
    };
  }
  const story = composeStorySoFar(memories, { maxChars: 2800 });
  const canon = composeCanonLock(memories, {});
  // 줄거리는 길이 상한으로 압축(중략 표시)될 수 있다.
  assert.ok(story.length <= 2900);
  // 그러나 1화에서 확정된 canon은 분리된 블록에 온전히 남는다.
  assert.ok(canon.includes("태양은 인공물이다"));
});

// ───────────────────────────────────────────────────────────────
// 2. 비트 시트 — 구조 강제 불변식
// ───────────────────────────────────────────────────────────────
test("BeatSheet: 기승전결 4막이 1~N화를 빈틈·겹침 없이 덮는다", () => {
  const total = 60;
  const o = localOutline({ input: { genre: "fantasy" }, total });
  assert.equal(o.acts.length, 4);
  assert.equal(o.acts[0].from, 1);
  assert.equal(o.acts[o.acts.length - 1].to, total);
  // 막 경계가 연속(겹치거나 비지 않음).
  for (let i = 1; i < o.acts.length; i++) {
    assert.equal(o.acts[i].from, o.acts[i - 1].to + 1, "막 경계 불연속");
  }
});

test("BeatSheet: 4막 비율이 기 20 / 승 35 / 전 30 / 결 15 근사를 따른다", () => {
  const total = 100;
  const o = localOutline({ input: { genre: "fantasy" }, total });
  const span = (a) => a.to - a.from + 1;
  const ratios = o.acts.map((a) => span(a) / total);
  const target = [0.2, 0.35, 0.3, 0.15];
  ratios.forEach((r, i) => {
    assert.ok(Math.abs(r - target[i]) <= 0.06, `${o.acts[i].act}막 비율 ${r} 이탈`);
  });
});

test("BeatSheet: 모든 도파민 비트가 유효 회차(1~N)에 박힌다", () => {
  const total = 40;
  const o = localOutline({ input: { genre: "fantasy" }, total });
  assert.ok(o.beats.length >= 6, "비트가 너무 적다");
  for (const b of o.beats) {
    assert.ok(b.n >= 1 && b.n <= total, `비트 회차 범위 이탈: ${b.n}`);
    assert.ok(b.type && b.desc, "비트 타입/설명 누락");
  }
});

test("BeatSheet: 마지막 화에 카타르시스 비트가 배치된다", () => {
  const total = 40;
  const o = localOutline({ input: { genre: "fantasy" }, total });
  const finale = o.beats.filter((b) => b.n === total);
  assert.ok(finale.length >= 1, "피날레 비트 없음");
});

test("BeatSheet: outlineGuideFor(n)이 n이 속한 막과 그 회차 비트를 주입한다", () => {
  const total = 40;
  const o = localOutline({ input: { genre: "fantasy" }, total });
  const beat = o.beats[0];
  const guide = outlineGuideFor(o, beat.n);
  const act = o.acts.find((a) => beat.n >= a.from && a.to >= beat.n);
  assert.ok(guide.includes(act.act), "현재 막 미주입");
  assert.ok(guide.includes(beat.desc), "해당 회차 비트 미주입");
  assert.match(guide, new RegExp(`${beat.n}화`));
});

test("BeatSheet: 곧 다가올 비트의 빌드업 지침이 미리 주입된다", () => {
  const total = 40;
  const o = localOutline({ input: { genre: "fantasy" }, total });
  // 비트가 박힌 회차의 직전 회차 지침에는 '곧 다가올 비트'가 노출돼야 한다.
  const b = o.beats.find((x) => x.n >= 3);
  const guide = outlineGuideFor(o, b.n - 1);
  assert.match(guide, /곧 다가올 비트|빌드업/);
});

// ───────────────────────────────────────────────────────────────
// 3. 의존성 웨이브 — 위상정렬 정확성
// ───────────────────────────────────────────────────────────────
test("Wave: 합성 그래프에서 의존성은 반드시 더 앞선 웨이브에 온다", () => {
  const agents = [
    { id: "a", dependsOn: [] },
    { id: "b", dependsOn: ["a"] },
    { id: "c", dependsOn: ["a"] }, // b와 동일 레벨 → 병렬
    { id: "d", dependsOn: ["b", "c"] },
  ];
  const waves = planWaves(agents);
  const waveOf = (id) => waves.findIndex((w) => w.some((x) => x.id === id));
  assert.ok(waveOf("a") < waveOf("b"));
  assert.ok(waveOf("a") < waveOf("c"));
  assert.equal(waveOf("b"), waveOf("c"), "독립 에이전트는 같은 웨이브(병렬)여야 함");
  assert.ok(waveOf("d") > waveOf("b"));
  assert.ok(waveOf("d") > waveOf("c"));
});

test("Wave: 실제 제작실 에이전트 그래프가 위상정렬 불변식을 만족한다", () => {
  const waves = planWaves(AGENTS);
  const level = new Map();
  waves.forEach((w, i) => w.forEach((a) => level.set(a.id, i)));
  // 모든 에이전트는 자신의 dependsOn보다 '엄격히 뒤' 웨이브여야 한다.
  for (const a of AGENTS) {
    for (const dep of a.dependsOn || []) {
      if (!level.has(dep)) continue;
      assert.ok(level.get(a.id) > level.get(dep), `${a.id}가 의존 ${dep}보다 앞서거나 같은 웨이브`);
    }
  }
  // 모든 에이전트가 정확히 한 번씩 배치된다.
  const flat = waves.flat();
  assert.equal(flat.length, AGENTS.length);
});

// ───────────────────────────────────────────────────────────────
// 4. 복선 차집합 — 미회수 추적 정확성 + 오판 방지
// ───────────────────────────────────────────────────────────────
test("Foreshadowing: 회수된 복선은 제거되고 미회수만 남는다", () => {
  const opened = ["용의 비늘의 비밀", "왕의 진짜 정체", "주인공의 출생의 비밀"];
  const resolved = ["용의 비늘이 사실 봉인구였음이 밝혀진다"];
  const open = unresolvedThreads(opened, resolved);
  assert.ok(!open.includes("용의 비늘의 비밀"), "회수된 복선이 남음(어간 매칭 실패)");
  assert.ok(open.includes("왕의 진짜 정체"));
  assert.ok(open.includes("주인공의 출생의 비밀"));
});

test("Foreshadowing: 막연한 회수 서술이 구체적 복선을 오판 회수하지 않는다", () => {
  // 종래 substring 매칭의 치명적 오판: 'AI'가 'AI의 정체'를 회수처리.
  const open = unresolvedThreads(["AI의 정체", "AI의 최종 목적"], ["AI"]);
  assert.ok(open.includes("AI의 정체"), "막연한 'AI'가 구체적 복선을 오판 회수함");
  assert.ok(open.includes("AI의 최종 목적"));
});

test("Foreshadowing: 회수 서술이 복선 전체를 포함하면 빠른 경로로 회수 처리된다", () => {
  const open = unresolvedThreads(["검은 상자"], ["마침내 검은 상자가 열렸다"]);
  assert.equal(open.length, 0);
});

test("Foreshadowing: 중복 복선은 한 번만 집계되고 등장 순서를 유지한다", () => {
  const open = unresolvedThreads(
    ["첫 번째 떡밥", "두 번째 떡밥", "첫 번째 떡밥"],
    [],
  );
  assert.deepEqual(open, ["첫 번째 떡밥", "두 번째 떡밥"]);
});

test("Foreshadowing: cap 옵션이 미회수 목록을 상한으로 자른다", () => {
  const opened = Array.from({ length: 20 }, (_, i) => `복선 ${i + 1} 고유내용`);
  const open = unresolvedThreads(opened, [], { cap: 12 });
  assert.equal(open.length, 12);
});

// ───────────────────────────────────────────────────────────────
// 통합: storySoFar가 미회수 복선을 다음 회차 프롬프트에 실제로 노출하는가
// ───────────────────────────────────────────────────────────────
test("Integration: 롤링 메모리가 미회수 복선을 '지금까지의 이야기'에 주입한다", () => {
  const memories = {
    1: { synopsis: "사건 시작", threadsOpened: ["봉인된 7번째 문"], threadsResolved: [] },
    2: { synopsis: "전개", threadsOpened: ["스승의 죽음의 진실"], threadsResolved: [] },
  };
  const block = composeStorySoFar(memories);
  assert.match(block, /회수되지 않은 떡밥/);
  assert.ok(block.includes("봉인된 7번째 문"));
  assert.ok(block.includes("스승의 죽음의 진실"));
});
