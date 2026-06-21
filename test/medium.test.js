"use strict";

/**
 * 매체별 전용 파이프라인 검증 (Per-Medium Studios)
 * ─────────────────────────────────────────────────
 * 웹소설 외 5개 매체(애니/영화/다큐/드라마/광고)가:
 *   - 매체×포맷별 구조 타깃·성공방정식·연출(감동요소+연출값)을 빠짐없이 갖고,
 *   - 각각 전용 파이프라인(≥4 에이전트, 정확히 1개의 ★연출 설계)으로 해석되며,
 *   - 포맷이 구조 규모를 스케일하고,
 *   - 무LLM 폴백이 에이전트를 하나도 누락하지 않는지
 * 를 코드 불변식으로 증명한다.
 *
 * 실행:  npm test
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MEDIA, MEDIUM_LABELS, FORMAT_LABELS, MEDIUM_KEYS, FORMAT_KEYS,
  mediumSuccessEquation, mediumStructureTarget, buildMediumBlock, mediumDirectingBlock,
} = require("../lib/medium");
const { MEDIA_AGENTS, MEDIA_PIPELINE_IDS } = require("../lib/media-studios");
const { buildMediaLocalReport } = require("../lib/media-local");
const { pipelineAgents } = require("../lib/orchestrator");
const {
  recommendedMediaSteering, directorPresets, directorPresetBlock,
  buildMediaCritiquePrompt, parseMediaCritique, localMediaCritique,
  buildMediaAuditPrompt, localMediaAudit, buildConvertPrompt, localMediaImpact,
} = require("../lib/media-features");
const {
  HIT_RUBRICS, hitRubric, guaranteeTargetBlock, scoreGuarantee,
  buildGuaranteePrompt, parseGuarantee, localGuarantee, guaranteeReviseNote, buildUpgradeBrief,
} = require("../lib/media-guarantee");
const { buildMediaInputBlock } = require("../lib/media-studios");

// 전용 파이프라인을 갖는 신규 매체(웹소설은 기존 production 파이프라인 사용).
const STUDIO_MEDIUMS = MEDIA_PIPELINE_IDS; // film, animation, documentary, drama, advertising

test("① 매체 6종·포맷 3종 라벨이 정의돼 있다", () => {
  assert.equal(Object.keys(MEDIUM_LABELS).length, 6, "매체 라벨 6종이 아님");
  assert.equal(Object.keys(FORMAT_LABELS).length, 3, "포맷 라벨 3종이 아님");
  for (const k of ["webnovel", "animation", "film", "documentary", "drama", "advertising"]) {
    assert.ok(MEDIUM_LABELS[k], `매체 라벨 누락: ${k}`);
  }
});

test("② 모든 매체×포맷이 구조 타깃 {unit,count>0,runtime,actModel}을 갖는다", () => {
  for (const m of MEDIUM_KEYS) {
    for (const f of FORMAT_KEYS) {
      const t = mediumStructureTarget(m, f);
      assert.ok(t && typeof t === "object", `${m}.${f}: 구조 타깃 없음`);
      assert.ok(t.unit && typeof t.unit === "string", `${m}.${f}: unit 없음`);
      assert.ok(Number.isInteger(t.count) && t.count > 0, `${m}.${f}: count 비정상 ${t.count}`);
      assert.ok(t.runtime && t.actModel, `${m}.${f}: runtime/actModel 누락`);
    }
  }
});

test("③ 모든 매체가 성공 방정식 + 연출(감동요소·연출값 차원)을 갖는다", () => {
  for (const m of MEDIUM_KEYS) {
    assert.ok(mediumSuccessEquation(m).length > 0, `${m}: 성공 방정식 비어 있음`);
    const d = MEDIA[m].directing;
    assert.ok(Array.isArray(d.emotionBeats) && d.emotionBeats.length > 0, `${m}: 감동요소(emotionBeats) 없음`);
    assert.ok(Array.isArray(d.dimensions) && d.dimensions.length > 0, `${m}: 연출값 차원(dimensions) 없음`);
  }
});

test("④ 신규 매체는 각각 전용 파이프라인(≥4 에이전트, 정확히 1개의 ★연출)을 갖는다", () => {
  for (const m of STUDIO_MEDIUMS) {
    const agents = pipelineAgents(m);
    assert.ok(Array.isArray(agents) && agents.length >= 4, `${m}: 에이전트 4개 미만`);
    const directions = agents.filter((a) => a.tabs && a.tabs[0] === "direction");
    assert.equal(directions.length, 1, `${m}: ★연출 설계 에이전트가 정확히 1개가 아님 (${directions.length})`);
    // 각 에이전트는 단일 탭 + buildUser 함수를 갖는다(start-이벤트 탭 렌더 전제).
    for (const a of agents) {
      assert.ok(Array.isArray(a.tabs) && a.tabs.length === 1, `${m}.${a.id}: 단일 탭이 아님`);
      assert.equal(typeof a.buildUser, "function", `${m}.${a.id}: buildUser 없음`);
    }
  }
});

test("⑤ 포맷이 구조를 의미있게 스케일한다(세 포맷이 서로 구별된다)", () => {
  // 단편/중편/장편은 서로 구별되는 구조 타깃을 가져야 한다.
  // 단위가 같으면 count가 단조 증가하고, 단위가 달라지면(예: 다큐 장편 시퀀스→부) 더 굵은 구조다.
  for (const m of MEDIUM_KEYS) {
    const s = mediumStructureTarget(m, "short");
    const md = mediumStructureTarget(m, "medium");
    const l = mediumStructureTarget(m, "long");
    const key = (t) => `${t.unit}:${t.count}`;
    const distinct = new Set([key(s), key(md), key(l)]);
    assert.equal(distinct.size, 3, `${m}: 세 포맷의 구조 타깃이 서로 구별되지 않음`);
    if (s.unit === l.unit) {
      assert.ok(s.count < l.count, `${m}: 동일 단위에서 단편(${s.count}) < 장편(${l.count}) 위반`);
    }
  }
});

test("⑥ buildMediumBlock이 성공 방정식 + 연출값 차원을 프롬프트에 주입한다", () => {
  for (const m of MEDIUM_KEYS) {
    const block = buildMediumBlock(m, "medium");
    assert.ok(block.includes(mediumSuccessEquation(m)), `${m}: 블록에 성공 방정식 누락`);
    const firstDim = MEDIA[m].directing.dimensions[0];
    assert.ok(block.includes(firstDim), `${m}: 블록에 연출값 차원 누락`);
    // 연출 블록은 파트별 감동 설계를 포함한다.
    assert.ok(mediumDirectingBlock(m).includes("끌어낼 감정"), `${m}: 연출 블록에 감동 설계 누락`);
  }
});

test("⑦ 무LLM 폴백 리포트의 에이전트 id 집합이 파이프라인과 정확히 일치한다", () => {
  const input = { ipTitle: "테스트", logline: "한 줄 콘셉트", format: "long" };
  for (const m of STUDIO_MEDIUMS) {
    const report = buildMediaLocalReport(m, input);
    const reportIds = Object.keys(report.agents).sort().join(",");
    const pipelineIds = pipelineAgents(m).map((a) => a.id).sort().join(",");
    assert.equal(reportIds, pipelineIds, `${m}: 폴백 id 집합 불일치(스트리밍 누락 위험)`);
    // 모든 폴백 에이전트는 비어 있지 않은 텍스트를 갖는다.
    for (const a of Object.values(report.agents)) {
      assert.ok(a.text && a.text.trim().length > 0, `${m}.${a.id}: 폴백 텍스트 비어 있음`);
    }
  }
});

test("⑧ MEDIA_AGENTS와 pipelineAgents가 동일한 세트를 반환한다", () => {
  for (const m of STUDIO_MEDIUMS) {
    assert.deepEqual(pipelineAgents(m), MEDIA_AGENTS[m], `${m}: 오케스트레이터 해석 불일치`);
  }
});

/* ───────────────── 매체 부가 기능 (media-features) ───────────────── */

test("⑨ 매체 권장 스티어링은 8축·0~100·비중립이다", () => {
  for (const m of MEDIUM_KEYS) {
    const w = recommendedMediaSteering(m);
    assert.equal(Object.keys(w).length, 8, `${m}: 8축 아님`);
    for (const v of Object.values(w)) assert.ok(Number.isInteger(v) && v >= 0 && v <= 100, `${m}: 범위 이탈 ${v}`);
    // 매체 고유 의도가 깔리는가(전부 50이 아니어야 함).
    assert.ok(Object.values(w).some((v) => Math.abs(v - 50) >= 12), `${m}: 권장값이 중립`);
  }
  // 광고는 속도(pacing) 최상, 다큐는 사이다(dopamine) 최하.
  assert.ok(recommendedMediaSteering("advertising").pacing >= 85, "광고 속도 약함");
  assert.ok(recommendedMediaSteering("documentary").dopamine <= 40, "다큐 사이다 과함");
});

test("⑩ 각 매체(영상)는 감독 프리셋을 갖고, 프리셋 주입 블록이 톤을 싣는다", () => {
  for (const m of STUDIO_MEDIUMS) {
    const presets = directorPresets(m);
    assert.ok(presets.length >= 3, `${m}: 감독 프리셋 부족`);
    const [key] = presets[0];
    const block = directorPresetBlock(m, key);
    assert.ok(block.includes("연출 톤 구속") && block.includes(presets[0][1]), `${m}: 프리셋 주입 누락`);
  }
  assert.equal(directorPresetBlock("film", "없는키"), "", "없는 프리셋은 빈 블록");
});

test("⑪ 매체 자가비평: 프롬프트에 성공방정식 + 파싱/폴백 정상", () => {
  for (const m of STUDIO_MEDIUMS) {
    const { system } = buildMediaCritiquePrompt({ input: {}, medium: m, format: "long", targetName: "연출 설계", text: "테스트" });
    assert.ok(system.includes(mediumSuccessEquation(m)), `${m}: 비평 프롬프트에 성공방정식 누락`);
    const local = localMediaCritique({}, m, "long", "## 표\n| 파트 | 감동 |\n색·카메라·음악 연출 카타르시스");
    assert.ok(local.overall >= 0 && local.overall <= 100, `${m}: 폴백 점수 비정상`);
    assert.ok(Array.isArray(local.fixes) && local.fixes.length, `${m}: 폴백 개선지시 없음`);
  }
  // 파서: 유효 JSON을 정규화한다.
  const parsed = parseMediaCritique('{"overall":88,"equationFit":90,"scores":{"콘셉트":8},"fixes":["x"]}');
  assert.equal(parsed.overall, 88);
  assert.equal(parsed.scores.연출구체성, 0); // 누락 축은 0
});

test("⑫ 매체 심사·변환: 프롬프트/폴백이 매체 타깃을 반영한다", () => {
  const auditP = buildMediaAuditPrompt({ input: { ipTitle: "T" }, medium: "drama", format: "medium", digest: "발췌" });
  assert.ok(auditP.system.includes(mediumSuccessEquation("drama")), "심사 프롬프트에 성공방정식 누락");
  const localA = localMediaAudit({}, "film", "long", "x");
  assert.ok(localA.overall >= 0 && localA.dimensions && localA.revisionPlan.length, "심사 폴백 비정상");
  const conv = buildConvertPrompt({ input: { ipTitle: "T" }, fromMedium: "webnovel", toMedium: "film", format: "long", digest: "원작" });
  assert.ok(conv.system.includes("영화") && conv.system.includes("재기획"), "변환 프롬프트 타깃 매체 누락");
  const imp = localMediaImpact("아이디어", { ipTitle: "T" }, "animation", "medium");
  assert.ok(imp.before.score < imp.after.score, "임팩트 폴백 before<after 위반");
});

/* ───────────────── 흥행 보증 엔진 (media-guarantee) ───────────────── */

test("⑬ 모든 매체가 흥행 보증 루브릭(필수 승리 조건 + 높은 hitBar)을 갖는다", () => {
  for (const m of [...STUDIO_MEDIUMS, "webnovel"]) {
    const r = hitRubric(m);
    assert.ok(r.criteria.length >= 6, `${m}: 승리 조건 6개 미만`);
    assert.ok(r.criteria.some((c) => c.mustHave), `${m}: 필수 조건 없음`);
    assert.ok(r.hitBar.refined >= 88 && r.hitBar.refined > r.hitBar.first, `${m}: 보증 바가 낮거나 역전`);
    // 각 조건은 결정론 신호(정규식)를 갖는다.
    for (const c of r.criteria) assert.ok(c.signal instanceof RegExp, `${m}.${c.key}: signal 정규식 없음`);
  }
});

test("⑭ 흥행 보증 목표가 모든 매체 에이전트 입력 블록에 강제 주입된다", () => {
  for (const m of STUDIO_MEDIUMS) {
    const block = buildMediaInputBlock({ medium: m, format: "long", ipTitle: "T" });
    assert.ok(block.includes("흥행 보증 목표") && block.includes("[필수]"), `${m}: 보증 목표 미주입`);
    // guaranteeOff면 빠진다.
    const off = buildMediaInputBlock({ medium: m, format: "long", ipTitle: "T", guaranteeOff: true });
    assert.ok(!off.includes("흥행 보증 목표"), `${m}: guaranteeOff가 동작 안 함`);
  }
});

test("⑮ 보증 점수: 빈약 입력은 낮고(재설계), 승리조건 충족 텍스트는 높다", () => {
  for (const m of STUDIO_MEDIUMS) {
    const weak = scoreGuarantee("짧은 줄거리", m);
    assert.ok(weak.score < hitRubric(m).hitBar.first, `${m}: 빈약 입력이 흥행권 점수`);
    // 모든 조건 라벨을 나열한 텍스트는 신호를 다 맞춰 높은 점수.
    const fullText = hitRubric(m).criteria.map((c) => c.label).join(" ");
    const strong = scoreGuarantee(fullText, m);
    assert.ok(strong.score > weak.score, `${m}: 승리조건 텍스트가 더 높지 않음`);
    assert.ok(Array.isArray(strong.met) && Array.isArray(strong.missing), `${m}: met/missing 구조 누락`);
  }
});

test("⑯ 보증서: 미달 조건 → 보완 지시, 폴백/파서 정상, 업그레이드 프롬프트", () => {
  const sg = scoreGuarantee("간단", "film");
  const note = guaranteeReviseNote("film", sg);
  assert.ok(note.includes("목표 보증 점수") && note.length > 20, "보완 지시 비정상");
  const local = localGuarantee({ ipTitle: "T" }, "drama", "medium", "콜드오픈 클리프행어 미스터리 욕망");
  assert.ok(Number.isFinite(local.overall) && local.criteria && local.bar, "보증 폴백 비정상");
  const parsed = parseGuarantee('{"overall":91,"grade":"흥행 보증","criteria":{"ironicLogline":{"met":true,"score":90,"note":"x"}},"nextActions":["a"]}', "film");
  assert.equal(parsed.overall, 91);
  assert.equal(parsed.criteria.ironicLogline.met, true);
  const up = buildUpgradeBrief({ logline: "약함" }, "advertising", "short");
  assert.ok(up.system.includes("흥행 닥터") && up.system.includes("승리 조건"), "업그레이드 프롬프트 누락");
});
