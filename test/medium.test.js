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
const { designElements, recommendedDesignSpec, buildDesignSpecBlock } = require("../lib/design-spec");
const {
  ONESHEET_KEYS, buildOneSheetLockBlock, localOneSheet, parseOneSheet,
  INTEGRITY_DIMS, INTEGRITY_GATES, gateOf, localIntegrity, buildContePrompt, buildIntegrityPrompt,
} = require("../lib/onesheet");
const { buildInputBlock } = require("../lib/agents");
const {
  buildAiFilmDoctrineBlock, FESTIVALS, parseTechMap, localTechMap,
  parseFestival, localFestival, buildVideoPromptPrompt, buildFormConvertPrompt, buildFestivalPrompt,
} = require("../lib/aifilm");

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

/* ───────────────── 상세 설계 블루프린트 (design-spec) ───────────────── */

test("⑰ 매체별 상세 설계 요소가 옵션·포맷별 추천을 갖춘다", () => {
  for (const m of [...STUDIO_MEDIUMS, "webnovel"]) {
    const els = designElements(m);
    assert.ok(els.length >= 6, `${m}: 설계 요소 6개 미만`);
    for (const e of els) {
      assert.ok(e.key && e.label, `${m}: key/label 누락`);
      assert.ok(Array.isArray(e.options) && e.options.length >= 2, `${m}.${e.key}: 선택지 부족`);
      assert.ok(e.recommend && e.recommend.short && e.recommend.medium && e.recommend.long, `${m}.${e.key}: 포맷별 추천 누락`);
    }
  }
  // 핵심 노브(러닝타임·핵심 오브젝트류)가 영화에 존재한다.
  assert.ok(designElements("film").some((e) => /러닝타임/.test(e.label)), "영화에 러닝타임 요소 없음");
});

test("⑱ recommendedDesignSpec은 포맷에 따라 다른 값을, buildDesignSpecBlock은 확정값을 주입한다", () => {
  for (const m of STUDIO_MEDIUMS) {
    const s = recommendedDesignSpec(m, "short");
    const l = recommendedDesignSpec(m, "long");
    const keys = designElements(m).map((e) => e.key);
    for (const k of keys) assert.ok(k in s, `${m}.${k}: 추천 누락`);
    // 단편·장편 추천이 최소 한 요소에서 달라야 한다.
    assert.ok(keys.some((k) => s[k] !== l[k]), `${m}: 포맷별 추천이 전부 동일`);
    // 주입 블록은 확정값을 싣는다.
    const block = buildDesignSpecBlock({ medium: m, designSpec: s });
    assert.ok(block.includes("상세 설계 요소") && block.includes(designElements(m)[0].label), `${m}: 설계 블록 주입 누락`);
  }
  // designSpec이 없으면 빈 블록.
  assert.equal(buildDesignSpecBlock({ medium: "film" }), "", "designSpec 없을 때 빈 블록이어야");
});

/* ───────────────── 감독 원시트 (Director One-Sheet) ───────────────── */

test("⑲ 원시트는 12블록이고, 폴백/파서가 정상이며, LOCK 블록이 금지·감수성을 싣는다", () => {
  assert.equal(ONESHEET_KEYS.length, 12, "원시트 12블록 아님");
  const sheet = localOneSheet({ input: { ipTitle: "릴리", protagonist: "기록관", coreObject: "젖은 인형" }, medium: "film", genre: "thriller", format: "short" });
  const filled = ONESHEET_KEYS.filter((k) => String(sheet[k] || "").trim()).length;
  assert.ok(filled >= 10, `폴백 원시트 채움 부족(${filled})`);
  const lock = buildOneSheetLockBlock(sheet, "film");
  assert.ok(lock.includes("감독 원시트 LOCK") && lock.includes("금지 규칙") && lock.includes("감수성 원칙"), "LOCK 블록 누락");
  assert.equal(buildOneSheetLockBlock(null, "film"), "", "원시트 없으면 빈 LOCK");
  // 파서
  const parsed = parseOneSheet('{"corePremise":"a","moralQuestion":"b","emotionalWound":"c","centralObject":"d","characterEngine":"e","worldTexture":"f","visualGrammar":"g","soundGrammar":"h","beatStructure":"i","continuityBible":"j","forbiddenDrift":"k","evaluationRubric":"l"}');
  assert.ok(parsed && parsed.centralObject === "d", "파서 실패");
});

test("⑳ LOCK은 전 장르(agents) + 전 매체(media-studios) 입력 블록에 주입된다", () => {
  const sheet = localOneSheet({ input: { ipTitle: "T", coreObject: "인형" }, medium: "film", genre: "thriller", format: "short" });
  // 전 장르(웹소설 제작 파이프라인)
  const wb = buildInputBlock({ genre: "romanceFantasy", oneSheet: sheet, ipTitle: "T" });
  assert.ok(wb.includes("감독 원시트 LOCK"), "agents(전 장르)에 LOCK 미주입");
  // 전 매체
  for (const m of STUDIO_MEDIUMS) {
    const mb = buildMediaInputBlock({ medium: m, format: "short", oneSheet: sheet, ipTitle: "T" });
    assert.ok(mb.includes("감독 원시트 LOCK"), `${m}에 LOCK 미주입`);
  }
  // oneSheet 없으면 미주입.
  assert.ok(!buildInputBlock({ genre: "thriller", ipTitle: "T" }).includes("감독 원시트 LOCK"), "원시트 없는데 LOCK 주입됨");
});

test("㉑ 서사 무결성: 6축 합 100 · 게이트 로직 · 폴백 채점", () => {
  assert.equal(INTEGRITY_DIMS.reduce((a, [, w]) => a + w, 0), 100, "무결성 배점 합이 100이 아님");
  assert.equal(gateOf(90, "plan"), "통과");
  assert.equal(gateOf(82, "plan"), "재생성"); // 기획 게이트 85
  assert.equal(gateOf(82, "conte"), "통과");  // 콘티 게이트 80
  assert.equal(gateOf(65, "conte"), "구조 재작성");
  const ig = localIntegrity({}, "film", null, "젖은 인형이 다시 나타났다. 그래서 그는 자백했다. 빗방울이 구두에 떨어졌다. 마지막.");
  assert.ok(ig.overall >= 0 && ig.overall <= 100 && ig.gate && ig.fixes.length, "무결성 폴백 비정상");
  // 콘티 프롬프트는 6층 + 네거티브를 지시한다.
  const conte = buildContePrompt({ input: { ipTitle: "T" }, medium: "film", oneSheet: ig ? null : null, format: "short" });
  assert.ok(conte.system.includes("6층") && conte.system.includes("NEGATIVE"), "콘티 6층/네거티브 지시 누락");
  // 무결성 프롬프트에 원시트 LOCK이 채점 기준으로 들어간다.
  const sheet = localOneSheet({ input: { ipTitle: "T", coreObject: "인형" }, medium: "film", genre: "thriller", format: "short" });
  assert.ok(buildIntegrityPrompt({ input: {}, medium: "film", oneSheet: sheet, digest: "x" }).system.includes("감독 원시트 LOCK"), "무결성 기준에 LOCK 누락");
});

/* ───────────────── AI 영상 제작 융합 (aifilm) ───────────────── */

test("㉒ AI 영상 모드: 켜짐/꺼짐 주입 · 매체별 독트린 · 전 매체 적용", () => {
  // 토글 OFF면 미주입.
  assert.equal(buildAiFilmDoctrineBlock({ medium: "film" }), "", "토글 OFF인데 주입됨");
  // 시각 매체는 풀 독트린(영어 영상 프롬프트 포함).
  for (const m of STUDIO_MEDIUMS) {
    const b = buildAiFilmDoctrineBlock({ medium: m, aiFilmMode: true });
    assert.ok(b.includes("AI 영상 제작 융합") && b.includes("AI 비디오 생성 프롬프트"), `${m}: 풀 독트린 누락`);
  }
  // 텍스트 매체(웹소설)는 영상화 대비 라이트 노트.
  const wb = buildAiFilmDoctrineBlock({ medium: "webnovel", aiFilmMode: true });
  assert.ok(wb.includes("AI 영상화 대비") && !wb.includes("AI 비디오 생성 프롬프트"), "웹소설 라이트 노트 아님");
});

test("㉓ Tech-Map / Festival / 영상프롬프트 / 폼변환 빌더·폴백 정상", () => {
  // 폴백
  const tm = localTechMap({ input: { logline: "x" }, medium: "film" });
  assert.ok(tm.hardElements.length && tm.aiStrengths.length && tm.rewriteSuggestion, "techmap 폴백 비정상");
  // 파서
  const tmp = parseTechMap('{"hardElements":[{"element":"립싱크","why":"a","workaround":"독백"}],"aiStrengths":[{"strength":"모핑","narrativeUse":"기억"}],"rewriteSuggestion":"r"}');
  assert.equal(tmp.hardElements[0].workaround, "독백");
  // 영화제
  assert.ok(Object.keys(FESTIVALS).length >= 4, "영화제 데이터 부족");
  const fl = localFestival({ input: {}, festival: "runwayAIFF" });
  assert.ok(fl.artistryIndex >= 0 && fl.originalityIndex >= 0 && fl.fixes.length, "festival 폴백 비정상");
  const fp = parseFestival('{"artistryIndex":80,"originalityIndex":70,"juryReview":"r","fixes":["a"],"festivalFit":[{"festival":"X","fit":80,"why":"y"}]}');
  assert.equal(fp.artistryIndex, 80);
  assert.ok(buildFestivalPrompt({ input: {}, medium: "film", digest: "d", festival: "siaiff" }).system.includes("심사위원"), "영화제 프롬프트 누락");
  // 영상 프롬프트: 영어 + --ar + 카메라 지시.
  const vp = buildVideoPromptPrompt({ input: { ipTitle: "T" }, medium: "film", digest: "씬", format: "short" });
  assert.ok(vp.system.includes("--ar 16:9") && vp.system.includes("camera movement"), "영상 프롬프트 규칙 누락");
  // 폼 변환: 소설→시나리오 / 시나리오→소설.
  assert.ok(buildFormConvertPrompt({ text: "산문", from: "novel", to: "script" }).system.includes("시나리오"), "novel→script 누락");
  assert.ok(buildFormConvertPrompt({ text: "S1.", from: "script", to: "novel" }).system.includes("소설"), "script→novel 누락");
});

/* ───────────────── AI 애니메이션 영화제 수상 (aianimation) ───────────────── */

test("㉔ AI 애니 콘티는 컷마다 '콘티 + 생성 프롬프트'를 페어로 강제하고 모델 최적화한다", () => {
  const an = require("../lib/aianimation");
  assert.ok(an.MODEL_KEYS.length >= 5, "AI 영상 모델 5종 미만");
  for (const mk of an.MODEL_KEYS) {
    const c = an.buildVisualContePrompt({ input: { ipTitle: "T" }, medium: "animation", oneSheet: { centralObject: "인형" }, format: "short", targetModel: mk });
    assert.ok(c.system.includes("콘티만 주는 것은 금지"), `${mk}: 콘티-only 금지 누락`);
    assert.ok(c.system.includes("생성 프롬프트") && c.system.includes("Negative") && c.system.includes("Elements"), `${mk}: 컷 페어 필드 누락`);
    assert.ok(c.system.includes(an.AI_VIDEO_MODELS[mk].label), `${mk}: 모델 최적화 누락`);
    assert.ok(c.system.includes("--ar 16:9"), `${mk}: 화면비 누락`);
  }
  // 로컬 폴백도 컷 페어.
  const lc = an.localVisualConte({ input: {}, medium: "animation", oneSheet: { centralObject: "인형" }, format: "short", targetModel: "sora" });
  assert.ok(lc.includes("생성 프롬프트 (Sora)") && lc.includes("Negative") && lc.includes("Elements"), "로컬 컷 페어 누락");
});

test("㉕ 애니 영화제 수상 하네스: 애니는 항상 주입, 영화는 AI영상모드일 때만", () => {
  const an = require("../lib/aianimation");
  // 애니메이션은 모드 없이도 하네스.
  assert.ok(an.buildAiAnimFestivalBlock({ medium: "animation" }).includes("마술적 리얼리즘"), "애니 하네스 미주입");
  assert.ok(buildMediaInputBlock({ medium: "animation", format: "short", ipTitle: "T" }).includes("영화제 수상 하네스"), "애니 파이프라인 하네스 미주입");
  // 영화는 aiFilmMode 꺼지면 미주입, 켜지면 주입.
  assert.equal(an.buildAiAnimFestivalBlock({ medium: "film" }), "", "영화 하네스가 모드 없이 주입됨");
  assert.ok(an.buildAiAnimFestivalBlock({ medium: "film", aiFilmMode: true }).includes("마술적 리얼리즘"), "영화 AI모드 하네스 미주입");
});

test("㉖ 그림풍 추천: 작품 정서에 맞춰 서로 다른 화풍 A/B/C + 스타일별 프롬프트 블록", () => {
  const as = require("../lib/artstyle");
  assert.ok(as.ART_STYLES.length >= 6, "그림풍 카탈로그 부족");
  for (const s of as.ART_STYLES) {
    assert.ok(s.key && s.label && s.promptCore && s.shortTag, `${s.key}: 필드 누락`);
    assert.ok(Array.isArray(s.fitThemes) && s.fitThemes.length, `${s.key}: fitThemes 없음`);
    assert.ok(Array.isArray(s.avoid) && s.avoid.length, `${s.key}: avoid 없음`);
  }
  // 추천은 3개, 가능한 한 서로 다른 화풍 군.
  const recs = as.recommendStyles({ theme: "기억과 상실, 노년의 고독", tone: "잔잔", designSpec: { message: "상실" } }, { centralObject: "흑백사진" });
  assert.equal(recs.length, 3, "추천 3개 아님");
  const fams = new Set(recs.map((r) => r.family));
  assert.ok(fams.size >= 2, "A/B/C 화풍 군이 다양하지 않음");
  // 정서가 다르면 추천도 달라진다.
  const horror = as.recommendStyles({ theme: "민속 호러, 불안, 악몽", genre: "호러" });
  assert.notDeepEqual(recs.map((r) => r.key), horror.map((r) => r.key), "정서가 달라도 추천이 동일");
  // 폴백 A/B/C 블록은 공통 베이스 + 스타일별 프롬프트 + --ar.
  const lc = as.localArtStyle({ input: { ipTitle: "T", protagonist: "노인" }, oneSheet: { centralObject: "사진" }, format: "short", targetModel: "kling" });
  assert.ok(lc.includes("# 0. 공통 베이스") && lc.includes("--ar 16:9") && lc.includes("짧은 스타일 태그") && /[ABC]안/.test(lc), "폴백 A/B/C 블록 누락");
  // 빌더는 추천 3스타일을 system에 싣고 공통 베이스를 유지한다.
  const bp = as.buildArtStylePrompt({ input: { ipTitle: "The Fading Line", protagonist: "사진작가" }, oneSheet: { centralObject: "흑백사진" }, format: "short", targetModel: "runway" });
  assert.ok(bp.system.includes("공통 베이스") && bp.recommended.length === 3, "그림풍 빌더 비정상");
});

test("㉗ 캐릭터 시트 고정: LOCK 토큰·시트·네거티브·모델 고정법 + 콘티/그림풍 주입", () => {
  const cs = require("../lib/charactersheet");
  const an = require("../lib/aianimation");
  const as = require("../lib/artstyle");
  // 폴백 산출
  const lc = cs.localCharSheet({ input: { protagonist: "노인" }, oneSheet: { continuityBible: "어두운 코트" }, targetModel: "kling" });
  assert.ok(lc.lockToken && lc.sheetPrompt && lc.expressionSheet && lc.negative && lc.modelMethod, "캐릭터 시트 필드 누락");
  assert.ok(lc.negative.includes("morphing") || lc.negative.includes("inconsistent"), "일관성 네거티브 누락");
  assert.ok(Array.isArray(lc.methods) && lc.methods.length, "고정법 목록 누락");
  // 파서
  const parsed = cs.parseCharSheet('{"lockToken":"X consistent character","sheetPrompt":"sheet","negative":"n"}');
  assert.equal(parsed.lockToken, "X consistent character");
  assert.equal(cs.parseCharSheet('{"sheetPrompt":"no token"}'), null); // lockToken 없으면 무효
  // 모델별 고정법 존재(5종)
  assert.ok(Object.keys(cs.CONSISTENCY_METHODS).length >= 5, "모델별 고정법 부족");
  // LOCK 블록은 토큰 있을 때만.
  assert.ok(cs.buildCharLockBlock("tok").includes("CHARACTER LOCK") && cs.buildCharLockBlock("tok").includes("한 글자도 바꾸지"), "LOCK 블록 누락");
  assert.equal(cs.buildCharLockBlock(""), "", "토큰 없으면 빈 블록");
  // 콘티·그림풍 프롬프트에 주입.
  assert.ok(an.buildVisualContePrompt({ input: { characterLock: "TOK" }, medium: "animation", oneSheet: {}, format: "short" }).system.includes("CHARACTER LOCK"), "콘티 주입 누락");
  assert.ok(!an.buildVisualContePrompt({ input: {}, medium: "animation", oneSheet: {}, format: "short" }).system.includes("CHARACTER LOCK"), "토큰 없는데 주입됨");
  assert.ok(as.buildArtStylePrompt({ input: { characterLock: "TOK" }, oneSheet: {}, format: "short" }).system.includes("CHARACTER LOCK"), "그림풍 주입 누락");
});

test("㉘ 매체별 입력: 다큐·광고는 웹소설 장르/플레이북을 쓰지 않고, 서사 매체는 장르 정서를 참고한다", () => {
  for (const m of ["documentary", "advertising"]) {
    const b = buildMediaInputBlock({ medium: m, format: "medium", genre: "romanceFantasy", ipTitle: "T" });
    assert.ok(!b.includes("로맨스판타지"), `${m}: 웹소설 장르 라벨이 남음`);
    assert.ok(!b.includes("흥행 성공문법") && !b.includes("초반 5화 공식"), `${m}: 웹소설 플레이북이 주입됨`);
  }
  // 영화/드라마/애니는 장르를 '정서 참고'로 주입.
  const film = buildMediaInputBlock({ medium: "film", format: "long", genre: "thriller", ipTitle: "T" });
  assert.ok(film.includes("장르 정서(참고)"), "영화에 장르 정서 참고 누락");
});

test("㉙ AI 클립 콘티: 5~15초 클립 단위 + 길이 명시 + 피드백 보완(reviseNotes) 루프백", () => {
  const an = require("../lib/aianimation");
  const c = an.buildVisualContePrompt({ input: { ipTitle: "T" }, medium: "animation", oneSheet: {}, format: "short", targetModel: "kling" });
  assert.ok(c.system.includes("5~15초") && c.system.includes("클립당 초수"), "클립 단위 규칙 누락");
  assert.ok(c.system.includes("길이") && c.system.includes("Clip 01"), "클립 길이 필드 누락");
  // reviseNotes가 있으면 보완 지시 주입, 없으면 미주입.
  const cr = an.buildVisualContePrompt({ input: { ipTitle: "T" }, medium: "animation", oneSheet: {}, format: "short", targetModel: "kling", reviseNotes: "엔딩 임팩트 약함" });
  assert.ok(cr.system.includes("피드백 보완 지시") && cr.system.includes("엔딩 임팩트 약함"), "루프백 보완 지시 미주입");
  assert.ok(!c.system.includes("피드백 보완 지시"), "reviseNotes 없는데 보완 지시 주입됨");
  // 로컬 폴백도 클립 단위.
  const lc = an.localVisualConte({ input: {}, medium: "animation", oneSheet: {}, format: "short", targetModel: "kling" });
  assert.ok(lc.includes("5~15초") && lc.includes("Clip 01") && lc.includes("길이"), "로컬 클립 형식 누락");
});
