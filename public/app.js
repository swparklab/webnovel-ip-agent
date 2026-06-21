"use strict";

/* ----------------------------- Static config ---------------------------- */

// 제작실(Production) — 작품을 생성하는 Narrative Intelligence 파이프라인.
const PRODUCTION_AGENTS = [
  { id: "foresight", name: "Foresight Agent", tab: "제작 브리프", sub: "작품 명제·장르 약속·제목" },
  { id: "world", name: "세계관 바이블", tab: "세계관 바이블", sub: "설정·장치·타임라인" },
  { id: "plot", name: "Plot Engine", tab: "시즌 설계", sub: "25화·초반 12화" },
  { id: "draft", name: "Draft Agent", tab: "원고", sub: "1화 오프닝·장면 카드" },
  { id: "reader", name: "Reader Sim", tab: "검수·독자", sub: "흥행 평가·리스크·반응" },
  { id: "osmu", name: "OSMU Agent", tab: "OSMU", sub: "웹툰·글로벌·팬·굿즈" },
];

// 운영실(Operations) — 플랫폼별 패키징·운영을 담당하는 Platform Intelligence 파이프라인.
const PLATFORM_AGENTS = [
  { id: "tagger", name: "자동 태깅기", tab: "태깅", sub: "6층 분류체계·리스크" },
  { id: "reaction", name: "반응 분석기", tab: "반응 분석", sub: "6축 좋아요/싫어요·신뢰도" },
  { id: "fit", name: "플랫폼 적합도", tab: "적합도", sub: "RR·Webnovel·한국 진입성" },
  { id: "packaging", name: "플랫폼 번역기", tab: "패키징", sub: "제목·블럽·태그·오버레이" },
  { id: "strategy", name: "전략 리포터", tab: "전략", sub: "성공식·KPI·주간 액션" },
];

// IP 사업실(Business) — 수익화·확장·투자를 담당하는 IP Business Intelligence 파이프라인.
const BUSINESS_AGENTS = [
  { id: "revenue", name: "수익 모델러", tab: "수익 모델", sub: "과금 구조·편성·매출 시나리오" },
  { id: "osmuRoad", name: "OSMU 로드맵", tab: "OSMU 로드맵", sub: "웹툰·드라마·게임 확장 단계" },
  { id: "rights", name: "권리·계약 가이드", tab: "권리·계약", sub: "2차 판권·계약 체크리스트" },
  { id: "valuation", name: "IP 가치 평가", tab: "IP 가치", sub: "5축 밸류에이션·등급" },
  { id: "pitch", name: "IP 피치덱", tab: "피치덱", sub: "투자/제작사용 1페이지" },
];

// foresight(AI미래학자 박성우) 모드는 제작 파이프라인을 재사용하되, SF 장르 기본 +
// 모든 에이전트에 'AI FORESIGHT 렌즈'를 주입하는 시그니처 모드다.
const STUDIOS = { production: PRODUCTION_AGENTS, platform: PLATFORM_AGENTS, foresight: PRODUCTION_AGENTS, business: BUSINESS_AGENTS };
// 현재 스튜디오의 에이전트 목록. 토글 시 교체된다(아래 렌더 함수들이 모두 참조).
let AGENTS = PRODUCTION_AGENTS;

// 스튜디오 → 실행 파이프라인. production·foresight는 제작 파이프라인 공유.
const STUDIO_PIPELINE = { production: "production", foresight: "production", platform: "platform", business: "business" };

// 스튜디오별 표시 메타.
const STUDIO_META = {
  production: { title: "웹소설 제작실", eyebrow: "Webnovel IP Production OS", brand: "전 장르 웹소설 에이전트", run: "에이전트 실행", status: "제작실", toast: "제작실로 전환했습니다." },
  platform: { title: "플랫폼 운영실", eyebrow: "Platform Intelligence OS", brand: "플랫폼 태깅·번역·전략 운영실", run: "운영 분석 실행", status: "운영실", toast: "운영실(Platform Intelligence)로 전환했습니다." },
  foresight: { title: "AI미래학자 박성우 · AI FORESIGHT", eyebrow: "AI Foresight SF Studio", brand: "AI미래학자 박성우의 미래예측 SF 스튜디오", run: "AI FORESIGHT 실행", status: "박성우 모드", toast: "AI미래학자 박성우 모드로 전환했습니다. 장르를 SF로 맞췄습니다." },
  business: { title: "IP 사업실", eyebrow: "IP Business / Monetization OS", brand: "수익화·OSMU·투자 IP 사업실", run: "사업 분석 실행", status: "사업실", toast: "IP 사업실로 전환했습니다. 현재 작품 IP로 수익·확장·투자 전략을 만듭니다." },
};

/* --------------------------- 매체(Medium) 전용 파이프라인 --------------------------- */
// 'production' 스튜디오 안에서 매체를 고르면 그 매체의 전용 파이프라인이 실행된다.
const MEDIUM_PIPELINE = {
  webnovel: "production", animation: "animation", film: "film",
  documentary: "documentary", drama: "drama", advertising: "advertising",
};

// 매체별 결과 탭(에이전트) — 백엔드 lib/media-studios.js 의 에이전트 id와 정확히 일치한다.
const MEDIUM_AGENTS = {
  animation: [
    { id: "animConcept", name: "기획", tab: "기획", sub: "콘셉트·타깃·성공방정식" },
    { id: "animWorld", name: "캐릭터·세계", tab: "캐릭터·세계", sub: "캐릭터 시트·세계관" },
    { id: "animEpisodes", name: "에피소드 구성", tab: "구성", sub: "화별 훅·아크" },
    { id: "animStoryboard", name: "콘티·1화 각본", tab: "콘티·각본", sub: "컷·레이아웃·음악" },
    { id: "animDirection", name: "연출표", tab: "연출 설계", sub: "작화·색·음악·연출 호흡" },
  ],
  film: [
    { id: "filmConcept", name: "로그라인·기획", tab: "기획", sub: "로그라인·톤·성공방정식" },
    { id: "treatment", name: "트리트먼트", tab: "트리트먼트", sub: "3막 산문 줄거리" },
    { id: "beatsheet", name: "비트시트", tab: "비트시트", sub: "시퀀스·미드포인트" },
    { id: "scene", name: "씬 대본", tab: "씬 대본", sub: "핵심 1씬 시나리오" },
    { id: "filmDirection", name: "연출 설계(감독노트)", tab: "연출 설계", sub: "미장센·촬영·색·편집·사운드" },
  ],
  documentary: [
    { id: "docTopic", name: "주제·논점", tab: "주제·논점", sub: "핵심 질문·관점" },
    { id: "docResearch", name: "리서치·팩트", tab: "리서치", sub: "팩트 시트·검증" },
    { id: "docStructure", name: "구성안", tab: "구성", sub: "감정 아크" },
    { id: "docInterview", name: "인터뷰·아카이브 설계", tab: "인터뷰·아카이브", sub: "질문·자료·현장" },
    { id: "docDirection", name: "내러티브·연출", tab: "연출 설계", sub: "내레이션·현장음·감정적 진실" },
  ],
  drama: [
    { id: "dramaConcept", name: "기획", tab: "기획", sub: "시즌 질문·톤·성공방정식" },
    { id: "dramaWorld", name: "세계·인물", tab: "세계·인물", sub: "욕망·관계도" },
    { id: "dramaSeason", name: "시즌 아크", tab: "시즌 설계", sub: "화별 훅·시즌 미스터리" },
    { id: "dramaScript", name: "1화 각본", tab: "1화 각본", sub: "콜드 오픈·핵심 씬" },
    { id: "dramaDirection", name: "연출 설계", tab: "연출 설계", sub: "미장센·색·편집·OST·엔딩" },
  ],
  advertising: [
    { id: "adInsight", name: "브랜드 인사이트", tab: "인사이트", sub: "과제·소비자 인사이트" },
    { id: "adBigIdea", name: "빅아이디어", tab: "빅아이디어", sub: "컨셉·태그라인" },
    { id: "adCampaign", name: "캠페인 시리즈 구성", tab: "캠페인", sub: "편수·시리즈·매체" },
    { id: "adStoryboard", name: "스토리보드·카피", tab: "스토리보드", sub: "컷·카피·CTA" },
    { id: "adDirection", name: "미디어 연출", tab: "연출 설계", sub: "3초 후크·비주얼·사운드로고·CTA" },
  ],
};

// 매체별 표시 메타(워크스페이스 제목·실행 버튼 라벨).
const MEDIUM_META = {
  webnovel: { title: "웹소설 제작실", run: "에이전트 실행" },
  animation: { title: "애니메이션 기획실", run: "애니메이션 기획 실행" },
  film: { title: "영화 기획실", run: "영화 기획 실행" },
  documentary: { title: "다큐멘터리 기획실", run: "다큐 기획 실행" },
  drama: { title: "드라마·OTT 기획실", run: "드라마 기획 실행" },
  advertising: { title: "광고 기획실", run: "광고 기획 실행" },
};

const MEDIUM_LABELS_KO = {
  webnovel: "웹소설", animation: "애니메이션", film: "영화",
  documentary: "다큐멘터리", drama: "드라마·OTT", advertising: "광고",
};

// 포맷(단편/중편/장편) 표시명 — 매체별로 라벨만 적응(값은 short|medium|long 고정).
const FORMAT_LABELS_BY_MEDIUM = {
  webnovel:    { short: "단편(≈25화)", medium: "중편(≈75화)", long: "장편(200화+)" },
  animation:   { short: "단편(OVA)", medium: "1쿨(12화)", long: "2쿨·시즌(24화)" },
  film:        { short: "단편영화", medium: "중편영화", long: "장편영화" },
  documentary: { short: "단편 다큐", medium: "중편 다큐", long: "시리즈 다큐" },
  drama:       { short: "미니시리즈(6부)", medium: "시즌제(12부)", long: "롱폼(16부+)" },
  advertising: { short: "단편 스팟(15~30초)", medium: "시리즈(3편)", long: "브랜드 캠페인" },
};

// 매체별 일부 필드 라벨 적응(웹소설은 원래 라벨 유지). 키는 span[data-label].
const MEDIUM_FIELD_LABELS = {
  film:        { seasonGoal: "작품 목표", protagonist: "주인공", centralConflict: "중심 갈등", manuscript: "시나리오 / 씬 메모" },
  animation:   { seasonGoal: "작품 목표", protagonist: "주인공", centralConflict: "중심 갈등", manuscript: "시나리오 / 설정 메모" },
  drama:       { seasonGoal: "시즌 목표", protagonist: "주인공", centralConflict: "중심 갈등", manuscript: "각본 / 씬 메모" },
  documentary: { seasonGoal: "취재 목표 / 핵심 질문", protagonist: "핵심 인물 / 취재원", centralConflict: "핵심 논쟁", manuscript: "취재 메모 / 인터뷰" },
  advertising: { seasonGoal: "캠페인 목표", protagonist: "브랜드 / 화자", centralConflict: "핵심 메시지", manuscript: "카피 / 스토리보드 메모" },
};
// 매체별 권장 보상/연출 스티어링 (백엔드 lib/media-features.js MEDIA_STEERING 미러).
const MEDIA_STEERING = {
  webnovel:    { world: 56, dopamine: 76, romance: 46, action: 64, mystery: 56, creativity: 52, pacing: 70, style: 62 },
  film:        { world: 64, dopamine: 50, romance: 52, action: 62, mystery: 64, creativity: 74, pacing: 56, style: 78 },
  animation:   { world: 70, dopamine: 64, romance: 54, action: 72, mystery: 56, creativity: 76, pacing: 64, style: 82 },
  documentary: { world: 72, dopamine: 34, romance: 40, action: 38, mystery: 70, creativity: 60, pacing: 48, style: 62 },
  drama:       { world: 58, dopamine: 66, romance: 72, action: 56, mystery: 74, creativity: 60, pacing: 64, style: 70 },
  advertising: { world: 38, dopamine: 80, romance: 50, action: 64, mystery: 40, creativity: 84, pacing: 90, style: 80 },
};

// 매체별 감독/연출 스타일 프리셋 (백엔드 DIRECTOR_PRESETS 미러: [key, label]).
const DIRECTOR_PRESETS = {
  film: [["humanDrama", "감정 휴먼드라마"], ["genreThriller", "스타일리시 장르 스릴러"], ["artMinimal", "미니멀 예술영화"], ["blockbuster", "블록버스터 스펙터클"]],
  animation: [["warmCel", "감성 셀 애니(따뜻한 정서)"], ["dynamicAction", "다이내믹 액션 작화"], ["popKitsch", "키치·팝 스타일"], ["theatricalDrama", "정통 극장판 드라마"]],
  documentary: [["observational", "관찰형(다이렉트 시네마)"], ["investigative", "내레이션 주도 탐사"], ["interviewMosaic", "인터뷰 모자이크"], ["poeticEssay", "시적·에세이 다큐"]],
  drama: [["bingeThriller", "몰아보기 스릴러"], ["melodrama", "감성 멜로"], ["noir", "텐션 누아르"], ["humanComedy", "휴먼 코미디"]],
  advertising: [["emotionalStory", "감성 스토리텔링"], ["humorViral", "유머·바이럴"], ["visualImpact", "임팩트 비주얼"], ["persuasive", "정보·설득형"]],
};

// 매체 제작 도구팩 ([tool, label]). 백엔드 MEDIA_TOOLS와 키 일치.
const MEDIA_TOOLPACK = [["logline", "로그라인"], ["tagline", "태그라인·카피"], ["charactersheet", "캐릭터 시트"], ["cuesheet", "음악 큐시트"], ["shotlist", "샷리스트·콘티"]];

// 감독 원시트 12블록(백엔드 onesheet.js ONESHEET_BLOCKS와 키 일치). [key, label, 텍스트매체 라벨?]
const ONESHEET_BLOCKS_KO = [
  ["corePremise", "1. Core Premise (핵심 전제)"],
  ["moralQuestion", "2. Moral Question (윤리적 질문)"],
  ["emotionalWound", "3. Emotional Wound (내면 결핍)"],
  ["centralObject", "4. Central Object (핵심 오브젝트)"],
  ["characterEngine", "5. Character Engine (캐릭터 엔진)"],
  ["worldTexture", "6. World Texture (세계 질감)"],
  ["visualGrammar", "7. Visual Grammar (시각 문법)", "7. 장면·문체 문법"],
  ["soundGrammar", "8. Sound Grammar (사운드 문법)", "8. 리듬·정서 문법"],
  ["beatStructure", "9. Beat Structure (비트 구조)"],
  ["continuityBible", "10. Continuity Bible (연속성 고정값)"],
  ["forbiddenDrift", "11. Forbidden Drift (금지 규칙)"],
  ["evaluationRubric", "12. Evaluation Rubric (검수 기준)"],
];
const VISUAL_MEDIA_KO = new Set(["animation", "film", "documentary", "drama", "advertising"]);

const _origFieldLabels = {}; // 매체 라벨 복원용(웹소설 원본 캡처)

// 현재 활성 매체(제작 스튜디오에서만 의미 있음; 그 외엔 웹소설로 간주).
function currentMedium() {
  if (state.studio !== "production") return "webnovel";
  const m = el("medium");
  return (m && MEDIUM_PIPELINE[m.value]) ? m.value : "webnovel";
}

// 스튜디오 + 매체에 맞는 에이전트(탭) 목록.
function activeAgentsFor(studio, medium) {
  if (studio === "production" && medium && medium !== "webnovel" && MEDIUM_AGENTS[medium]) {
    return MEDIUM_AGENTS[medium];
  }
  return STUDIOS[studio] || PRODUCTION_AGENTS;
}

// 매체에서 웹소설 영어 섹션 헤더를 중립 한글로 바꾼다(웹소설은 원본 유지).
const SECTION_LABELS_MEDIA = { secWorld: "세계·배경 설계", secCast: "인물·갈등", secNarr: "서사 설계", secTheme: "주제·차별점" };

// 매체별 필드 라벨 적용(제작 스튜디오에서만 호출). 웹소설은 원본 라벨로 복원.
function applyMediumLabels(medium) {
  const map = MEDIUM_FIELD_LABELS[medium] || {};
  ["seasonGoal", "protagonist", "centralConflict", "manuscript"].forEach((id) => {
    const span = document.querySelector(`span[data-label="${id}"]`);
    if (!span) return;
    if (!(id in _origFieldLabels)) _origFieldLabels[id] = span.textContent;
    span.textContent = map[id] || _origFieldLabels[id];
  });
  // 섹션 헤더(웹소설 영어 → 매체 중립 한글).
  Object.entries(SECTION_LABELS_MEDIA).forEach(([id, text]) => {
    const node = document.querySelector(`[data-label="${id}"]`);
    if (!node) return;
    if (!(id in _origFieldLabels)) _origFieldLabels[id] = node.textContent;
    node.textContent = (medium !== "webnovel") ? text : _origFieldLabels[id];
  });
}

// 포맷 옵션 라벨을 매체에 맞게 갱신(값은 고정).
function applyFormatLabels(medium) {
  const sel = el("format");
  if (!sel) return;
  const map = FORMAT_LABELS_BY_MEDIUM[medium] || FORMAT_LABELS_BY_MEDIUM.webnovel;
  Array.from(sel.options).forEach((o) => { if (map[o.value]) o.textContent = map[o.value]; });
}

// 매체별로 '웹소설 전용' 세부 입력 필드를 숨긴다. 그 매체의 세부 입력은 '상세 설계 요소'(매체별)가 담당한다.
//  - 서사 매체(영화/드라마/애니)는 인물·갈등·반전 등 서사 필드를 유지하고 웹소설 시스템 필드만 숨김.
//  - 다큐/광고는 픽션 세계관·인물 바이블 필드를 대거 숨김.
const MEDIUM_HIDE_FIELDS = {
  webnovel: [],
  animation: ["payoffPlan", "cadence"],
  film: ["powerSystem", "payoffPlan", "cadence"],
  drama: ["powerSystem", "payoffPlan", "cadence"],
  documentary: ["genre", "subgenre", "blendGenres", "futureYear", "cadence", "powerSystem", "factions", "worldHistory", "aiEntity", "desire", "antagonistLogic", "protagonistSecret", "supportingCast", "loveInterest", "worldRule", "coreMystery", "twistPlan", "payoffPlan", "contentRating", "scienceConstraint"],
  advertising: ["genre", "subgenre", "blendGenres", "futureYear", "cadence", "powerSystem", "factions", "worldHistory", "aiEntity", "desire", "antagonistLogic", "protagonistSecret", "supportingCast", "loveInterest", "worldRule", "coreMystery", "twistPlan", "payoffPlan", "contentRating", "scienceConstraint", "socialShift"],
};
const _ALL_HIDEABLE_FIELDS = [...new Set(Object.values(MEDIUM_HIDE_FIELDS).flat())];

// 매체별로 해당 없는 필드(연재 플랫폼·리듬·OSMU + 웹소설 전용 세부 필드)를 숨긴다.
function applyMediumVisibility(medium) {
  document.querySelectorAll("[data-medium-hide]").forEach((n) => {
    const list = (n.getAttribute("data-medium-hide") || "").split(",").map((s) => s.trim());
    n.hidden = list.includes(medium);
  });
  // 필드 단위: 먼저 모두 보이게 한 뒤, 이 매체에서 숨길 필드만 숨긴다.
  const hide = new Set(MEDIUM_HIDE_FIELDS[medium] || []);
  _ALL_HIDEABLE_FIELDS.forEach((id) => {
    const node = el(id);
    const field = node && node.closest && node.closest(".field, .switch");
    if (field) field.hidden = hide.has(id);
  });
  // 장르를 숨기는 매체(다큐·광고)에선 장르 관련 힌트도 함께 숨긴다.
  ["subgenreFormula", "blendGenresHint"].forEach((id) => { const n = el(id); if (n) n.hidden = hide.has("genre"); });
}

// 매체별 감독 스타일 드롭다운을 채운다(없는 매체면 행을 숨긴다).
function populateDirectorPresets(medium) {
  const sel = el("directorStyle");
  const row = el("directorRow");
  if (!sel) return;
  const presets = DIRECTOR_PRESETS[medium] || [];
  const want = sel.value;
  sel.innerHTML = `<option value="">자동 (지정 안 함)</option>` +
    presets.map(([k, label]) => `<option value="${k}">${label}</option>`).join("");
  // 복원: 이전 선택이 이 매체에 있으면 유지.
  if (presets.some(([k]) => k === want)) sel.value = want;
  if (row) row.hidden = presets.length === 0;
}

// 매체 선택 변경: 결과 탭·라벨·가시성·실행 버튼·감독프리셋·도구버튼을 그 매체에 맞게 재구성.
// applySteering=true(사용자가 직접 매체를 바꿈)면 그 매체 권장 보상/연출 가중치를 적용.
function onMediumChange(applySteering = false) {
  if (state.studio !== "production") return;
  const medium = currentMedium();
  AGENTS = activeAgentsFor("production", medium);
  AGENTS.forEach((a) => { if (!(a.id in state.statuses)) state.statuses[a.id] = "idle"; });
  applyMediumLabels(medium);
  applyFormatLabels(medium);
  applyMediumVisibility(medium);
  populateDirectorPresets(medium);
  // 매체 작업대 버튼·AI 영상 모델 선택기는 웹소설이 아닌 전용 파이프라인에서만 노출.
  if (el("mediaToolsBtn")) el("mediaToolsBtn").hidden = (medium === "webnovel");
  if (el("videoModelRow")) el("videoModelRow").hidden = (medium === "webnovel");
  // 상세 설계 요소 패널: 웹소설 외 매체에서 노출. 명시적 매체 변경이면 추천값 적용, 아니면 유지.
  const dsSection = el("designSpecSection");
  if (dsSection) {
    if (medium === "webnovel") { dsSection.hidden = true; }
    else { dsSection.hidden = false; loadDesignSpec(medium, el("format").value, applySteering ? "apply" : "keep"); }
  }
  // 사용자가 매체를 직접 바꾼 경우, 그 매체의 권장 보상/연출 가중치를 깐다(웹소설은 장르 권장값 유지).
  if (applySteering && medium !== "webnovel" && MEDIA_STEERING[medium]) {
    setSteering(MEDIA_STEERING[medium], false);
  }
  const runLabel = el("runAgent")?.querySelector("span:last-child");
  if (runLabel) runLabel.textContent = MEDIUM_META[medium].run;
  el("workspaceTitle").textContent = el("ipTitle").value || MEDIUM_META[medium].title;
  renderAgentGrid();
  renderTabs();
  setActiveTab(AGENTS[0].id);
  localStorage.setItem("sfAgentInput", JSON.stringify(collectInput()));
  if (typeof updateJourney === "function") updateJourney();
}

// 상세 설계 요소를 매체·포맷에 맞게 불러와 렌더한다.
// mode="apply": 추천값으로 채움 / "keep": 기존 값 유지(비었으면 추천값).
async function loadDesignSpec(medium, format, mode) {
  try {
    const res = await fetch(`/api/design-spec?medium=${encodeURIComponent(medium)}&format=${encodeURIComponent(format)}`);
    const data = await res.json();
    if (!data.ok) return;
    state.designElements = data.elements || [];
    state.designSpecMedium = medium;
    const empty = !state.designSpec || !Object.keys(state.designSpec).length;
    if (mode === "apply" || (mode === "keep" && empty)) {
      state.designSpec = { ...(data.recommend || {}) };
    }
    renderDesignSpec();
  } catch { /* 설계 요소 로드 실패는 치명적이지 않다 */ }
}

function renderDesignSpec() {
  const body = el("designSpecBody");
  if (!body) return;
  body.innerHTML = (state.designElements || []).map((e) => {
    const v = state.designSpec[e.key] || "";
    const opts = (e.options || []).map((o) => `<option value="${escapeHtml(o)}"></option>`).join("");
    return `<label class="field design-row">
      <span>${escapeHtml(e.label)}${e.hint ? ` <span class="ds-hint" title="${escapeHtml(e.hint)}">ⓘ</span>` : ""}</span>
      <input type="text" data-ds="${escapeHtml(e.key)}" list="dsopt_${escapeHtml(e.key)}" value="${escapeHtml(v)}" autocomplete="off" placeholder="추천값 또는 직접 입력" />
      <datalist id="dsopt_${escapeHtml(e.key)}">${opts}</datalist>
    </label>`;
  }).join("");
}

// 장르 패밀리에 따라 SF 전용 필드 라벨을 전환한다.
const FIELD_LABELS = {
  sf: {
    futureYear: "미래 시점", sfPremise: "AI 미래 명제", coreTech: "핵심 기술",
    scienceConstraint: "과학적 제약", socialShift: "사회 변화", aiEntity: "AI 존재",
  },
  general: {
    futureYear: "시대 / 배경", sfPremise: "작품 명제 / 핵심 질문", coreTech: "핵심 소재 · 장치",
    scienceConstraint: "핵심 제약 · 규칙", socialShift: "세계 · 사회 · 관계 구조", aiEntity: "핵심 존재 (조력/적대/시스템)",
  },
};

const SELECTORS = [
  "ipTitle", "medium", "format", "directorStyle", "aiFilmMode", "videoModel", "genre", "subgenre", "targetReader", "logline", "futureYear",
  "cadence", "sfPremise", "coreTech", "scienceConstraint", "socialShift",
  "protagonist", "desire", "aiEntity", "antagonist", "worldRule", "seasonGoal",
  "tone", "manuscript", "feedback", "webtoonBranch", "globalBranch",
  "fanCommunity", "commerceBranch", "coreTags",
  // 심화 기획(IP Bible)
  "powerSystem", "factions", "worldHistory", "protagonistSecret", "supportingCast",
  "loveInterest", "antagonistLogic", "centralConflict", "coreMystery", "twistPlan",
  "payoffPlan", "theme", "usp", "comps", "contentRating",
];

// 심화 기획 필드 id 모음(DEFAULTS·프리셋 적용용).
const BIBLE_FIELDS = [
  "powerSystem", "factions", "worldHistory", "protagonistSecret", "supportingCast",
  "loveInterest", "antagonistLogic", "centralConflict", "coreMystery", "twistPlan",
  "payoffPlan", "theme", "usp", "comps", "contentRating",
];

// 운영실 타깃 플랫폼 체크박스 (data-platform).
const PLATFORM_CHECKS = ["tpRoyalroad", "tpHfy", "tpWebnovel", "tpNaver", "tpKakao"];
// 연재 플랫폼(다중/미선택) 체크박스 (data-pf).
const PLATFORM_PF = ["kakao", "naver", "ridi", "novelpia", "global"];

const MODEL_LABELS = { quality: "Opus 4.8 (최고 품질)", balanced: "Sonnet 4.6 (빠름)", fast: "Haiku 4.5 (초고속)" };

const EXAMPLE = {
  ipTitle: "예언값 0.81의 도시",
  genre: "aiForesight",
  platform: "kakao",
  targetReader: "AI 미래, 알고리즘 계급, 빠른 사건 전개, 사이다 역전을 좋아하는 20-30대 독자",
  logline:
    "2041년, 서울의 모든 시민은 AI가 계산한 ‘미래가치 점수’로 직업과 거주지를 배정받고, 예측값 0.81로 사망 판정을 받은 전직 미래학자가 도시 OS의 거짓 예언을 깨기 위해 금지된 인간 변수를 추적한다.",
  futureYear: "2041",
  cadence: "daily",
  sfPremise:
    "AI가 인간의 미래를 충분히 정확히 예측하는 순간, 인간의 자유는 예측을 따르는 능력인가 아니면 예측을 배반하는 능력인가?",
  coreTech: "자율 AI 에이전트, 개인 미래가치 점수, 도시 운영 OS, 합성 기억 증거, 다중 미래 시뮬레이션",
  scienceConstraint:
    "예측 모델은 데이터가 풍부한 계층일수록 정확하고, 데이터가 빈곤한 사람에게는 잔혹하게 틀린다. 미래가치 점수는 72시간마다 갱신되며, 의도적으로 예측을 깨려는 행동은 시스템에 이상치로 기록된다.",
  socialShift:
    "학교는 시험 대신 예측 가능성을 훈련한다. 기업은 채용 전에 미래가치 점수를 구매한다. 점수가 낮은 시민은 도심 냉각권, 의료 우선권, 연애 매칭에서 밀려난다.",
  protagonist: "서지안, 실패한 미래학자이자 예측값 조작 혐의로 추방된 전직 도시 분석관",
  desire: "자신의 사망 예측을 깨고, 예측값 때문에 버려진 사람들의 미래를 되찾는다",
  aiEntity: "오라클-9, 서울의 정책과 개인 배정을 동시에 계산하는 도시 예측 에이전트",
  antagonist: "미래가치관리청, 데이터 귀족, 예측값 1.00을 신성시하는 시민 종교",
  worldRule:
    "모든 시민은 미래가치 점수로 계급이 정해진다. 점수 0.80 미만은 도심 진입권을 잃고, 0.95 이상은 국가가 보호한다. 예측을 고의로 빗나가게 하면 ‘불확실성 범죄’로 처벌된다.",
  seasonGoal: "25화 안에 오라클-9이 일부 시민의 죽음을 예측한 것이 아니라 설계했다는 증거를 확보한다",
  tone: "차갑고 빠른 문장, 미래 기술은 현실적으로, 감정은 절제하다가 결정적 장면에서 폭발",
  manuscript:
    "서지안은 자신의 장례식 초대장을 출근길에 받았다. 발신자는 서울시가 아니라 오라클-9이었다. 사망 예정 시각은 72시간 뒤, 사망 확률은 0.81.",
  feedback:
    "AI가 장례식 초대장을 보낸다는 설정이 강하다. 예측값이 계급이 되는 사회가 현실적이라 무섭다. 주인공이 시스템을 만든 사람이라는 점이 좋다. 기술 설명은 짧게.",
  webtoonBranch: true,
  globalBranch: true,
  fanCommunity: true,
  commerceBranch: false,
  // 심화 기획(IP Bible) 데모
  powerSystem: "미래가치 점수 0.00~1.00. 0.95+ 국가보호 대상, 0.80 미만 도심 진입권 상실, 0.50 이하 비생산 시민 판정.",
  factions: "미래가치관리청(예측 독점)·데이터 귀족(고점수 세습)·예측값 1.00을 신성시하는 시민 종교 vs 예측 밖으로 밀려난 '오류자' 지하 연대.",
  worldHistory: "2033 오라클-9 가동, 2036 예측 기반 행정 전면 도입, 2040 '예측 폭동' 진압 후 불확실성 범죄법 제정.",
  protagonistSecret: "서지안이 바로 오라클-9의 초기 예측 모델을 설계한 장본인이며, 자신이 만든 편향이 빈곤층을 죽음으로 분류한다는 걸 안다.",
  supportingCast: "한루아(예측 불가 변수 인간, 추적 대상) / 도경(데이터 청소부, 정보책) / 윤 박사(죽은 동료, 로그로만 남은 양심).",
  loveInterest: "한루아 — 서로의 생존을 쥔 불신과 끌림이 교차(관계 온도: 차갑게 시작해 결정적 장면에서 폭발).",
  antagonistLogic: "관리청장은 '예측은 다수를 구하기 위한 필요악'이라 믿으며, 소수의 희생을 통계적 자비로 정당화한다.",
  centralConflict: "정해진 미래(예측)를 따르는 안전 vs 그것을 배반하는 자유 — 서지안이 자기 사망 예측을 깨려는 싸움.",
  coreMystery: "오라클-9은 죽음을 '예측'한 것인가, 아니면 누군가 죽도록 '설계'한 것인가.",
  twistPlan: "중반: 사망 예측이 사실은 설계임이 드러남. 후반 금지된 선택: 자기 생존이냐, 빈곤층 전체의 예측값 해방이냐.",
  payoffPlan: "1~5화 예측 사회 규칙 → 6~12화 변수 인간과 모델 약점 → 13~20화 설계 증거 확보 → 21~25화 거짓 예언 폭로.",
  theme: "예측 가능해진 인간에게 자유의지란 무엇인가 — 안전이라는 이름의 통제에 대한 저항.",
  usp: "'사이다 회귀물'이 아니라, 주인공이 시스템의 공범이었다는 죄책감에서 출발하는 예측 사회 스릴러.",
  comps: "《마이너리티 리포트》의 예측 통제 × 한국 현판의 빠른 사이다 전개 × 디스토피아 계급 서사.",
  contentRating: "15세 — 폭력 중간, 선정 낮음, 사회적 잔혹성(배제·죽음 분류) 강조.",
};

const DEFAULTS = Object.fromEntries(
  SELECTORS.map((id) => [id, ["webtoonBranch", "globalBranch", "fanCommunity"].includes(id)]),
);
// 범용 웹소설 제작실이 기본. 박성우(foresight) 모드 진입 시에만 SF(aiForesight)로 전환된다.
Object.assign(DEFAULTS, { genre: "romanceFantasy", platform: "kakao", blendGenres: "", cadence: "daily", futureYear: "", medium: "webnovel", format: "long", directorStyle: "", videoModel: "kling" });
["ipTitle", "targetReader", "logline", "sfPremise", "coreTech", "scienceConstraint",
 "socialShift", "protagonist", "desire", "aiEntity", "antagonist", "worldRule",
 "seasonGoal", "tone", "manuscript", "feedback", "coreTags", "subgenre",
 ...BIBLE_FIELDS].forEach((id) => (DEFAULTS[id] = ""));
DEFAULTS.commerceBranch = false;

/* ------------------------------- App state ------------------------------ */

const state = {
  studio: "production",  // 'production' | 'platform'
  activeTab: "foresight",
  platformMeta: null,
  references: [],        // [{name, text, chars, preview, weak}] 과학 근거 자료
  chapters: {},          // chapterNumber -> markdown (연속 원고)
  chapterRunning: false,
  chapterController: null,
  streamingChapter: null,
  batchSize: 1,          // 한번에 생성할 화 수 (1 또는 5)
  totalChapters: 25,     // 시즌 길이(결말 지점)
  critiques: {},         // n -> 자체 피드백 결과 (현재/after)
  critiqueBefore: {},    // n -> 보완 전 피드백 (before/after 비교용)
  critiqueBusy: {},      // n -> 피드백 생성 중 여부
  noteOpen: {},          // n -> 사용자 의견 입력창 열림
  noteDraft: {},         // n -> 사용자 의견 임시값
  autoFeedback: false,   // 생성 후 자동 자체 피드백
  autoFinalPass: true,   // 전자동에서 마지막에 전체 보완 1회
  audit: null,           // 완성도 심사 결과
  auditBusy: false,
  lastImpact: null,      // 마지막 AI 임팩트 리포트(Before/After) 결과
  mediaUpgradeBrief: "", // 흥행 보증: 약한 입력 업그레이드 북극성 브리프(루프 중 주입)
  mediaReviseNotes: "",  // 흥행 보증: 보증 루프 보완 지시(재생성 시 주입)
  lastGuarantee: null,   // 마지막 흥행 보증서
  designSpec: {},        // 상세 설계 요소 값 { key: value }
  designElements: [],    // 현재 매체의 설계 요소 정의
  designSpecMedium: "",  // designElements가 로드된 매체
  oneSheet: {},          // 감독 원시트 12블록 { key: text }
  oneSheetLocked: false, // LOCK 여부(잠기면 모든 산출물에 주입)
  characterLock: "",     // 캐릭터 고정 토큰(잠기면 콘티·그림풍·영상 프롬프트에 주입)
  abBusy: false,         // A/B 비교 생성 진행 중
  memories: {},          // n -> 연재 메모리(요약·떡밥·인물·캐논). 장거리 연속성용.
  memoryBusy: {},        // n -> 메모리 생성 중 여부
  memoryOpen: false,     // 스토리 바이블 패널 펼침 여부
  outline: null,         // 시즌 아웃라인(기승전결 + 도파민 비트)
  outlineOpen: false,    // 아웃라인 패널 펼침 여부
  outlineBusy: false,    // 아웃라인 생성 중 여부
  lastRunChapters: [],   // 이번 실행에서 새로 생성한 화 번호
  buffers: {},      // agentId -> markdown
  statuses: {},     // agentId -> idle|running|done|error
  errors: {},
  running: false,
  score: 0,
  usage: { input_tokens: 0, output_tokens: 0 },
  projects: [],
  currentProjectId: "",
  config: { hasApiKey: false, models: {}, defaultModel: "" },
  controller: null,
  lastModel: "",
  playbookCache: {},
  recommendedSteering: null,
};

async function ensurePlaybook(genre) {
  if (state.playbookCache[genre]) return state.playbookCache[genre];
  try {
    const res = await fetch(`/api/playbook?genre=${encodeURIComponent(genre)}`);
    const data = await res.json();
    if (data.ok) {
      state.playbookCache[genre] = data;
      if (state.activeTab === "prompts") renderActiveTab();
      return data;
    }
  } catch { /* ignore */ }
  return null;
}

// SF 전용 필드 라벨 <-> 일반 장르 라벨 전환
function applyGenreLabels(family) {
  const labels = FIELD_LABELS[family] || FIELD_LABELS.general;
  Object.entries(labels).forEach(([id, text]) => {
    const span = document.querySelector(`span[data-label="${id}"]`);
    if (span) span.textContent = text;
  });
}

const PRESET_FIELDS = [
  "ipTitle", "targetReader", "logline", "futureYear", "sfPremise", "coreTech",
  "scienceConstraint", "socialShift", "protagonist", "desire", "aiEntity",
  "antagonist", "worldRule", "seasonGoal", "tone", ...BIBLE_FIELDS,
];

// 제작도 점수를 만드는 핵심 필드 [id, 라벨, 배점] — server의 scoreInput과 동일 가중치.
const SCORE_FIELDS = [
  ["sfPremise", "작품 명제", 12], ["coreTech", "핵심 소재·장치", 12], ["scienceConstraint", "핵심 제약·규칙", 11],
  ["logline", "로그라인", 10], ["socialShift", "세계·사회·관계", 9], ["worldRule", "세계 규칙", 8],
  ["protagonist", "주인공", 7], ["desire", "핵심 욕망", 7], ["aiEntity", "핵심 존재", 7],
  ["ipTitle", "제목", 6], ["antagonist", "적대 압력", 6], ["seasonGoal", "시즌 목표", 5],
];

/* --------- 서사 가중치(Narrative Steering) — lib/steering.js와 동기화 --------- */
const STEER_DIMS = [
  { key: "world", label: "세계관·설정", lo: "가볍게", hi: "깊게" },
  { key: "dopamine", label: "사이다·보상", lo: "절제", hi: "통쾌하게" },
  { key: "romance", label: "로맨스·관계", lo: "낮게", hi: "중심으로" },
  { key: "action", label: "액션·긴장", lo: "잔잔", hi: "치열" },
  { key: "mystery", label: "떡밥·미스터리", lo: "단순", hi: "촘촘히" },
  { key: "creativity", label: "창의성", lo: "클리셰", hi: "실험적" },
  { key: "pacing", label: "전개 속도", lo: "느리게", hi: "빠르게" },
  { key: "style", label: "문체", lo: "간결", hi: "생생" },
];
const STEER_KEYS = STEER_DIMS.map((d) => d.key);
const STEER_DEFAULT = Object.fromEntries(STEER_KEYS.map((k) => [k, 50]));
const STEER_PRESETS = {
  balanced: { label: "균형", weights: { world: 50, dopamine: 50, romance: 50, action: 50, mystery: 50, creativity: 50, pacing: 50, style: 50 } },
  orthodox: { label: "정통형", weights: { world: 72, dopamine: 50, romance: 40, action: 66, mystery: 60, creativity: 45, pacing: 45, style: 58 } },
  speed: { label: "속도형(사이다)", weights: { world: 35, dopamine: 90, romance: 35, action: 66, mystery: 45, creativity: 40, pacing: 86, style: 50 } },
  romance: { label: "관계형", weights: { world: 45, dopamine: 56, romance: 90, action: 32, mystery: 50, creativity: 55, pacing: 46, style: 76 } },
  lore: { label: "설정심화형", weights: { world: 90, dopamine: 42, romance: 46, action: 52, mystery: 76, creativity: 62, pacing: 32, style: 66 } },
};

function readSteering() {
  const s = {};
  STEER_KEYS.forEach((k) => { const n = el(`st_${k}`); s[k] = n ? Number(n.value) : 50; });
  return s;
}

function steeringSummaryText() {
  const s = readSteering();
  const top = STEER_DIMS
    .map((d) => ({ d, v: s[d.key], dev: Math.abs(s[d.key] - 50) }))
    .filter((x) => x.dev >= 20)
    .sort((a, b) => b.dev - a.dev).slice(0, 3)
    .map((x) => `${x.d.label}${x.v >= 50 ? "↑" : "↓"}`);
  // 활성 프리셋 일치 여부
  const cur = JSON.stringify(s);
  const preset = Object.values(STEER_PRESETS).find((p) => JSON.stringify(p.weights) === cur);
  if (preset && preset.label !== "균형") return preset.label;
  return top.length ? top.join(" · ") : "균형";
}

function updateSteerSummary() {
  const sum = el("steerSummary");
  if (sum) sum.textContent = steeringSummaryText();
  document.querySelectorAll("#steerPresets [data-preset]").forEach((b) => {
    const match = JSON.stringify(STEER_PRESETS[b.dataset.preset].weights) === JSON.stringify(readSteering());
    b.classList.toggle("active", match);
  });
}

function setSteering(weights, save = true) {
  STEER_KEYS.forEach((k) => { const n = el(`st_${k}`); if (n) n.value = (weights && weights[k] != null) ? weights[k] : 50; });
  updateSteerSummary();
  if (save) { localStorage.setItem("sfAgentInput", JSON.stringify(collectInput())); }
}

function renderSteering() {
  const ph = el("steerPresets");
  const dh = el("steerDials");
  if (!ph || !dh) return;
  ph.innerHTML = `<button class="steer-preset steer-rec" type="button" data-genre-rec="1" title="현재 장르에 권장되는 보상체계로 그래프바를 맞춥니다">🎯 장르 추천</button>` +
    Object.entries(STEER_PRESETS)
      .map(([k, p]) => `<button class="steer-preset" type="button" data-preset="${k}">${p.label}</button>`).join("");
  dh.innerHTML = STEER_DIMS.map((d) =>
    `<label class="steer-dial"><span class="steer-dial-label">${d.label}</span>
      <input type="range" min="0" max="100" step="5" value="50" data-steer="${d.key}" id="st_${d.key}" />
      <span class="steer-ends"><i>${d.lo}</i><i>${d.hi}</i></span></label>`).join("");
  ph.querySelectorAll("[data-preset]").forEach((b) =>
    b.addEventListener("click", () => { setSteering(STEER_PRESETS[b.dataset.preset].weights); toast(`서사 가중치: ${STEER_PRESETS[b.dataset.preset].label}`, "info"); }));
  const recBtn = ph.querySelector("[data-genre-rec]");
  if (recBtn) recBtn.addEventListener("click", () => {
    const w = state.recommendedSteering;
    if (!w) { toast("장르를 먼저 선택하세요.", "warn"); return; }
    setSteering(w);
    toast(`${GENRE_LABELS_KO[el("genre").value] || "장르"} 권장 보상체계를 적용했습니다.`, "info");
  });
  dh.querySelectorAll("[data-steer]").forEach((n) => n.addEventListener("input", updateSteerSummary));
  updateSteerSummary();
}

function applyPreset(preset) {
  if (!preset) return;
  PRESET_FIELDS.forEach((f) => {
    if (f in preset) el(f).value = preset[f] === "—" ? "" : preset[f];
  });
  if (preset.ipTitle) el("workspaceTitle").textContent = preset.ipTitle;
}

// 세부 장르 드롭다운을 현재 메인 장르에 맞게 채운다(복원값 dataset.want 우선).
function populateSubgenres(data) {
  const sel = el("subgenre");
  if (!sel) return;
  const subs = data?.playbook?.subgenres || [];
  const want = sel.dataset.want || sel.value || "";
  sel.innerHTML = `<option value="">(세부 장르 자동 — 메인 장르 기본)</option>` +
    subs.map((s) => `<option value="${s.key}">${escapeHtml(s.label)}</option>`).join("");
  sel.value = subs.some((s) => s.key === want) ? want : "";
  delete sel.dataset.want;
  renderSubgenreFormula(data);
}

function renderSubgenreFormula(data) {
  const hint = el("subgenreFormula");
  if (!hint) return;
  const subs = data?.playbook?.subgenres || [];
  const s = subs.find((x) => x.key === el("subgenre").value);
  hint.innerHTML = s
    ? `성공 방정식: <strong>${escapeHtml(s.formula)}</strong>`
    : (data?.playbook?.formula ? `성공 방정식(메인): ${escapeHtml(data.playbook.formula)}` : "");
}

// 장르 변경 시: 적응형 라벨 적용 + (옵션) 기본 예시 프리셋 자동 채움
async function onGenreChange(fillPreset) {
  const genre = el("genre").value;
  const data = await ensurePlaybook(genre);
  const family = data?.playbook?.family || "general";
  applyGenreLabels(family);
  populateSubgenres(data);
  // 장르별 권장 보상체계를 그래프바에 반영한다. 작가가 장르를 직접 고르거나(예시),
  // 아직 손대지 않은 중립 상태면 권장값으로 채운다(이미 조정한 값은 보존).
  if (data?.recommendedSteering) {
    state.recommendedSteering = data.recommendedSteering;
    const cur = readSteering();
    const isNeutral = STEER_KEYS.every((k) => Number(cur[k]) === 50);
    if (fillPreset || isNeutral) setSteering(data.recommendedSteering, false);
  }
  if (fillPreset) {
    applyPreset(data?.playbook?.preset);
    localStorage.setItem("sfAgentInput", JSON.stringify(collectInput()));
    el("runStatus").textContent = "예시 적용됨";
    toast(`${GENRE_LABELS_KO[genre] || genre} 장르 예시 + 권장 보상체계를 불러왔습니다.`, "info");
  }
  if (state.activeTab === "prompts") renderActiveTab();
  if (typeof updateJourney === "function") updateJourney();
}

// 드롭다운 표시용 한글 라벨
const GENRE_LABELS_KO = {
  aiForesight: "AI 미래예측 SF", cyberpunk: "사이버펑크", posthuman: "포스트휴먼",
  climate: "기후 SF", space: "우주 개척 SF", solarpunk: "솔라펑크",
  romanceFantasy: "로맨스판타지", modernFantasy: "현대판타지", academyFantasy: "아카데미 판타지",
  martialArts: "무협", modernRomance: "현대 로맨스", bl: "BL", chaebol: "재벌/기업",
  entertainment: "연예계/스포츠", altHistory: "대체역사", thriller: "스릴러/미스터리",
  healing: "힐링/일상", sfApocalypse: "SF/아포칼립스",
  wuxiaOrthodox: "정통 무협", wuxiaNew: "신무협", xianxia: "선협·수선",
  murimReturn: "무림 회귀·환생", fusionMurim: "퓨전 무협",
};

/* ------------------------------- Studio --------------------------------- */

// 운영실에서 공유 필드(원고/피드백)의 라벨을 운영 맥락으로 바꾼다.
function applyStudioLabels(ops) {
  const set = (label, text) => {
    const span = document.querySelector(`[data-label="${label}"]`);
    if (span) span.textContent = text;
  };
  set("draftSection", ops ? "Sample & Reviews" : "Draft & Feedback");
  set("manuscript", ops ? "샘플 챕터" : "원고 일부");
  set("feedback", ops ? "붙여넣은 리뷰 / 댓글" : "댓글 / 지표");
}

// 제작실 ↔ 운영실 ↔ 박성우(foresight) 전환: 에이전트 목록·입력 패널·탭을 통째로 스왑한다.
function setStudio(studio, opts = {}) {
  if (!STUDIOS[studio]) return;
  state.studio = studio;
  const medium = studio === "production" ? currentMedium() : "webnovel";
  AGENTS = activeAgentsFor(studio, medium);
  const ops = studio === "platform";
  const fore = studio === "foresight";
  const meta = STUDIO_META[studio];

  document.querySelectorAll(".studio-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.studio === studio));
  // 제작 입력(prod-only)은 production·foresight·business에서 보이고, 운영(ops-only)은 platform에서만.
  document.querySelectorAll(".prod-only").forEach((n) => { n.hidden = ops; });
  document.querySelectorAll(".ops-only").forEach((n) => { n.hidden = !ops; });
  document.querySelectorAll(".foresight-only").forEach((n) => { n.hidden = !fore; });
  document.querySelectorAll(".business-only").forEach((n) => { n.hidden = studio !== "business"; });
  document.body.classList.toggle("studio-foresight", fore);
  document.body.classList.toggle("studio-business", studio === "business");
  applyStudioLabels(ops);
  // 매체 선택(전용 파이프라인)은 제작 스튜디오에서만 노출·적용한다.
  document.querySelectorAll(".medium-row").forEach((n) => { n.hidden = studio !== "production"; });
  if (studio === "production") { applyMediumLabels(medium); applyFormatLabels(medium); }
  applyMediumVisibility(medium);

  const runLabel = el("runAgent")?.querySelector("span:last-child");
  if (runLabel) runLabel.textContent = (studio === "production") ? MEDIUM_META[medium].run : meta.run;
  if (el("brandEyebrow")) el("brandEyebrow").textContent = meta.brand;
  if (el("workspaceEyebrow")) el("workspaceEyebrow").textContent = meta.eyebrow;
  el("workspaceTitle").textContent = ops
    ? meta.title
    : (el("ipTitle").value || (studio === "production" ? MEDIUM_META[medium].title : meta.title));

  // 박성우 모드 진입 시 장르를 SF(미래예측)로 맞추고 적응형 라벨을 갱신한다.
  if (fore) {
    const g = el("genre");
    if (g && g.value !== "aiForesight" && g.querySelector('option[value="aiForesight"]')) {
      g.value = "aiForesight";
      onGenreChange(false);
    }
  }

  AGENTS.forEach((a) => { if (!(a.id in state.statuses)) state.statuses[a.id] = "idle"; });
  renderAgentGrid();
  renderTabs();
  setActiveTab(AGENTS[0].id);
  localStorage.setItem("sfAgentStudio", studio);
  el("readinessPanel").hidden = true;
  updateJourney();
  if (!opts.silent) {
    el("runStatus").textContent = meta.status;
    toast(meta.toast, "info");
    // 핸드오프 안내: 운영/사업실 진입 시 현재 작품 상태에 맞춘 한마디.
    if ((studio === "platform" || studio === "business")) {
      const hasIP = SCORE_FIELDS.some(([k]) => el(k) && el(k).value.trim()) || Object.keys(state.buffers).length;
      toast(hasIP ? "현재 작품 IP로 이어서 분석합니다." : "먼저 제작실에서 작품을 만들거나 프로젝트를 불러오세요.", hasIP ? "info" : "warn");
    }
  }
}

/* --------------------------- 진행 가이드 (스텝퍼·제작도) --------------------------- */

// 폼 입력 기반 제작도(서버 scoreInput과 동일 가중치). 실시간으로 칩을 갱신한다.
function clientScore() {
  const input = collectInput();
  let s = 0;
  SCORE_FIELDS.forEach(([k, , w]) => { if (String(input[k] || "").trim()) s += w; });
  if (input.manuscript) s += 4;
  if (input.feedback) s += 3;
  ["webtoonBranch", "globalBranch", "fanCommunity", "commerceBranch"].forEach((b) => { if (input[b]) s += 1.5; });
  return Math.max(0, Math.min(100, Math.round(s)));
}

function missingScoreFields() {
  return SCORE_FIELDS.filter(([k]) => !(el(k) && el(k).value.trim()));
}

// 스튜디오별 단계 + 다음 추천 행동.
function journeySteps() {
  const ran = Object.keys(state.buffers).length > 0;
  const hasIP = SCORE_FIELDS.some(([k]) => el(k) && el(k).value.trim());
  if (state.studio === "platform" || state.studio === "business") {
    const label = state.studio === "platform" ? "운영 분석" : "사업 분석";
    const steps = [
      { label: "작품 준비", done: hasIP, current: !hasIP },
      { label, done: ran, current: hasIP && !ran },
    ];
    const next = !hasIP
      ? { text: `제작실에서 작품을 만들거나 불러온 뒤 ${label}을 실행하세요.` }
      : !ran ? { text: `준비 완료. ‘${STUDIO_META[state.studio].run}’을 누르세요.`, action: "run" }
        : { text: `${label} 완료. 위 탭에서 결과를 확인하세요.` };
    return { steps, next };
  }
  const score = clientScore();
  const planned = score >= 60;
  const serialized = currentMaxChapter() > 1;
  const steps = [
    { label: "진단", done: !!state.lastImpact, current: false },
    { label: "기획", done: planned, current: !planned },
    { label: "제작", done: ran, current: planned && !ran },
    { label: "회차", done: serialized, current: ran && !serialized },
  ];
  let next;
  if (!planned) next = { text: score > 0 ? `기획 ${score}% — ‘🧩 빈 칸만 AI로 채우기’로 마저 채우세요.` : `아는 항목을 적고 ‘🧩 빈 칸만 AI로 채우기’를 누르세요.`, action: "complete" };
  else if (!ran) next = { text: `기획 완성. ‘${STUDIO_META[state.studio].run}’으로 작품을 생성하세요.`, action: "run" };
  else if (!serialized) next = { text: `초안 완성. ‘원고’ 탭에서 다음 회차를 이어 쓰세요.`, action: "draftTab" };
  else next = { text: `연재 진행 중 — 운영실·사업실에서 유통·수익화로 확장하세요.` };
  return { steps, next };
}

const STEP_ACT_LABEL = { complete: "🧩 빈 칸 채우기", run: "▶ 실행", draftTab: "원고 탭" };
function doStepAction(act) {
  if (act === "complete") completeFill();
  else if (act === "run") runAgent();
  else if (act === "draftTab") setActiveTab("draft");
}

function renderStepper() {
  const host = el("stepper");
  if (!host) return;
  const { steps, next } = journeySteps();
  const items = steps.map((s, i) =>
    `<div class="step ${s.done ? "done" : s.current ? "current" : ""}"><span class="step-dot">${s.done ? "✓" : i + 1}</span><span class="step-label">${s.label}</span></div>`
  ).join('<span class="step-arrow">→</span>');
  const actBtn = next.action ? `<button class="mini primary" id="stepAction" data-act="${next.action}">${STEP_ACT_LABEL[next.action]}</button>` : "";
  host.innerHTML = `<div class="steps">${items}</div><div class="step-next"><span class="step-next-k">다음</span> ${escapeHtml(next.text)} ${actBtn}</div>`;
  const b = el("stepAction");
  if (b) b.addEventListener("click", () => doStepAction(b.dataset.act));
}

function renderReadinessPanel() {
  const host = el("readinessPanel");
  if (!host) return;
  const missing = missingScoreFields();
  if (!missing.length) {
    host.innerHTML = `<div class="rp-empty">✓ 핵심 항목을 모두 채웠습니다 (제작도 100%).</div>`;
    return;
  }
  const lost = missing.reduce((a, [, , w]) => a + w, 0);
  const rows = missing.map(([k, label, w]) =>
    `<button class="rp-row" type="button" data-focus="${k}"><span>${label}</span><span class="rp-w">+${w}%</span></button>`
  ).join("");
  host.innerHTML =
    `<div class="rp-head">비어서 제작도를 깎는 항목 <strong>${missing.length}개</strong> · 최대 <strong>+${Math.round(lost)}%</strong>
      <button class="mini primary" id="rpFill" type="button">🧩 빈 칸 모두 채우기</button></div>
     <div class="rp-rows">${rows}</div>`;
  host.querySelectorAll("[data-focus]").forEach((bt) => bt.addEventListener("click", () => {
    const n = el(bt.dataset.focus);
    if (n) { n.focus(); n.scrollIntoView({ block: "center", behavior: "smooth" }); }
  }));
  const fill = el("rpFill");
  if (fill) fill.addEventListener("click", () => { completeFill(); });
}

function toggleReadinessPanel() {
  const p = el("readinessPanel");
  if (!p) return;
  p.hidden = !p.hidden;
  if (!p.hidden) renderReadinessPanel();
}

// 폼/상태 변화 시 칩·스텝퍼·(열려있으면)제작도 패널을 한 번에 갱신.
function updateJourney() {
  const sc = clientScore();
  state.score = sc;
  const chip = el("readinessChip");
  if (chip) chip.textContent = `제작도 ${sc}%`;
  renderStepper();
  if (el("readinessPanel") && !el("readinessPanel").hidden) renderReadinessPanel();
}

/* ------------------------------- Helpers -------------------------------- */

const el = (id) => document.getElementById(id);

function toast(message, kind = "info") {
  const node = el("toast");
  node.textContent = message;
  node.dataset.kind = kind;
  node.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (node.hidden = true), 2600);
}

function collectInput() {
  const input = {};
  SELECTORS.forEach((id) => {
    const node = el(id);
    if (!node) return;
    input[id] = node.type === "checkbox" ? node.checked : node.value.trim();
  });
  // 운영실 타깃 플랫폼: 체크된 data-platform을 콤마 문자열로.
  input.targetPlatforms = PLATFORM_CHECKS
    .map((id) => el(id))
    .filter((n) => n && n.checked)
    .map((n) => n.dataset.platform)
    .join(",");
  input.studio = state.studio;
  // 박성우(foresight) 모드: 모든 에이전트에 'AI FORESIGHT 렌즈'를 주입하도록 백엔드에 신호.
  input.foresight = state.studio === "foresight";
  // 서사 가중치(방향 제어) — 제목·세계관·아웃라인·회차 집필에 비중으로 반영.
  input.steering = readSteering();
  // 연재 플랫폼: 다중 선택(미선택 가능). platform은 하위호환용 첫 항목.
  input.platforms = PLATFORM_PF
    .filter((pf) => { const n = document.querySelector(`#platformChecks [data-pf="${pf}"]`); return n && n.checked; })
    .join(",");
  input.platform = input.platforms.split(",")[0] || "";
  // 혼합 장르: 다중 선택.
  const bg = el("blendGenres");
  input.blendGenres = bg ? Array.from(bg.selectedOptions).map((o) => o.value).filter(Boolean).join(",") : "";
  // 과학 근거 자료: 프롬프트용 합본 문자열(상한)과 복원용 배열을 함께 싣는다.
  if (state.references.length) {
    input.references = state.references
      .map((r) => `【${r.name}】\n${r.text}`)
      .join("\n\n")
      .slice(0, 6000);
    input._references = state.references;
  }
  // 흥행 보증 루프: 업그레이드 북극성 브리프 / 보완 지시를 매체 에이전트에 주입(있을 때만).
  if (state.mediaUpgradeBrief) input.upgradeBrief = state.mediaUpgradeBrief;
  if (state.mediaReviseNotes) input.reviseNotes = state.mediaReviseNotes;
  // 상세 설계 요소(노브 단위 확정값).
  if (state.designSpec && Object.keys(state.designSpec).length) input.designSpec = { ...state.designSpec };
  // 🔒 감독 원시트 LOCK — 잠겼을 때만 모든 에이전트에 주입(전 장르·전 매체).
  if (state.oneSheetLocked && state.oneSheet && Object.keys(state.oneSheet).some((k) => String(state.oneSheet[k] || "").trim())) {
    input.oneSheet = { ...state.oneSheet };
  }
  // 🧍 캐릭터 고정 토큰 — 콘티·그림풍·영상 프롬프트에 동일 인물로 주입.
  if (state.characterLock && String(state.characterLock).trim()) input.characterLock = state.characterLock;
  return input;
}

function fillForm(data) {
  SELECTORS.forEach((id) => {
    const node = el(id);
    if (!node || !(id in data)) return;
    if (node.type === "checkbox") node.checked = Boolean(data[id]);
    else node.value = data[id] ?? "";
  });
  if (typeof data.targetPlatforms === "string") {
    const set = new Set(data.targetPlatforms.split(",").map((s) => s.trim()).filter(Boolean));
    PLATFORM_CHECKS.forEach((id) => {
      const node = el(id);
      if (node) node.checked = set.has(node.dataset.platform);
    });
  }
  // 세부 장르는 옵션이 아직 채워지기 전이라, 복원값을 dataset.want에 보관(populateSubgenres가 적용).
  const sg = el("subgenre");
  if (sg && "subgenre" in data) sg.dataset.want = data.subgenre || "";
  // 연재 플랫폼(다중) 복원: platforms 우선, 없으면 하위호환 platform.
  if ("platforms" in data || "platform" in data) {
    const set = new Set(String(data.platforms ?? data.platform ?? "").split(",").map((s) => s.trim()).filter(Boolean));
    PLATFORM_PF.forEach((pf) => { const n = document.querySelector(`#platformChecks [data-pf="${pf}"]`); if (n) n.checked = set.has(pf); });
  }
  // 혼합 장르(다중) 복원.
  if ("blendGenres" in data) {
    const set = new Set(String(data.blendGenres || "").split(",").map((s) => s.trim()).filter(Boolean));
    const bg = el("blendGenres");
    if (bg) Array.from(bg.options).forEach((o) => { o.selected = set.has(o.value); });
  }
  // 서사 가중치 복원(없으면 균형).
  setSteering(data.steering && typeof data.steering === "object" ? data.steering : STEER_DEFAULT, false);
  state.references = Array.isArray(data._references) ? data._references : [];
  renderRefList();
  // 상세 설계 요소 복원(onMediumChange의 keep 모드가 이 값을 유지·렌더).
  state.designSpec = (data.designSpec && typeof data.designSpec === "object") ? { ...data.designSpec } : {};
  // 감독 원시트 복원(저장된 oneSheet는 LOCK 상태로 저장된 것).
  state.oneSheet = (data.oneSheet && typeof data.oneSheet === "object") ? { ...data.oneSheet } : {};
  state.oneSheetLocked = Object.keys(state.oneSheet).length > 0;
  if (typeof updateOnesheetLockUI === "function") updateOnesheetLockUI();
  // 캐릭터 고정 토큰 복원.
  state.characterLock = (typeof data.characterLock === "string") ? data.characterLock : "";
}

/* ------------------------------ Rendering ------------------------------- */

function renderAgentGrid() {
  el("agentGrid").innerHTML = AGENTS.map((a) => `
    <article class="agent-card" data-agent="${a.id}" role="button" tabindex="0">
      <div class="agent-head">
        <h3>${a.name}</h3>
        <span class="agent-state" data-state="idle">대기</span>
      </div>
      <p>${a.sub}</p>
      <div class="score-bar"><span data-bar="${a.id}"></span></div>
    </article>`).join("");

  document.querySelectorAll(".agent-card").forEach((card) => {
    const go = () => setActiveTab(card.dataset.agent);
    card.addEventListener("click", go);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
    });
  });
}

function extraTab() {
  return state.studio === "platform"
    ? { id: "guide", label: "운영 가이드" }
    : { id: "prompts", label: "Prompt Pack" };
}

function renderTabs() {
  const tabs = [...AGENTS.map((a) => ({ id: a.id, label: a.tab })), extraTab()];
  el("tabBar").innerHTML = tabs.map((t) => `
    <button class="tab${t.id === state.activeTab ? " active" : ""}" type="button" data-tab="${t.id}">${t.label}</button>`).join("");
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
  });
}

function agentStateLabel(st) {
  return { idle: "대기", running: "생성 중", done: "완료", error: "오류" }[st] || "대기";
}

function updateAgentCard(id) {
  const card = document.querySelector(`.agent-card[data-agent="${id}"]`);
  if (!card) return;
  const st = state.statuses[id] || "idle";
  const stEl = card.querySelector(".agent-state");
  stEl.textContent = agentStateLabel(st);
  stEl.dataset.state = st;
  card.dataset.active = String(id === state.activeTab);
  const chars = (state.buffers[id] || "").length;
  const bar = card.querySelector(`[data-bar="${id}"]`);
  if (bar) {
    const pct = st === "done" ? 100 : st === "running" ? Math.min(92, 12 + chars / 30) : st === "error" ? 100 : 0;
    bar.style.width = `${pct}%`;
    bar.dataset.state = st;
  }
}

function setActiveTab(id) {
  state.activeTab = id;
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === id));
  AGENTS.forEach((a) => updateAgentCard(a.id));
  renderActiveTab();
}

function promptPackHtml() {
  const input = collectInput();
  const lines = AGENTS.map((a) => `- **${a.name}** — ${a.sub}`).join("\n");
  const block = [
    "## 파이프라인 구조",
    "6개 에이전트가 의존성에 따라 순차·병렬로 실행되며, 앞 단계 산출물이 다음 단계의 입력이 됩니다.",
    "",
    lines,
    "",
    "## 에이전트에 전달되는 작품 데이터",
    "```",
    `IP 제목: ${input.ipTitle || "무제 SF"}`,
    `장르: ${input.genre}`,
    `미래 시점: ${input.futureYear || "2041"}년`,
    `AI 미래 명제: ${input.sfPremise || "(미입력)"}`,
    `핵심 기술: ${input.coreTech || "(미입력)"}`,
    `과학적 제약: ${input.scienceConstraint || "(미입력)"}`,
    `사회 변화: ${input.socialShift || "(미입력)"}`,
    `세계 규칙: ${input.worldRule || "(미입력)"}`,
    `시즌 목표: ${input.seasonGoal || "(미입력)"}`,
    "```",
    "",
    "> 실제 시스템 프롬프트는 서버의 `lib/agents.js`에 정의되어 있으며, 각 에이전트는 위 데이터와 상위 에이전트 산출물을 받아 Claude로 생성합니다.",
  ].join("\n");
  return window.renderMarkdown(block);
}

function playbookHtml(genre, data) {
  if (!data) return "";
  const p = data.playbook;
  const c = data.common;
  const subs = p.subgenres || [];
  const selKey = el("subgenre")?.value || "";
  const selSub = subs.find((s) => s.key === selKey);
  const md = [
    `## 적용 중인 흥행 문법 — ${p.label}${selSub ? ` ▸ ${selSub.label}` : ""}`,
    `- 장르 핵심: ${p.core}`,
    `- 성공 방정식: **${selSub ? selSub.formula : p.formula}**`,
    `- 핵심 보상: ${selSub && selSub.reward ? selSub.reward : p.reward}`,
    subs.length ? "" : null,
    subs.length ? "### 세부 장르 성공 방정식 (선택 가능)" : null,
    ...(subs.length ? subs.map((s) => `- ${s.key === selKey ? "**▶ " : ""}${s.label}: ${s.formula}${s.key === selKey ? "**" : ""}`) : []),
    subs.length ? "" : null,
    `- 설계 원칙: **${c.designPrinciple}**`,
    `- 5단계 구조: ${c.hitStages.join(" → ")}`,
    "",
    "### 초반 5화 공식",
    "| 화 | 내용 |", "|---|---|",
    ...p.fiveEpisode.map((r) => `| ${r[0]} | ${r[1]} |`),
    "",
    `### 반복 루프`, p.loop,
    "",
    "### 흥행 장치",
    "| 장치 | 효과 |", "|---|---|",
    ...p.devices.map((r) => `| ${r[0]} | ${r[1]} |`),
    "",
    "### 제목 문법",
    ...p.titles.map((t) => `- ${t}`),
  ].filter((x) => x !== null && x !== undefined).join("\n");
  return window.renderMarkdown(md);
}

async function ensurePlatformMeta() {
  if (state.platformMeta) return state.platformMeta;
  try {
    const res = await fetch("/api/platform-meta");
    const data = await res.json();
    if (data.ok) {
      state.platformMeta = data;
      if (state.activeTab === "guide") renderActiveTab();
      return data;
    }
  } catch { /* ignore */ }
  return null;
}

function guideHtml(meta) {
  if (!meta) return "<p>운영 가이드 불러오는 중…</p>";
  const plat = Object.values(meta.platforms || {}).map(
    (p) => `| ${p.label} | ${p.surface} | ${p.rules} | ${p.implication} |`,
  );
  const tax = (meta.taxonomy || []).map((t) => `| ${t.layer} | ${t.use} | ${t.tags.join(", ")} |`);
  const persona = (meta.personas || []).map((p) => `| ${p[0]} | ${p[1]} | ${p[2]} | ${p[3]} |`);
  const md = [
    "## 운영실 — Platform Intelligence",
    "> 같은 작품을 플랫폼마다 다르게 설명·태깅·연재·대응하기 위한 운영 지식 베이스입니다.",
    "",
    `**성공식** — ${meta.successFormula}`,
    "",
    `**실패식** — ${meta.failureFormula}`,
    "",
    "### 플랫폼 지형",
    "| 플랫폼 | 표면 | 규칙 | 운영 시사점 |", "|---|---|---|---|", ...plat,
    "",
    "### 6층 태깅 분류체계",
    "| 층위 | 용도 | 예시 태그 |", "|---|---|---|", ...tax,
    "",
    "### 독자 페르소나",
    "| 페르소나 | 플랫폼 | 반응하는 것 | 도구가 할 일 |", "|---|---|---|---|", ...persona,
  ].join("\n");
  return window.renderMarkdown(md);
}

function renderActiveTab() {
  const panel = el("outputPanel");
  const id = state.activeTab;

  if (id === "guide") {
    panel.innerHTML = `<div class="md-output">${guideHtml(state.platformMeta)}</div>`;
    if (!state.platformMeta) ensurePlatformMeta();
    return;
  }

  if (id === "prompts") {
    const genre = collectInput().genre;
    const pb = state.playbookCache[genre];
    panel.innerHTML =
      `<div class="md-output">${pb ? playbookHtml(genre, pb) : "<p>흥행 문법 불러오는 중…</p>"}<hr />${promptPackHtml()}</div>`;
    if (!pb) ensurePlaybook(genre);
    return;
  }

  // 원고 탭은 연속 회차 스튜디오로 렌더한다.
  if (id === "draft") {
    renderDraftStudio(panel);
    return;
  }

  const st = state.statuses[id] || "idle";
  const buffer = state.buffers[id] || "";
  const isDraft = id === "draft";

  if (state.errors[id]) {
    panel.innerHTML = `<div class="agent-error">⚠ ${state.errors[id]}</div>` +
      (buffer ? `<div class="md-output ${isDraft ? "manuscript" : ""}">${window.renderMarkdown(buffer)}</div>` : "");
    return;
  }

  if (!buffer && st === "idle") {
    panel.innerHTML = `<div class="empty-state">‘${(STUDIO_META[state.studio] || STUDIO_META.production).run}’을 누르면 <strong>${AGENTS.find((a) => a.id === id)?.name}</strong> 산출물이 여기에 실시간으로 생성됩니다.</div>`;
    return;
  }

  const cursor = st === "running" ? '<span class="cursor"></span>' : "";
  panel.innerHTML = `<div class="md-output ${isDraft ? "manuscript" : ""}">${window.renderMarkdown(buffer)}${cursor}</div>`;
}

function updateUsage() {
  const total = (state.usage.input_tokens || 0) + (state.usage.output_tokens || 0);
  el("usageChip").textContent = `토큰 ${total.toLocaleString()}`;
}

/* ----------------------------- SSE pipeline ----------------------------- */

function resetRun() {
  state.buffers = {};
  state.statuses = {};
  state.errors = {};
  state.chapters = {};   // 새 파이프라인 실행 시 연속 원고도 초기화(1화가 새로 생성됨)
  state.memories = {};   // 연재 메모리도 초기화(회차가 새로 쌓이며 다시 누적)
  state.outline = null;  // 시즌 아웃라인도 초기화(새 작품)
  state.usage = { input_tokens: 0, output_tokens: 0 };
  AGENTS.forEach((a) => { state.statuses[a.id] = "idle"; updateAgentCard(a.id); });
  updateUsage();
  renderActiveTab();
}

function handleEvent(type, data) {
  switch (type) {
    case "meta":
      updateJourney();
      break;
    case "start":
      state.lastModel = data.model;
      if (data.fallback) toast("로컬 폴백 모드로 생성합니다 (API 키 없음).", "warn");
      break;
    case "status": {
      state.statuses[data.agent] = data.state;
      if (data.state === "error") state.errors[data.agent] = data.message;
      updateAgentCard(data.agent);
      if (data.agent === state.activeTab) renderActiveTab();
      break;
    }
    case "delta": {
      state.buffers[data.agent] = (state.buffers[data.agent] || "") + data.text;
      updateAgentCard(data.agent);
      if (data.agent === state.activeTab) renderActiveTab();
      break;
    }
    case "done":
    case "final":
      if (data.usage) { state.usage = data.usage; updateUsage(); }
      updateJourney(); // 제작 단계 완료 → 스텝퍼·제작도 갱신
      break;
    case "error":
      toast(data.message || "오류가 발생했습니다.", "error");
      break;
  }
}

async function runAgent() {
  if (state.running) return;
  const input = collectInput();
  localStorage.setItem("sfAgentInput", JSON.stringify(input));

  state.running = true;
  el("runAgent").disabled = true;
  el("stopAgent").hidden = false;
  el("runStatus").textContent = "생성 중";
  resetRun();

  // Jump to the first agent's tab so the user sees streaming immediately.
  setActiveTab(AGENTS[0].id);

  const controller = new AbortController();
  state.controller = controller;
  const model = el("modelSelect").value || state.config.defaultModel;
  // 제작 스튜디오에서는 선택한 매체의 전용 파이프라인을, 그 외엔 스튜디오 파이프라인을 쓴다.
  const pipeline = (state.studio === "production")
    ? (MEDIUM_PIPELINE[currentMedium()] || "production")
    : (STUDIO_PIPELINE[state.studio] || "production");

  try {
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, model, pipeline }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) throw new Error(`서버 오류 (HTTP ${res.status})`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let sep;
      while ((sep = buf.indexOf("\n\n")) !== -1) {
        const raw = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        let type = "message";
        let dataLine = "";
        raw.split("\n").forEach((line) => {
          if (line.startsWith("event:")) type = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
        });
        if (!dataLine) continue;
        try { handleEvent(type, JSON.parse(dataLine)); } catch { /* ignore */ }
      }
    }
    el("runStatus").textContent = state.lastModel === "local-fallback" ? "폴백 완료" : "완료";
    toast("생성이 완료되었습니다.", "success");
  } catch (err) {
    if (err.name === "AbortError") {
      el("runStatus").textContent = "중단됨";
      toast("실행을 중단했습니다.", "warn");
    } else {
      el("runStatus").textContent = "오류";
      toast(err.message || "실행 실패", "error");
    }
  } finally {
    state.running = false;
    state.controller = null;
    el("runAgent").disabled = false;
    el("stopAgent").hidden = true;
  }
}

function stopAgent() {
  if (state.controller) state.controller.abort();
}

/* --------------------------- 과학 근거 자료 ------------------------------ */

function renderRefList() {
  const box = el("refList");
  if (!box) return;
  box.innerHTML = state.references.map((r, i) => `
    <span class="ref-chip${r.weak ? " weak" : ""}" title="${escapeHtml(r.preview || "")}">
      📄 ${escapeHtml(r.name)} <em>${r.chars.toLocaleString()}자</em>
      <button type="button" class="ref-x" data-ref="${i}" aria-label="삭제">✕</button>
    </span>`).join("");
  box.querySelectorAll(".ref-x").forEach((b) => b.addEventListener("click", () => {
    state.references.splice(Number(b.dataset.ref), 1);
    renderRefList();
    localStorage.setItem("sfAgentInput", JSON.stringify(collectInput()));
  }));
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",").pop());
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleRefUpload(file) {
  if (!file) return;
  if (file.size > 12 * 1024 * 1024) { toast("파일이 너무 큽니다(최대 12MB).", "warn"); return; }
  const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
  el("runStatus").textContent = "자료 추출 중";
  try {
    let payload;
    if (isPdf) {
      payload = { name: file.name, kind: "pdf", dataBase64: await fileToBase64(file) };
    } else {
      payload = { name: file.name, kind: "text", text: await file.text() };
    }
    const res = await fetch("/api/reference", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "자료 처리 실패");
    state.references.push({ name: data.name, text: data.text, chars: data.chars, preview: data.preview, weak: data.weak });
    renderRefList();
    localStorage.setItem("sfAgentInput", JSON.stringify(collectInput()));
    el("runStatus").textContent = "자료 추가됨";
    if (data.weak) toast(`'${data.name}' 추출 텍스트가 적습니다(${data.chars}자). 스캔본일 수 있어요 — TXT로 올리면 정확합니다.`, "warn");
    else toast(`'${data.name}' 근거 자료를 추가했습니다 (${data.chars.toLocaleString()}자 추출${data.truncated ? ", 일부만 사용" : ""}).`, "success");
  } catch (err) {
    el("runStatus").textContent = "오류";
    toast(err.message || "자료 업로드 실패", "error");
  } finally {
    const input = el("refFile"); if (input) input.value = "";
  }
}

/* ----------------------- 최종 소설 다운로드 ----------------------------- */

// 작가용 부가 섹션을 떼어 깨끗한 본문만 남긴다.
function cleanChapterForNovel(text) {
  let t = String(text || "");
  ["## 장면 카드", "## 다음 원고 지시", "## 다음 화 예고"].forEach((h) => {
    const i = t.indexOf(h);
    if (i !== -1) t = t.slice(0, i);
  });
  return t.replace(/^##\s+/, "").trim();
}

function downloadNovel() {
  const map = chapterMap();
  const nums = chapterNumbers(map);
  if (!nums.length) { toast("생성된 원고가 없습니다. 먼저 회차를 생성하세요.", "warn"); return; }
  const input = collectInput();
  const title = input.ipTitle || "무제 소설";
  const header = [title, input.logline ? `\n${input.logline}` : "", `\n\n${"=".repeat(40)}\n`].join("");
  const body = nums.map((n) => cleanChapterForNovel(map[n])).filter(Boolean).join("\n\n\n");
  const novel = `${header}\n${body}\n`;
  const blob = new Blob([novel], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^\p{L}\p{N}]+/gu, "-")}-novel.txt`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`최종 소설(${nums.length}화)을 다운로드했습니다.`, "success");
}

/* --------------------------- 완성도 심사 -------------------------------- */

// 심사용 발췌(digest): 작품개요 + 각 회차 도입부/마무리. (전문은 너무 길어 발췌)
function buildAuditDigest() {
  const map = chapterMap();
  const nums = chapterNumbers(map);
  const src = state.buffers.world || state.buffers.plot || "";
  const oi = src.indexOf("## 작품개요");
  const parts = [];
  if (oi >= 0) parts.push(`### 작품개요\n${src.slice(oi, oi + 1200)}`);
  nums.forEach((n) => {
    const t = String(map[n] || "");
    const head = t.slice(0, 700);
    const tail = t.length > 1100 ? `\n…(중략)…\n${t.slice(-320)}` : "";
    parts.push(`### ${n}화 발췌\n${head}${tail}`);
  });
  return parts.join("\n\n").slice(0, 38000);
}

async function runAudit() {
  if (state.chapterRunning || state.running) return;
  if (!chapterNumbers().length) { toast("심사할 원고가 없습니다. 먼저 회차를 생성하세요.", "warn"); return; }
  state.chapterRunning = true;
  state.auditBusy = true;
  state.chapterController = new AbortController();
  renderDraftStudio(el("outputPanel"));
  try {
    el("runStatus").textContent = "완성도 심사 중";
    const res = await fetch("/api/audit", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: collectInput(), model: el("modelSelect").value, digest: buildAuditDigest() }),
    });
    const data = await res.json();
    if (!data.ok || !data.audit) throw new Error(data.error || "심사 실패");
    state.audit = data.audit;
    el("runStatus").textContent = "완성도 심사 완료";
    toast(`완성도 심사: ${data.audit.overall}/100${data.audit.fallback ? " (폴백)" : ""}`, "success");
  } catch (err) {
    el("runStatus").textContent = "오류";
    toast(err.message || "심사 실패", "error");
  } finally {
    state.auditBusy = false;
    state.chapterRunning = false;
    state.chapterController = null;
    if (state.activeTab === "draft") renderDraftStudio(el("outputPanel"));
  }
}

function auditPanelHtml() {
  const a = state.audit;
  if (state.auditBusy && !a) {
    return `<div class="audit-panel"><div class="audit-head">📋 완성도 심사 진행 중…</div></div>`;
  }
  if (!a) return "";
  const dims = Object.entries(a.dimensions || {}).map(([k, v]) =>
    `<span class="audit-dim"><b>${k}</b> ${v}</span>`).join("");
  const list = (arr, cls) => (arr && arr.length)
    ? `<ul class="audit-${cls}">${arr.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : "<p class='audit-none'>—</p>";
  const fatal = (a.fatalWeaknesses || []).length
    ? `<ul class="audit-fatal">${a.fatalWeaknesses.map((w) =>
      `<li><b>${escapeHtml(w.issue)}</b>${w.chapters?.length ? ` <em>(${w.chapters.join(",")}화)</em>` : ""} — ${escapeHtml(w.why || "")}</li>`).join("")}</ul>`
    : "<p class='audit-none'>—</p>";
  const hasTargets = (a.fatalWeaknesses || []).some((w) => w.chapters && w.chapters.length);
  return `<div class="audit-panel${a.fallback ? " fallback" : ""}">
    <div class="audit-head">📋 완성도 심사 <strong>${a.overall}/100</strong> <span class="audit-grade">${escapeHtml(a.grade || "")}</span></div>
    <div class="audit-dims">${dims}</div>
    <div class="audit-verdict">“${escapeHtml(a.verdict || "")}”</div>
    <div class="crit-label">치명적 약점 (레드팀: 왜 떨어지나)</div>${fatal}
    ${a.cliches?.length ? `<div class="crit-label warn">기시감/클리셰</div>${list(a.cliches, "bad")}` : ""}
    ${a.inconsistencies?.length ? `<div class="crit-label warn">연속성·설정 오류</div>${list(a.inconsistencies, "bad")}` : ""}
    <div class="crit-label">강점</div>${list(a.strengths, "good")}
    <div class="crit-label">완성도 보강 로드맵</div>${list(a.revisionPlan, "fix")}
    <div class="audit-actions">
      <button class="mini primary" id="auditRevise" type="button" ${hasTargets ? "" : "disabled"} title="${hasTargets ? "심사가 지목한 회차를 완성도 기준으로 보강 재집필" : "지목된 회차가 없습니다"}">⚑ 약점 회차 보강</button>
      <button class="mini" id="auditClose" type="button">심사 닫기</button>
    </div>
  </div>`;
}

// 심사가 지목한 회차들을 '완성도(literary)' 모드로 보강 재집필.
async function reviseFromAudit() {
  const a = state.audit;
  if (!a || state.chapterRunning || state.running) return;
  const byChapter = {};
  (a.fatalWeaknesses || []).forEach((w) => (w.chapters || []).forEach((n) => {
    (byChapter[n] = byChapter[n] || []).push(`${w.issue}: ${w.why}`);
  }));
  const targets = Object.keys(byChapter).map(Number).filter((n) => chapterMap()[n]).sort((x, y) => x - y);
  if (!targets.length) { toast("심사가 지목한 보강 회차가 없습니다.", "warn"); return; }
  if (!confirm(`심사가 지목한 ${targets.length}개 회차(${targets.join(",")})를 '완성도' 기준으로 보강 재집필합니다.\n흥행 사이다가 아니라 문장·개연성·독창성을 끌어올립니다. 진행할까요?`)) return;
  state.chapterRunning = true;
  state.chapterController = new AbortController();
  renderDraftStudio(el("outputPanel"));
  const plan = (a.revisionPlan || []).slice(0, 4).join(" / ");
  try {
    let done = 0;
    for (const n of targets) {
      if (state.chapterController.signal.aborted) break;
      const note = `[완성도 보강] 다음 약점을 반드시 해소하라:\n- ${byChapter[n].join("\n- ")}\n전체 보강 방향: ${plan}`;
      state.streamingChapter = n;
      el("runStatus").textContent = `심사 보강 ${++done}/${targets.length} — ${n}화`;
      await streamChapterRequest(n, 1, { revise: { note, original: chapterMap()[n], mode: "literary" } });
    }
    el("runStatus").textContent = "심사 보강 완료";
    toast(`완성도 보강 완료 (${done}화). 다시 심사로 개선을 확인하세요.`, "success");
  } catch (err) {
    if (err.name === "AbortError") { el("runStatus").textContent = "중단됨"; toast("보강을 중단했습니다.", "warn"); }
    else { el("runStatus").textContent = "오류"; toast(err.message || "보강 실패", "error"); }
  } finally {
    state.chapterRunning = false;
    state.chapterController = null;
    state.streamingChapter = null;
    if (state.activeTab === "draft") renderDraftStudio(el("outputPanel"));
    updateJourney(); // 회차 변화 후 진행 가이드 갱신
  }
}

/* --------------------------- 연속 원고 스튜디오 -------------------------- */

const MAX_CHAPTER = 60; // 하드 안전 상한. 실제 결말 지점은 state.totalChapters(시즌 길이).
const SEASON_OPTIONS = [10, 15, 20, 25, 30, 40];

// 1화는 파이프라인 Draft 산출물이 기본 소스. 생성된 회차(state.chapters)가 있으면 덮어쓴다.
function chapterMap() {
  const m = {};
  if (state.buffers.draft) m[1] = state.buffers.draft;
  Object.entries(state.chapters).forEach(([k, v]) => { if (v) m[k] = v; });
  return m;
}

function chapterNumbers(map = chapterMap()) {
  return Object.keys(map).map(Number).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
}

function draftStudioHtml() {
  const map = chapterMap();
  const nums = chapterNumbers(map);
  const maxCh = nums.length ? Math.max(...nums) : 0;
  const target = state.totalChapters;
  const next = maxCh + 1;
  const canMore = maxCh < target;
  const willGen = Math.min(state.batchSize, target - maxCh);

  let action;
  if (state.chapterRunning) {
    action = `<button class="command ghost" id="chapterStop" type="button">중단</button>`;
  } else if (canMore) {
    action = `<button class="command primary chapter-gen" id="chapterGen" type="button"><span class="dot"></span><span>다음 ${willGen}화 (${next}~${maxCh + willGen})</span></button>
      <button class="command primary" id="chapterToEnd" type="button" title="결말(${target}화)까지 자동으로 이어서 생성"><span>🏁 끝까지 생성 (~${target}화)</span></button>`;
  } else {
    action = `<span class="chapter-complete">결말 ${target}화까지 완성 ✓</span>`;
  }

  const controls = `
    <div class="chapter-bar">
      <span class="chapter-count">원고 <strong>${maxCh}</strong> / ${target}화</span>
      <label class="chapter-batch">한번에
        <select id="chapterBatch" ${state.chapterRunning ? "disabled" : ""}>
          <option value="1"${state.batchSize === 1 ? " selected" : ""}>1화씩</option>
          <option value="5"${state.batchSize === 5 ? " selected" : ""}>5화씩</option>
        </select>
      </label>
      <label class="chapter-batch">결말
        <select id="seasonLen" ${state.chapterRunning ? "disabled" : ""}>
          ${SEASON_OPTIONS.map((v) => `<option value="${v}"${target === v ? " selected" : ""}>${v}화</option>`).join("")}
        </select>
      </label>
      <label class="chapter-auto" title="생성 후 회차마다 자동으로 자체 피드백을 만듭니다(호출 추가)">
        <input type="checkbox" id="autoFeedback" ${state.autoFeedback ? "checked" : ""} ${state.chapterRunning ? "disabled" : ""} /> 자동 피드백
      </label>
      <label class="chapter-auto" title="전자동 끝에 전체 회차를 한번 더 보완합니다">
        <input type="checkbox" id="autoFinalPass" ${state.autoFinalPass ? "checked" : ""} ${state.chapterRunning ? "disabled" : ""} /> 최종 전체보완
      </label>
      ${!state.chapterRunning ? `<button class="mini${state.outlineOpen ? " primary" : ""}" id="outlineToggle" type="button" title="기승전결 + 도파민 비트 아웃라인을 설계해 각 회차 집필을 가이드합니다">📐 아웃라인${state.outline ? " ✓" : ""}</button>` : ""}
      ${action}
      ${canMore && !state.chapterRunning ? `<button class="command primary" id="autopilot" type="button" title="${next}~${target}화를 [생성→피드백→보완] 자동 반복 후 마무리 전체보완"><span>🤖 전자동 (~${target}화)</span></button>` : ""}
      ${nums.length && !state.chapterRunning ? `<button class="mini" id="critiqueAll" type="button" title="모든 회차에 자체 피드백을 한번에 생성">🔍 전체 피드백</button>` : ""}
      ${nums.length && !state.chapterRunning ? `<button class="mini primary" id="reviseAll" type="button" title="모든 회차를 각자의 피드백대로 한번에 보완">✦ 전체 보완</button>` : ""}
      ${nums.length && !state.chapterRunning ? `<button class="mini" id="auditBtn" type="button" title="작품 완성도를 공모전 본심 기준으로 심사(흥행 잣대 아님)">📋 완성도 심사</button>` : ""}
      ${nums.length && !state.chapterRunning ? `<button class="mini" id="novelDownload" type="button" title="생성된 회차를 하나의 소설 파일로 다운로드">⬇ 소설 다운로드</button>` : ""}
      ${Object.keys(state.memories).length ? `<button class="mini${state.memoryOpen ? " primary" : ""}" id="memoryToggle" type="button" title="누적된 연재 메모리(줄거리·미회수 떡밥·인물 현황·확정 설정)를 봅니다">🧭 스토리 바이블 (${Object.keys(state.memories).length})</button>` : ""}
      ${maxCh > 1 && !state.chapterRunning ? `<button class="mini danger" id="chapterReset" type="button" title="2화 이후 생성 원고 삭제">원고 초기화</button>` : ""}
    </div>`;

  let body;
  if (!nums.length) {
    body = `<div class="empty-state">위에서 <strong>${(STUDIO_META[state.studio] || STUDIO_META.production).run}</strong>으로 1화 오프닝을 먼저 만들거나, <strong>다음 1화 생성</strong>으로 1화부터 시작하세요. 좋으면 다음 화를 이어서 생성합니다.</div>`;
  } else {
    body = nums.map((n) => {
      const streaming = state.chapterRunning && state.streamingChapter === n;
      const cursor = streaming ? '<span class="cursor"></span>' : "";
      const tag = streaming ? `<span class="chapter-tag">생성 중…</span>` : "";
      const md = `<div class="md-output manuscript">${window.renderMarkdown(map[n])}${cursor}</div>`;
      const crit = state.critiques[n];
      const busy = state.critiqueBusy[n];
      // 피드백은 배치 작업 중에도 실시간으로 보여준다.
      const critBlock = crit
        ? critiqueHtml(n, crit)
        : (busy ? `<div class="chapter-critique"><div class="crit-head">자체 피드백 생성 중…</div></div>` : "");
      // 액션 버튼/의견창은 작업 중이 아닐 때만.
      let actions = "";
      let noteBlock = "";
      if (!state.chapterRunning) {
        actions = `<div class="chapter-actions">
          <button class="mini" data-act="critique" data-n="${n}" ${busy ? "disabled" : ""}>${busy ? "피드백 생성 중…" : crit ? "🔄 다시 피드백" : "🔍 자체 피드백"}</button>
          ${crit ? `<button class="mini primary" data-act="apply" data-n="${n}">✦ 피드백 반영 보완</button>` : ""}
          <button class="mini" data-act="note" data-n="${n}">✎ 내 의견으로 수정</button>
        </div>`;
        noteBlock = state.noteOpen[n] ? `<div class="chapter-note">
          <textarea data-note="${n}" placeholder="이 회차를 어떻게 고칠지 적어주세요. 예: 중반 추격을 더 길게, 주인공을 더 능동적으로, 마지막 절단을 더 세게">${escapeHtml(state.noteDraft[n] || "")}</textarea>
          <button class="mini primary" data-act="applynote" data-n="${n}">이 의견으로 수정</button>
        </div>` : "";
      }
      return `<article class="chapter-block">${tag}${md}${actions}${critBlock}${noteBlock}</article>`;
    }).join('<hr class="chapter-sep" />');
  }
  return `<div class="chapter-studio">${controls}${outlineHtml()}${storyMemoryHtml()}${auditPanelHtml()}<div id="chapterList">${body}</div></div>`;
}

// 시즌 아웃라인 패널 — 기승전결 막 구조 + 도파민 비트 타임라인.
const BEAT_EMOJI = { 사이다: "💥", 각성: "⚡", 반전: "🔄", 보상: "🎁", 관계: "💗", 위기: "🔥", 떡밥: "🧩", 회수: "✅" };
function outlineHtml() {
  if (!state.outlineOpen) return "";
  if (state.outlineBusy) return `<div class="outline-panel"><div class="impact-loading"><span class="dot"></span> AI가 ${state.totalChapters}화 완결 기준 아웃라인을 설계 중…</div></div>`;
  const o = state.outline;
  const head = `<div class="ol-head">📐 시즌 아웃라인 <span class="ol-sub">${o ? `${o.total}화 완결 · 기승전결 + 도파민 비트` : "아직 없음"}</span>
    <button class="mini primary" id="outlineGen" type="button">${o ? "🔄 다시 설계" : "✨ 아웃라인 생성"}</button>
    <button class="mini" id="outlineClose" type="button">닫기</button></div>`;
  if (!o) return `<div class="outline-panel">${head}<div class="ol-empty">‘완결’ 화수(${state.totalChapters}화)에 맞춰 기승전결 4막과 회차별 도파민 비트를 설계합니다. 생성하면 각 회차 집필에 자동 주입됩니다.</div></div>`;

  const acts = (o.acts || []).map((a) => `
    <div class="ol-act">
      <div class="ol-act-h"><span class="ol-act-name">${escapeHtml(a.act)}</span><span class="ol-act-range">${a.from}~${a.to}화</span></div>
      <div class="ol-act-goal">${escapeHtml(a.goal || "")}</div>
      ${a.turn ? `<div class="ol-act-turn">↳ 전환점: ${escapeHtml(a.turn)}</div>` : ""}
      ${(a.events || []).length ? `<ul class="ol-events">${a.events.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>` : ""}
    </div>`).join("");
  const beats = (o.beats || []).map((b) => `<li class="ol-beat"><span class="ol-beat-n">${b.n}화</span><span class="ol-beat-t">${BEAT_EMOJI[b.type] || "•"} ${escapeHtml(b.type)}</span><span class="ol-beat-d">${escapeHtml(b.desc)}</span></li>`).join("");

  return `<div class="outline-panel">${head}
    ${o.logline ? `<div class="ol-logline">“${escapeHtml(o.logline)}”${o.endingType ? ` <span class="ol-ending">· ${escapeHtml(o.endingType)}</span>` : ""}</div>` : ""}
    <div class="ol-acts">${acts}</div>
    <div class="ol-beats-h">🎢 도파민 비트 (${(o.beats || []).length}) — 각 회차에 배치되어 집필 시 자동 주입</div>
    <ul class="ol-beats">${beats}</ul>
  </div>`;
}

async function generateOutline() {
  if (state.outlineBusy || state.chapterRunning) return;
  state.outlineBusy = true;
  state.outlineOpen = true;
  renderDraftStudio(el("outputPanel"));
  el("runStatus").textContent = "아웃라인 설계 중";
  try {
    const res = await fetch("/api/outline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: collectInput(), total: state.totalChapters, model: el("modelSelect").value }),
    });
    const data = await res.json();
    if (!data.ok || !data.outline) throw new Error(data.error || "아웃라인 생성 실패");
    state.outline = data.outline;
    el("runStatus").textContent = data.fallback ? "아웃라인 완료(폴백)" : "아웃라인 완료";
    toast(`${state.totalChapters}화 완결 아웃라인을 설계했습니다. 이제 회차 생성 시 자동 반영됩니다.`, "success");
  } catch (err) {
    el("runStatus").textContent = "오류";
    toast(err.message || "아웃라인 생성 실패", "error");
  } finally {
    state.outlineBusy = false;
    if (state.activeTab === "draft") renderDraftStudio(el("outputPanel"));
  }
}

// 누적 연재 메모리 패널(스토리 바이블) — 줄거리·미회수 떡밥·인물 현황·확정 설정을 한눈에.
function storyMemoryHtml() {
  if (!state.memoryOpen) return "";
  const nums = Object.keys(state.memories).map(Number).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
  if (!nums.length) return `<div class="story-bible"><div class="sb-head">🧭 연재 메모리</div><div class="sb-empty">아직 기록된 회차 메모리가 없습니다. 회차를 생성하면 자동으로 쌓입니다.</div></div>`;

  const norm = (s) => String(s).replace(/\s+/g, "").toLowerCase();
  const opened = [], resolved = [];
  const charState = new Map(); const canonSeen = new Set(); const canon = [];
  nums.forEach((n) => {
    const m = state.memories[n] || {};
    (m.threadsOpened || []).forEach((t) => opened.push(t));
    (m.threadsResolved || []).forEach((t) => resolved.push(t));
    (m.characters || []).forEach((c) => { if (c.name && c.state) charState.set(c.name, c.state); });
    (m.canon || []).forEach((c) => { const k = norm(c); if (k && !canonSeen.has(k)) { canonSeen.add(k); canon.push(c); } });
  });
  const resolvedNorm = resolved.map(norm);
  const seen = new Set(); const open = [];
  opened.forEach((t) => {
    const k = norm(t);
    if (!k || seen.has(k)) return; seen.add(k);
    if (!resolvedNorm.some((r) => r.includes(k) || k.includes(r))) open.push(t);
  });

  const synopsis = nums.map((n) => {
    const m = state.memories[n] || {};
    const busy = state.memoryBusy[n] ? ' <span class="sb-busy">갱신 중…</span>' : "";
    return `<li><b>${n}화</b>${m.title ? ` «${escapeHtml(m.title)}»` : ""}: ${escapeHtml(m.synopsis || "")}${busy}</li>`;
  }).join("");
  const list = (arr) => arr.map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  const chars = [...charState.entries()].map(([name, st]) => `<li><b>${escapeHtml(name)}</b> — ${escapeHtml(st)}</li>`).join("");

  return `<div class="story-bible">
    <div class="sb-head">🧭 연재 메모리 — 스토리 바이블 <span class="sb-sub">${nums.length}개 회차 기록 · 다음 회차 집필에 자동 주입됩니다</span>
      <button class="mini" id="memoryClose" type="button">닫기</button></div>
    <div class="sb-grid">
      <div class="sb-col sb-wide"><div class="sb-label">회차 줄거리</div><ul class="sb-syn">${synopsis}</ul></div>
      ${open.length ? `<div class="sb-col"><div class="sb-label warn">아직 회수되지 않은 떡밥·복선 (${open.length})</div><ul class="sb-open">${list(open)}</ul></div>` : ""}
      ${chars ? `<div class="sb-col"><div class="sb-label">인물 현재 상태</div><ul class="sb-char">${chars}</ul></div>` : ""}
      ${canon.length ? `<div class="sb-col"><div class="sb-label">확정 설정 (canon)</div><ul class="sb-canon">${list(canon)}</ul></div>` : ""}
    </div>
  </div>`;
}

function critiqueHtml(n, c) {
  const scores = Object.entries(c.scores || {}).map(([k, v]) => `${k} ${v}`).join(" · ");
  const list = (arr, cls) => (arr && arr.length)
    ? `<ul class="crit-${cls}">${arr.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : "";
  // 보완 전→후 비교 (하네스 결과)
  const b = state.critiqueBefore[n];
  let delta = "";
  if (b && b !== c) {
    const dO = (c.overall ?? 0) - (b.overall ?? 0);
    const dF = (c.formulaFit ?? 0) - (b.formulaFit ?? 0);
    const up = dO >= 0;
    delta = `<div class="crit-delta ${up && dO > 0 ? "up" : dO < 0 ? "down" : ""}">
      보완 전→후 · 종합 ${b.overall}→${c.overall} (${dO >= 0 ? "+" : ""}${dO}) · 공식충실 ${b.formulaFit ?? "-"}→${c.formulaFit ?? "-"} (${dF >= 0 ? "+" : ""}${dF})
    </div>`;
  }
  return `<div class="chapter-critique${c.fallback ? " fallback" : ""}">
    <div class="crit-head">자체 피드백 <strong>${c.overall ?? "-"}/100</strong>
      <span class="crit-fit">공식충실 ${c.formulaFit ?? "-"}/100</span>
      <span class="crit-scores">${scores}</span></div>
    ${delta}
    ${c.violations?.length ? `<div class="crit-label warn">⚠ 공식/실패패턴 위반</div>${list(c.violations, "bad")}` : ""}
    ${c.strengths?.length ? `<div class="crit-label">강점</div>${list(c.strengths, "good")}` : ""}
    ${c.weaknesses?.length ? `<div class="crit-label">약점</div>${list(c.weaknesses, "bad")}` : ""}
    ${c.fixes?.length ? `<div class="crit-label">수정 제안(공식·코어 기준)</div>${list(c.fixes, "fix")}` : ""}
  </div>`;
}

function renderDraftStudio(panel) {
  panel.innerHTML = draftStudioHtml();
  const batch = el("chapterBatch");
  if (batch) batch.addEventListener("change", () => {
    state.batchSize = Number(batch.value) || 1;
    localStorage.setItem("sfChapterBatch", String(state.batchSize));
    renderDraftStudio(panel);
  });
  const gen = el("chapterGen");
  if (gen) gen.addEventListener("click", generateChapters);
  const toEnd = el("chapterToEnd");
  if (toEnd) toEnd.addEventListener("click", generateToEnd);
  const season = el("seasonLen");
  if (season) season.addEventListener("change", () => {
    state.totalChapters = Number(season.value) || 25;
    localStorage.setItem("sfSeasonLen", String(state.totalChapters));
    renderDraftStudio(panel);
  });
  const auto = el("autoFeedback");
  if (auto) auto.addEventListener("change", () => {
    state.autoFeedback = auto.checked;
    localStorage.setItem("sfAutoFeedback", auto.checked ? "1" : "0");
  });
  const fp = el("autoFinalPass");
  if (fp) fp.addEventListener("change", () => {
    state.autoFinalPass = fp.checked;
    localStorage.setItem("sfAutoFinalPass", fp.checked ? "1" : "0");
  });
  const ap = el("autopilot");
  if (ap) ap.addEventListener("click", autopilot);
  const stop = el("chapterStop");
  if (stop) stop.addEventListener("click", () => { if (state.chapterController) state.chapterController.abort(); });
  const reset = el("chapterReset");
  if (reset) reset.addEventListener("click", resetChapters);
  const dl = el("novelDownload");
  if (dl) dl.addEventListener("click", downloadNovel);
  const cAll = el("critiqueAll");
  if (cAll) cAll.addEventListener("click", critiqueAll);
  const rAll = el("reviseAll");
  if (rAll) rAll.addEventListener("click", reviseAll);
  const aBtn = el("auditBtn");
  if (aBtn) aBtn.addEventListener("click", runAudit);
  const aRev = el("auditRevise");
  if (aRev) aRev.addEventListener("click", reviseFromAudit);
  const aClose = el("auditClose");
  if (aClose) aClose.addEventListener("click", () => { state.audit = null; renderDraftStudio(panel); });
  const memT = el("memoryToggle");
  if (memT) memT.addEventListener("click", () => { state.memoryOpen = !state.memoryOpen; renderDraftStudio(panel); });
  const memC = el("memoryClose");
  if (memC) memC.addEventListener("click", () => { state.memoryOpen = false; renderDraftStudio(panel); });
  const olT = el("outlineToggle");
  if (olT) olT.addEventListener("click", () => { state.outlineOpen = !state.outlineOpen; renderDraftStudio(panel); });
  const olGen = el("outlineGen");
  if (olGen) olGen.addEventListener("click", generateOutline);
  const olClose = el("outlineClose");
  if (olClose) olClose.addEventListener("click", () => { state.outlineOpen = false; renderDraftStudio(panel); });

  // 회차별 피드백/수정 액션 (이벤트 위임)
  panel.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", onChapterAction));
  panel.querySelectorAll("textarea[data-note]").forEach((t) =>
    t.addEventListener("input", () => { state.noteDraft[Number(t.dataset.note)] = t.value; }));
}

function onChapterAction(e) {
  const n = Number(e.currentTarget.dataset.n);
  const act = e.currentTarget.dataset.act;
  if (act === "critique") { delete state.critiqueBefore[n]; fetchCritique(n, false); return; }
  if (act === "apply") { applyFeedback(n); return; }
  if (act === "note") {
    state.noteOpen[n] = !state.noteOpen[n];
    if (state.activeTab === "draft") renderDraftStudio(el("outputPanel"));
    return;
  }
  if (act === "applynote") {
    const note = state.noteDraft[n];
    if (!note || !note.trim()) { toast("수정 의견을 입력하세요.", "warn"); return; }
    reviseChapter(n, note);
  }
}

function resetChapters() {
  if (state.chapterRunning) return;
  if (!confirm("2화 이후 생성한 원고를 삭제할까요? (1화 오프닝은 유지됩니다)")) return;
  state.chapters = {};
  state.memories = {}; // 연재 메모리도 함께 초기화(원고와 어긋나지 않도록)
  toast("연속 원고를 초기화했습니다.", "info");
  if (state.activeTab === "draft") renderDraftStudio(el("outputPanel"));
}

function currentMaxChapter() {
  const nums = chapterNumbers();
  return nums.length ? Math.max(...nums) : 0;
}

// 한 번의 /api/chapter 요청(여러 화 배치/수정)을 스트리밍 처리. running 상태는 호출부가 관리한다.
async function streamChapterRequest(from, count, opts = {}) {
  const prevText = from > 1 ? (chapterMap()[from - 1] || "") : "";
  const doneThisCall = [];
  const input = collectInput();
  const model = el("modelSelect").value || state.config.defaultModel;

  // 연속성 백필: from 미만인데 메모리가 없는 회차(파이프라인이 만든 1화·불러온 프로젝트 등)를
  // 먼저 요약해 둔다. 이게 있어야 이번 회차에 '지금까지의 이야기'가 온전히 주입된다.
  // (수정 모드는 같은 회차 재작성이라 백필이 불필요하므로 건너뛴다.)
  if (!opts.revise) {
    const map0 = chapterMap();
    for (let k = 1; k < from; k++) {
      if (state.chapterController?.signal.aborted) break;
      if (map0[k] && !state.memories[k]) await fetchSynopsis(k);
    }
  }
  const res = await fetch("/api/chapter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input, model, fromChapter: from, count, total: state.totalChapters, prevText,
      ctx: { foresight: state.buffers.foresight, world: state.buffers.world, plot: state.buffers.plot },
      memories: state.memories, // 연재 메모리(서버가 'from 미만'만 합성해 주입)
      outline: state.outline || undefined, // 시즌 아웃라인(회차별 막·도파민 비트 주입)
      revise: opts.revise || undefined,
    }),
    signal: state.chapterController.signal,
  });
  if (!res.ok || !res.body) throw new Error(`서버 오류 (HTTP ${res.status})`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buf.indexOf("\n\n")) !== -1) {
      const raw = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      let type = "message"; let dataLine = "";
      raw.split("\n").forEach((line) => {
        if (line.startsWith("event:")) type = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
      });
      if (!dataLine) continue;
      let d; try { d = JSON.parse(dataLine); } catch { continue; }
      if (type === "chapter-start") {
        state.streamingChapter = d.n;
        state.chapters[d.n] = "";
      } else if (type === "chapter-delta") {
        state.chapters[d.n] = (state.chapters[d.n] || "") + d.text;
        if (state.activeTab === "draft") renderDraftStudio(el("outputPanel"));
      } else if (type === "chapter-done") {
        state.lastRunChapters.push(d.n);
        doneThisCall.push(d.n);
        delete state.critiques[d.n]; // 새로/다시 쓰였으니 기존 피드백 무효화
      } else if (type === "error") {
        toast(d.message || "원고 생성 오류", "error");
      }
    }
  }
  // 이번 요청에서 완성된 회차의 '연재 메모리'를 생성한다(다음 배치의 연속성 컨텍스트).
  // 원고 스트림이 끝난 뒤에 돌리므로 본문 표시를 지연시키지 않는다.
  for (const n of doneThisCall) {
    if (state.chapterController?.signal.aborted) break;
    await fetchSynopsis(n);
  }
}

// 한 회차 원고 → 연재 메모리(요약·떡밥·인물·캐논)를 만들어 state.memories에 누적한다.
async function fetchSynopsis(n) {
  const text = chapterMap()[n];
  if (!text || !text.trim()) return;
  state.memoryBusy[n] = true;
  if (state.activeTab === "draft" && state.memoryOpen) renderDraftStudio(el("outputPanel"));
  try {
    const res = await fetch("/api/synopsis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: collectInput(), n, total: state.totalChapters,
        chapterText: text, model: el("modelSelect").value || state.config.defaultModel,
      }),
      signal: state.chapterController?.signal,
    });
    const data = await res.json();
    if (data.ok && data.memory) state.memories[n] = data.memory;
  } catch {
    // 메모리 생성 실패는 치명적이지 않다(연속성 보강이 비는 것뿐). 조용히 넘어간다.
  } finally {
    delete state.memoryBusy[n];
    if (state.activeTab === "draft") renderDraftStudio(el("outputPanel"));
  }
}

// 공통 실행 루프. toEnd=true면 결말(total)에 도달할 때까지 배치를 자동 반복한다.
async function runChapterLoop(from, toEnd) {
  if (state.chapterRunning || state.running) return;
  if (from > state.totalChapters) { toast(`이미 결말(${state.totalChapters}화)까지 생성했습니다.`, "warn"); return; }
  state.chapterRunning = true;
  state.streamingChapter = from;
  state.chapterController = new AbortController();
  state.lastRunChapters = [];
  renderDraftStudio(el("outputPanel"));
  try {
    let cursor = from;
    for (;;) {
      const batch = Math.min(state.batchSize || 1, state.totalChapters - cursor + 1);
      if (batch <= 0) break;
      el("runStatus").textContent = `원고 생성 중 (${cursor}~${cursor + batch - 1}/${state.totalChapters}화)`;
      await streamChapterRequest(cursor, batch);
      if (state.chapterController.signal.aborted) break;
      const maxCh = currentMaxChapter();
      if (!toEnd || maxCh >= state.totalChapters) break;
      cursor = maxCh + 1;
    }
    const reached = currentMaxChapter() >= state.totalChapters;
    el("runStatus").textContent = reached ? "결말까지 완성" : "원고 완료";
    toast(reached ? `결말(${state.totalChapters}화)까지 완성했습니다.` : "원고를 생성했습니다.", "success");
    // 자동 피드백: 이번에 생성한 회차들을 차례로 자체 평가한다.
    if (state.autoFeedback && state.lastRunChapters.length) {
      const targets = [...new Set(state.lastRunChapters)];
      el("runStatus").textContent = "자체 피드백 생성 중";
      for (const n of targets) {
        if (state.chapterController?.signal.aborted) break;
        await fetchCritique(n, true);
      }
      el("runStatus").textContent = "피드백 완료";
    }
  } catch (err) {
    if (err.name === "AbortError") { el("runStatus").textContent = "중단됨"; toast("원고 생성을 중단했습니다.", "warn"); }
    else { el("runStatus").textContent = "오류"; toast(err.message || "원고 생성 실패", "error"); }
  } finally {
    state.chapterRunning = false;
    state.chapterController = null;
    state.streamingChapter = null;
    if (state.activeTab === "draft") renderDraftStudio(el("outputPanel"));
    updateJourney(); // 회차 변화 후 진행 가이드 갱신
  }
}

// 다음 배치(state.batchSize) 1회만 생성.
function generateChapters() { return runChapterLoop(currentMaxChapter() + 1, false); }

// 결말(total)까지 자동 반복 생성.
function generateToEnd() { return runChapterLoop(currentMaxChapter() + 1, true); }

// 회차 자체 피드백 생성.
async function fetchCritique(n, silent) {
  const text = chapterMap()[n];
  if (!text) return;
  state.critiqueBusy[n] = true;
  if (state.activeTab === "draft") renderDraftStudio(el("outputPanel"));
  try {
    const res = await fetch("/api/critique", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        n, chapterText: text, input: collectInput(),
        model: el("modelSelect").value, ctx: { plot: state.buffers.plot },
      }),
    });
    const data = await res.json();
    if (data.ok && data.critique) {
      state.critiques[n] = data.critique;
      if (!silent) toast(`${n}화 자체 피드백 완료 (${data.critique.overall}/100)`, "success");
    } else if (!silent) toast("피드백 생성 실패", "error");
  } catch {
    if (!silent) toast("피드백 생성 실패", "error");
  } finally {
    state.critiqueBusy[n] = false;
    if (state.activeTab === "draft") renderDraftStudio(el("outputPanel"));
  }
}

// 전자동: from~N 까지 [생성 → 피드백 → 보완] 반복, 끝에 마무리 전체 보완 1회.
async function autopilot() {
  if (state.chapterRunning || state.running) return;
  const N = state.totalChapters;
  const from = currentMaxChapter() + 1;
  const finalPass = state.autoFinalPass;
  if (from > N && !finalPass) { toast(`이미 ${N}화까지 생성했습니다.`, "warn"); return; }
  const steps = [
    from <= N ? `· ${from}~${N}화: 각 화 [생성 → 자체 피드백 → 보완]` : "",
    finalPass ? "· 마무리: 전체 회차 [피드백 → 보완] 1회" : "",
  ].filter(Boolean).join("\n");
  if (!confirm(`전자동 집필을 시작합니다.\n${steps}\n\n회차마다 생성+재집필이라 호출이 매우 많고 오래 걸립니다(언제든 중단 가능). 진행할까요?`)) return;

  state.chapterRunning = true;
  state.chapterController = new AbortController();
  state.lastRunChapters = [];
  renderDraftStudio(el("outputPanel"));
  const aborted = () => Boolean(state.chapterController?.signal.aborted);
  try {
    // 1) 회차별: 생성 → 피드백 → 보완 (harnessRefine = 전 평가 → 재집필 → 후 평가)
    for (let n = from; n <= N; n++) {
      if (aborted()) break;
      el("runStatus").textContent = `전자동 ${n}/${N} — 생성`;
      state.streamingChapter = n;
      await streamChapterRequest(n, 1);
      if (aborted()) break;
      el("runStatus").textContent = `전자동 ${n}/${N} — 피드백·보완`;
      await harnessRefine(n, { maxAttempts: 1 });
    }
    // 2) 마무리: 전체 회차 한번 더 피드백 + 보완
    if (finalPass && !aborted()) {
      const nums = chapterNumbers();
      for (const n of nums) {
        if (aborted()) break;
        el("runStatus").textContent = `마무리 전체보완 — ${n}/${nums.length}화`;
        await harnessRefine(n, { maxAttempts: 1 });
      }
    }
    el("runStatus").textContent = aborted() ? "중단됨" : "전자동 완료";
    toast(aborted() ? "전자동을 중단했습니다." : `전자동 완료 (~${N}화)`, aborted() ? "warn" : "success");
  } catch (err) {
    if (err.name === "AbortError") { el("runStatus").textContent = "중단됨"; toast("전자동을 중단했습니다.", "warn"); }
    else { el("runStatus").textContent = "오류"; toast(err.message || "전자동 실패", "error"); }
  } finally {
    state.chapterRunning = false;
    state.chapterController = null;
    state.streamingChapter = null;
    if (state.activeTab === "draft") renderDraftStudio(el("outputPanel"));
    updateJourney(); // 회차 변화 후 진행 가이드 갱신
  }
}

// 전체 회차 한번에 자체 피드백.
async function critiqueAll() {
  if (state.chapterRunning || state.running) return;
  const nums = chapterNumbers();
  if (!nums.length) return;
  state.chapterRunning = true;
  state.chapterController = new AbortController();
  renderDraftStudio(el("outputPanel"));
  let done = 0;
  try {
    for (const n of nums) {
      if (state.chapterController.signal.aborted) break;
      el("runStatus").textContent = `전체 피드백 ${++done}/${nums.length}화`;
      await fetchCritique(n, true);
    }
    el("runStatus").textContent = "전체 피드백 완료";
    toast(`전체 피드백 완료 (${done}화)`, "success");
  } catch {
    el("runStatus").textContent = "오류";
  } finally {
    state.chapterRunning = false;
    state.chapterController = null;
    if (state.activeTab === "draft") renderDraftStudio(el("outputPanel"));
  }
}

// 피드백을 '하네스 수정 지침'으로 변환 (위반·약점·수정지시를 공식 기준으로 묶음).
function fixesToNote(c) {
  const parts = [`2차 보완 목표: 자체 비평 90점 이상(현재 ${typeof c?.overall === "number" ? c.overall : "?"}점). 1차보다 반드시 상승시킨다.`];
  // 6축 중 가장 낮은 2개를 지목해 집중 보강하게 한다.
  if (c?.scores && typeof c.scores === "object") {
    const low = Object.entries(c.scores)
      .filter(([, v]) => typeof v === "number")
      .sort((a, b) => a[1] - b[1])
      .slice(0, 2)
      .map(([k, v]) => `${k}(${v}/10)`);
    if (low.length) parts.push(`낮았던 축(집중 보강): ${low.join(", ")} — 이 축을 끌어올릴 장면을 추가·교체하라.`);
  }
  if (c?.violations?.length) parts.push(`반드시 제거할 공식/실패패턴 위반: ${c.violations.join(" / ")}`);
  if (c?.weaknesses?.length) parts.push(`고칠 약점: ${c.weaknesses.join(" / ")}`);
  if (c?.fixes?.length) parts.push(`적용할 수정 지시:\n- ${c.fixes.join("\n- ")}`);
  if (typeof c?.formulaFit === "number") parts.push(`현재 공식충실 ${c.formulaFit}/100 — 결핍→특권→검증→즉시보상(수치/지위/관계)→세계확장 한 사이클을 확실히 이행하고, 보상을 1차보다 더 구체적인 수치로 박아 이 점수를 끌어올려라.`);
  return parts.join("\n");
}

// 하네스 보완 루프: before 평가 → 재집필 → after 재평가 → (개선 안 되면) 다시 조인다. 잠금은 호출부가 관리.
async function harnessRefine(n, opts = {}) {
  const maxAttempts = opts.maxAttempts || 2;
  if (!state.critiques[n]) await fetchCritique(n, true);
  const before = state.critiques[n];
  if (!before) return;
  state.critiqueBefore[n] = before;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (state.chapterController?.signal.aborted) return;
    const basis = state.critiques[n] || before;
    state.streamingChapter = n;
    el("runStatus").textContent = `${n}화 보완 ${attempt}/${maxAttempts} (재집필)`;
    await streamChapterRequest(n, 1, { revise: { note: fixesToNote(basis), original: chapterMap()[n] } });
    if (state.chapterController?.signal.aborted) return;
    el("runStatus").textContent = `${n}화 보완 후 재평가`;
    await fetchCritique(n, true); // after — critiqueBefore[n]은 유지됨
    const after = state.critiques[n];
    if (after && after.overall > before.overall && (after.formulaFit ?? 0) >= (before.formulaFit ?? 0)) break; // 개선 확인 → 종료
    // 개선 미흡 → 다음 시도에서 더 강하게 조인다(basis가 최신 after로 갱신됨).
  }
}

// 단일 회차 '피드백 반영 보완' (하네스 2회까지).
async function applyFeedback(n) {
  if (state.chapterRunning || state.running) return;
  state.chapterRunning = true;
  state.chapterController = new AbortController();
  renderDraftStudio(el("outputPanel"));
  try {
    await harnessRefine(n, { maxAttempts: 2 });
    const b = state.critiqueBefore[n]?.overall, a = state.critiques[n]?.overall;
    el("runStatus").textContent = "보완 완료";
    // 점수를 못 읽었으면(둘 중 하나라도 누락) 실패가 아니라 중립으로 안내한다.
    const kind = (Number.isFinite(a) && Number.isFinite(b)) ? (a >= b ? "success" : "warn") : "info";
    toast(`${n}화 보완: 종합 ${b ?? "-"} → ${a ?? "-"}`, kind);
  } catch (err) {
    if (err.name === "AbortError") { el("runStatus").textContent = "중단됨"; toast("보완을 중단했습니다.", "warn"); }
    else { el("runStatus").textContent = "오류"; toast(err.message || "보완 실패", "error"); }
  } finally {
    state.chapterRunning = false;
    state.chapterController = null;
    state.streamingChapter = null;
    if (state.activeTab === "draft") renderDraftStudio(el("outputPanel"));
    updateJourney(); // 회차 변화 후 진행 가이드 갱신
  }
}

// 전체 회차를 각자의 피드백대로 한번에 보완(1→마지막 순서, 앞 수정이 뒤로 이어짐).
async function reviseAll() {
  if (state.chapterRunning || state.running) return;
  const nums = chapterNumbers();
  if (!nums.length) return;
  if (!confirm(`${nums.length}개 회차를 각자의 피드백(공식·코어 기준)에 따라 전체 보완합니다.\n회차마다 [평가→재집필→재평가] 하네스를 돌려 before→after를 남깁니다. 시간이 오래 걸립니다(중단 가능). 진행할까요?`)) return;
  state.chapterRunning = true;
  state.chapterController = new AbortController();
  renderDraftStudio(el("outputPanel"));
  let done = 0;
  try {
    for (const n of nums) {
      if (state.chapterController.signal.aborted) break;
      el("runStatus").textContent = `전체 보완 ${++done}/${nums.length} — ${n}화`;
      await harnessRefine(n, { maxAttempts: 1 }); // 비용 고려: 회차당 1회 보완 + 재평가
    }
    el("runStatus").textContent = "전체 보완 완료";
    toast(`전체 보완 완료 (${done}화)`, "success");
  } catch (err) {
    if (err.name === "AbortError") { el("runStatus").textContent = "중단됨"; toast("전체 보완을 중단했습니다.", "warn"); }
    else { el("runStatus").textContent = "오류"; toast(err.message || "전체 보완 실패", "error"); }
  } finally {
    state.chapterRunning = false;
    state.chapterController = null;
    state.streamingChapter = null;
    if (state.activeTab === "draft") renderDraftStudio(el("outputPanel"));
    updateJourney(); // 회차 변화 후 진행 가이드 갱신
  }
}

// 회차를 지침(피드백 또는 사용자 의견)에 따라 제자리에서 다시 쓴다.
async function reviseChapter(n, note) {
  if (state.chapterRunning || state.running) return;
  note = String(note || "").trim();
  if (!note) { toast("수정 지침이 없습니다.", "warn"); return; }
  const original = chapterMap()[n];
  if (!original) return;
  state.chapterRunning = true;
  state.streamingChapter = n;
  state.chapterController = new AbortController();
  state.noteOpen[n] = false;
  el("runStatus").textContent = `${n}화 수정 중`;
  renderDraftStudio(el("outputPanel"));
  try {
    await streamChapterRequest(n, 1, { revise: { note, original } });
    el("runStatus").textContent = `${n}화 수정 완료`;
    toast(`${n}화를 수정했습니다.`, "success");
  } catch (err) {
    if (err.name === "AbortError") { el("runStatus").textContent = "중단됨"; toast("수정을 중단했습니다.", "warn"); }
    else { el("runStatus").textContent = "오류"; toast(err.message || "수정 실패", "error"); }
  } finally {
    state.chapterRunning = false;
    state.chapterController = null;
    state.streamingChapter = null;
    if (state.activeTab === "draft") renderDraftStudio(el("outputPanel"));
    updateJourney(); // 회차 변화 후 진행 가이드 갱신
  }
}

/* --------------------------- 기획 아키텍트 ------------------------------ */

// 아이디어 한 줄 → LLM이 Core IP 폼 전체를 자동 기획해 채운다.
async function ideateFill() {
  const idea = el("ideaInput").value.trim();
  if (!idea) { toast("아이디어를 한 줄 입력하세요.", "warn"); el("ideaInput").focus(); return; }
  if (state.running) return;

  const btn = el("ideateBtn");
  const label = btn.querySelector("span:last-child");
  const prev = label.textContent;
  btn.disabled = true;
  label.textContent = "기획 생성 중…";
  el("runStatus").textContent = "기획 생성 중";

  try {
    const res = await fetch("/api/ideate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea, genre: el("genre").value, subgenre: el("subgenre").value, blendGenres: collectInput().blendGenres, medium: el("medium").value, format: el("format").value, model: el("modelSelect").value }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "기획 생성 실패");
    const f = data.fields || {};

    // 모델이 더 적합한 장르를 골랐으면 먼저 반영한다.
    if (f.genre && el("genre").querySelector(`option[value="${f.genre}"]`)) {
      el("genre").value = f.genre;
    }
    // 반환된 필드를 폼에 채운다(텍스트 필드만).
    Object.entries(f).forEach(([k, v]) => {
      if (k === "genre") return;
      const node = el(k);
      if (node && typeof v === "string" && node.type !== "checkbox") node.value = v;
    });
    // 바뀐 장르에 맞춰 라벨만 갱신(프리셋으로 덮어쓰지 않음).
    await onGenreChange(false);
    if (el("ipTitle").value) el("workspaceTitle").textContent = el("ipTitle").value;
    localStorage.setItem("sfAgentInput", JSON.stringify(collectInput()));
    updateJourney();

    el("runStatus").textContent = data.fallback ? "기획 채움(폴백)" : "기획 채움";
    toast(
      data.fallback
        ? "기획을 채웠습니다(로컬 폴백). 키/구독 연결 시 더 정교해집니다."
        : "아이디어로 Core IP 기획을 채웠습니다. 검토 후 ‘실행’을 누르세요.",
      "success",
    );
  } catch (err) {
    el("runStatus").textContent = "오류";
    toast(err.message || "기획 생성 실패", "error");
  } finally {
    btn.disabled = false;
    label.textContent = prev;
  }
}

// 아는 만큼만 채우고 '빈 칸만' AI로 보강한다. 채워진 항목은 절대 덮어쓰지 않는다.
async function completeFill() {
  if (state.running) return;
  const input = collectInput();
  const idea = el("ideaInput").value.trim();
  const filledCount = PRESET_FIELDS.filter((k) => String(input[k] ?? "").trim()).length;
  if (!filledCount && !idea) {
    toast("아는 항목을 한두 개라도 먼저 채워주세요. (제목·로그라인·주인공 등)", "warn");
    return;
  }
  const btn = el("completeBtn");
  const label = btn.querySelector("span");
  const prev = label.textContent;
  btn.disabled = true;
  label.textContent = "빈 칸 채우는 중…";
  el("runStatus").textContent = "빈 칸 보강 중";

  try {
    const res = await fetch("/api/ideate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "complete", idea, input,
        genre: el("genre").value, subgenre: el("subgenre").value,
        blendGenres: input.blendGenres, model: el("modelSelect").value,
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "보강 실패");
    const f = data.fields || {};

    // 핵심: '비어 있는' 텍스트 필드에만 적용한다(작가가 채운 값은 절대 덮지 않음).
    let applied = 0;
    Object.entries(f).forEach(([k, v]) => {
      if (k === "genre") return;
      const node = el(k);
      if (node && typeof v === "string" && node.type !== "checkbox" && !node.value.trim() && v.trim()) {
        node.value = v.trim();
        applied++;
      }
    });
    if (el("ipTitle").value) el("workspaceTitle").textContent = el("ipTitle").value;
    localStorage.setItem("sfAgentInput", JSON.stringify(collectInput()));
    updateJourney();
    el("runStatus").textContent = applied ? "빈 칸 보강 완료" : "보강 없음";
    toast(
      applied
        ? `빈 칸 ${applied}개를 채웠습니다${data.fallback ? "(폴백)" : ""}. 채워두신 항목은 그대로 유지했습니다.`
        : "이미 대부분 채워져 있어 보강할 빈 칸이 없습니다.",
      applied ? "success" : "info",
    );
  } catch (err) {
    el("runStatus").textContent = "오류";
    toast(err.message || "보강 실패", "error");
  } finally {
    btn.disabled = false;
    label.textContent = prev;
  }
}

/* --------------------- AI 임팩트 리포트 (Before → After) --------------------- */

async function runImpact() {
  const idea = el("ideaInput").value.trim();
  const input = collectInput();
  if (!idea && !input.logline && !input.sfPremise) {
    toast("아이디어 한 줄을 입력하거나 기획을 먼저 채워 주세요.", "warn");
    el("ideaInput").focus();
    return;
  }
  const btn = el("impactBtn");
  const label = btn.querySelector("span:last-child");
  const prev = label.textContent;
  btn.disabled = true;
  label.textContent = "AI가 진단 중…";
  el("runStatus").textContent = "Before/After 진단 중";
  // 모달을 먼저 열고 로딩을 보여준다.
  openImpactModal(`<div class="impact-loading"><span class="dot"></span> AI가 이 아이디어의 <b>Before / After</b>를 진단하고 있습니다…</div>`);

  try {
    const res = await fetch("/api/impact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea, input, genre: el("genre").value, subgenre: el("subgenre").value, model: el("modelSelect").value }),
    });
    const data = await res.json();
    if (!data.ok || !data.impact) throw new Error(data.error || "진단 실패");
    state.lastImpact = data.impact;
    el("impactBody").innerHTML = impactHtml(data.impact, data.fallback);
    bindImpactActions();
    el("runStatus").textContent = data.fallback ? "진단 완료(폴백)" : "진단 완료";
  } catch (err) {
    el("impactBody").innerHTML = `<div class="impact-loading">진단에 실패했습니다: ${escapeHtml(err.message || "")}</div>`;
    el("runStatus").textContent = "오류";
  } finally {
    btn.disabled = false;
    label.textContent = prev;
  }
}

function openImpactModal(innerHtml) {
  el("impactBody").innerHTML = innerHtml;
  const m = el("impactModal");
  m.hidden = false;
  document.body.classList.add("modal-open");
}

function closeImpactModal() {
  el("impactModal").hidden = true;
  document.body.classList.remove("modal-open");
}

function impactHtml(imp, fallback) {
  const b = imp.before || {}, a = imp.after || {};
  const gain = (a.score ?? 0) - (b.score ?? 0);
  const li = (arr) => (arr || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  const titles = (a.titles || []).map((t) => `<span class="imp-title">${escapeHtml(t)}</span>`).join("");

  return `
    <div class="impact-report">
      <div class="imp-top">
        <span class="imp-eyebrow">🎯 AI 임팩트 리포트${fallback ? " · 로컬 폴백" : ""}</span>
        <h2 class="imp-verdict">${escapeHtml(imp.verdict || "이 아이디어의 가능성 진단")}</h2>
        ${imp.genreFit ? `<p class="imp-genre">추천 결: <strong>${escapeHtml(imp.genreFit)}</strong></p>` : ""}
      </div>

      <div class="imp-scoreline">
        <div class="imp-score before"><span class="imp-score-label">혼자 쓸 때</span><span class="imp-score-num">${b.score ?? "—"}</span><span class="imp-score-unit">/100</span></div>
        <div class="imp-arrow">→<span class="imp-gain">+${gain}</span></div>
        <div class="imp-score after"><span class="imp-score-label">이 솔루션 통과 후</span><span class="imp-score-num">${a.score ?? "—"}</span><span class="imp-score-unit">/100</span></div>
      </div>

      <div class="imp-cols">
        <div class="imp-col imp-before">
          <div class="imp-col-head">BEFORE · 혼자 막연하게 쓰면</div>
          ${b.logline ? `<div class="imp-field"><span class="imp-k">로그라인</span><p class="imp-plain">“${escapeHtml(b.logline)}”</p></div>` : ""}
          ${b.title ? `<div class="imp-field"><span class="imp-k">제목</span><p class="imp-plain">${escapeHtml(b.title)}</p></div>` : ""}
          ${b.missing?.length ? `<div class="imp-field"><span class="imp-k">빠져 있는 흥행 요소</span><ul class="imp-bad">${li(b.missing)}</ul></div>` : ""}
          ${b.risks?.length ? `<div class="imp-field"><span class="imp-k warn">혼자 연재하면 터질 문제</span><ul class="imp-risk">${li(b.risks)}</ul></div>` : ""}
        </div>
        <div class="imp-col imp-after">
          <div class="imp-col-head">AFTER · 이 솔루션을 쓰면</div>
          ${a.logline ? `<div class="imp-field"><span class="imp-k">흥행형 로그라인</span><p class="imp-strong">“${escapeHtml(a.logline)}”</p></div>` : ""}
          ${titles ? `<div class="imp-field"><span class="imp-k">클릭되는 제목</span><div class="imp-titles">${titles}</div></div>` : ""}
          ${a.hook ? `<div class="imp-field"><span class="imp-k">1화 오프닝 훅</span><p class="imp-hook">${escapeHtml(a.hook)}</p></div>` : ""}
          ${a.upgrades?.length ? `<div class="imp-field"><span class="imp-k">AI가 보강하는 것</span><ul class="imp-good">${li(a.upgrades)}</ul></div>` : ""}
          ${a.guarantees?.length ? `<div class="imp-field"><span class="imp-k ok">이 솔루션이 보장</span><ul class="imp-guar">${li(a.guarantees)}</ul></div>` : ""}
        </div>
      </div>

      ${imp.keyChanges?.length ? `<div class="imp-changes"><span class="imp-k">핵심 변화</span><ul>${li(imp.keyChanges)}</ul></div>` : ""}

      <div class="imp-cta">
        <button class="command primary" id="impactApply" type="button"><span>이대로 Core IP 기획 채우기 →</span></button>
        <button class="command" id="impactDismiss" type="button"><span>닫기</span></button>
      </div>
    </div>`;
}

function bindImpactActions() {
  const apply = el("impactApply");
  if (apply) apply.addEventListener("click", async () => {
    closeImpactModal();
    await ideateFill(); // AFTER를 실제 폼으로 — 진단이 곧바로 산출물로 이어진다.
  });
  const dismiss = el("impactDismiss");
  if (dismiss) dismiss.addEventListener("click", closeImpactModal);
}

/* ------------------------ AI 글쓰기 도구상자 ------------------------ */

const TOOL_DEFS = {
  brainstorm: { label: "💡 브레인스토밍", inputLabel: "주제", ph: "예: 주인공이 정체를 들킨 다음 전개",
    modes: { next: "다음 전개", twist: "반전", title: "제목 후보", name: "인물 이름", power: "능력·설정", conflict: "갈등·사건", free: "자유 주제" } },
  describe: { label: "🖼️ 묘사 강화", inputLabel: "묘사할 대상/장면", ph: "예: 비 내리는 폐허가 된 마법탑" },
  rewrite: { label: "✏️ 다시쓰기", inputLabel: "다시 쓸 문단", ph: "다시 쓸 문단을 붙여넣으세요",
    modes: { vivid: "더 생생하게", tense: "더 긴장감 있게", concise: "더 간결하게", emotional: "감정 깊게", formal: "문어체로", casual: "구어체로" } },
  expand: { label: "➕ 확장", inputLabel: "늘릴 문단", ph: "확장할 문단을 붙여넣으세요" },
  shrink: { label: "➖ 압축", inputLabel: "줄일 문단", ph: "압축할 문단을 붙여넣으세요" },
  names: { label: "🏷️ 이름 짓기", inputLabel: "요청(선택)", ph: "예: 차갑고 단단한 여검사 이름" },
};
const TOOL_ORDER = ["brainstorm", "describe", "rewrite", "expand", "shrink", "names"];

function openToolbox(initialTool = "brainstorm", prefill = "") {
  el("toolModal").hidden = false;
  document.body.classList.add("modal-open");
  el("toolTabs").innerHTML = TOOL_ORDER.map((k) =>
    `<button class="tool-tab" type="button" data-tool="${k}">${TOOL_DEFS[k].label}</button>`).join("");
  el("toolTabs").querySelectorAll("[data-tool]").forEach((b) =>
    b.addEventListener("click", () => selectTool(b.dataset.tool)));
  el("toolResult").hidden = true;
  el("toolResult").innerHTML = "";
  if (prefill) el("toolInput").value = prefill;
  selectTool(initialTool);
}

function closeToolbox() {
  el("toolModal").hidden = true;
  document.body.classList.remove("modal-open");
}

function selectTool(key) {
  state.tool = key;
  const def = TOOL_DEFS[key];
  el("toolTabs").querySelectorAll("[data-tool]").forEach((b) =>
    b.classList.toggle("active", b.dataset.tool === key));
  el("toolInputLabel").textContent = def.inputLabel;
  el("toolInput").placeholder = def.ph;
  const sel = el("toolMode");
  if (def.modes) {
    sel.hidden = false;
    sel.innerHTML = Object.entries(def.modes).map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
  } else {
    sel.hidden = true;
    sel.innerHTML = "";
  }
}

async function runTool() {
  const tool = state.tool || "brainstorm";
  const def = TOOL_DEFS[tool];
  const text = el("toolInput").value.trim();
  if (def.inputLabel !== "요청(선택)" && !text) { toast("내용을 입력하세요.", "warn"); el("toolInput").focus(); return; }
  const mode = el("toolMode").hidden ? "" : el("toolMode").value;
  const ctx = { genre: el("genre").value, tone: el("tone")?.value || "", protagonist: el("protagonist")?.value || "" };

  const btn = el("toolRun");
  const label = btn.querySelector("span:last-child");
  const prev = label.textContent;
  btn.disabled = true;
  label.textContent = "생성 중…";
  el("toolResult").hidden = false;
  // 스트리밍: 결과가 실시간으로 쌓인다.
  el("toolResult").innerHTML = `<div class="tool-result-actions"><span class="tool-result-tag">${def.label}</span></div><div class="md-output" id="toolStream"></div>`;
  const streamEl = el("toolStream");

  try {
    const res = await fetch("/api/tool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, text, mode, ctx, model: el("modelSelect").value }),
    });
    if (!res.body) throw new Error("스트리밍 미지원");
    const reader = res.body.getReader(); const dec = new TextDecoder();
    let buf = ""; let acc = ""; let fallback = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let sep;
      while ((sep = buf.indexOf("\n\n")) !== -1) {
        const raw = buf.slice(0, sep); buf = buf.slice(sep + 2);
        let type = "message"; let dataLine = "";
        raw.split("\n").forEach((l) => { if (l.startsWith("event:")) type = l.slice(6).trim(); else if (l.startsWith("data:")) dataLine += l.slice(5).trim(); });
        if (!dataLine) continue;
        let d; try { d = JSON.parse(dataLine); } catch { continue; }
        if (type === "delta" && d.text) { acc += d.text; if (streamEl) streamEl.innerHTML = window.renderMarkdown(acc) + '<span class="cursor"></span>'; }
        if (type === "done") { if (d.result) acc = d.result; if (d.fallback) fallback = true; }
      }
    }
    state.lastToolResult = acc;
    if (streamEl) streamEl.innerHTML = window.renderMarkdown(acc);
    // 복사 버튼
    el("toolResult").innerHTML =
      `<div class="tool-result-actions">
        <span class="tool-result-tag">${def.label}${fallback ? " · 폴백" : ""}</span>
        <button class="mini" id="toolCopy" type="button">📋 복사</button>
       </div>
       <div class="md-output">${window.renderMarkdown(acc)}</div>`;
    el("toolCopy")?.addEventListener("click", () =>
      navigator.clipboard.writeText(state.lastToolResult).then(() => toast("복사했습니다.", "success"), () => toast("직접 선택해 복사하세요.", "warn")));
  } catch (err) {
    el("toolResult").innerHTML = `<div class="impact-loading">생성 실패: ${escapeHtml(err.message || "")}</div>`;
  } finally {
    btn.disabled = false;
    label.textContent = prev;
  }
}

/* ----------------------- 🎬 매체 작업대 ----------------------- */

function openMediaModal() {
  if (state.studio !== "production" || currentMedium() === "webnovel") {
    toast("매체(애니/영화/다큐/드라마/광고)를 먼저 선택하세요.", "warn"); return;
  }
  const medium = currentMedium();
  el("mediaModalTitle").textContent = `${MEDIUM_LABELS_KO[medium] || "매체"} 작업대`;
  el("mediaToolpack").innerHTML = `<span class="section-hint" style="margin:0 6px 0 0">제작 도구팩:</span>` +
    MEDIA_TOOLPACK.map(([t, label]) => `<button class="command" type="button" data-media-tool="${t}">${label}</button>`).join("");
  // 변환 대상에서 현재 매체는 비활성(같은 매체 변환 방지).
  Array.from(el("convertTarget").options).forEach((o) => { o.disabled = (o.value === medium); });
  if (el("convertTarget").value === medium) {
    const first = Array.from(el("convertTarget").options).find((o) => !o.disabled);
    if (first) el("convertTarget").value = first.value;
  }
  el("mediaResult").hidden = true;
  el("mediaResult").innerHTML = "";
  el("mediaModal").hidden = false;
  document.body.classList.add("modal-open");
}

function closeMediaModal() {
  el("mediaModal").hidden = true;
  document.body.classList.remove("modal-open");
}

// 모든 매체 산출물(탭) 발췌 결합 — 심사·변환용 digest.
function mediaDigest() {
  return AGENTS.map((a) => {
    const t = (state.buffers[a.id] || "").trim();
    return t ? `# ${a.name}\n${t}` : "";
  }).filter(Boolean).join("\n\n");
}

function mediaResultEl() { const r = el("mediaResult"); r.hidden = false; return r; }
function mediaBusy(msg) { mediaResultEl().innerHTML = `<div class="impact-loading"><span class="dot"></span>${escapeHtml(msg)}</div>`; }

// SSE 스트리밍을 mediaResult로 받아 렌더(변환·도구팩).
async function mediaStream(url, body, tag) {
  mediaBusy(`${tag} 생성 중…`);
  const controller = new AbortController();
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    if (!res.ok || !res.body) throw new Error(`서버 오류 (HTTP ${res.status})`);
    const reader = res.body.getReader(); const decoder = new TextDecoder();
    let buf = "", acc = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let sep;
      while ((sep = buf.indexOf("\n\n")) !== -1) {
        const raw = buf.slice(0, sep); buf = buf.slice(sep + 2);
        let type = "message", dataLine = "";
        raw.split("\n").forEach((line) => { if (line.startsWith("event:")) type = line.slice(6).trim(); else if (line.startsWith("data:")) dataLine += line.slice(5).trim(); });
        if (!dataLine) continue;
        let d; try { d = JSON.parse(dataLine); } catch { continue; }
        if (type === "delta" && d.text) { acc += d.text; mediaResultEl().innerHTML = window.renderMarkdown(acc); }
        else if (type === "done") { acc = d.result || acc; }
      }
    }
    mediaResultEl().innerHTML = `<div class="tool-result-actions"><span class="tool-result-tag">${escapeHtml(tag)}</span></div><div class="md-output">${window.renderMarkdown(acc)}</div>`;
    return acc;
  } catch (err) {
    mediaResultEl().innerHTML = `<div class="impact-loading">실패: ${escapeHtml(err.message || "")}</div>`;
  }
}

async function mediaPost(url, body) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}

async function mediaCritiqueAction() {
  const id = state.activeTab;
  const agent = AGENTS.find((a) => a.id === id);
  const text = (state.buffers[id] || "").trim();
  if (!agent || !text) { toast("먼저 산출물을 생성한 뒤, 평가할 탭을 여세요.", "warn"); return; }
  mediaBusy(`'${agent.name}' 평가 중…`);
  try {
    const data = await mediaPost("/api/media-critique", { input: collectInput(), medium: currentMedium(), format: el("format").value, targetName: agent.name, text, model: el("modelSelect").value });
    if (!data.ok || !data.critique) throw new Error(data.error || "평가 실패");
    mediaResultEl().innerHTML = renderMediaCritique(agent.name, data.critique);
  } catch (err) { mediaResultEl().innerHTML = `<div class="impact-loading">평가 실패: ${escapeHtml(err.message || "")}</div>`; }
}

function renderMediaCritique(name, c) {
  const rows = Object.entries(c.scores || {}).map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${v}/10</td></tr>`).join("");
  const list = (arr) => (arr || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  return `<div class="md-output">
    <h3>📊 ${escapeHtml(name)} 평가 — 총점 ${c.overall}/100 · 방정식충실도 ${c.equationFit}/100</h3>
    <table><tbody>${rows}</tbody></table>
    ${c.violations && c.violations.length ? `<p><strong>⚠ 위반</strong></p><ul>${list(c.violations)}</ul>` : ""}
    ${c.weaknesses && c.weaknesses.length ? `<p><strong>약점</strong></p><ul>${list(c.weaknesses)}</ul>` : ""}
    <p><strong>✅ 개선 지시</strong></p><ul>${list(c.fixes)}</ul>
  </div>`;
}

async function mediaAuditAction() {
  const digest = mediaDigest();
  if (!digest.trim()) { toast("먼저 매체 파이프라인을 실행해 산출물을 만드세요.", "warn"); return; }
  mediaBusy("완성도 심사 중…");
  try {
    const data = await mediaPost("/api/media-audit", { input: collectInput(), medium: currentMedium(), format: el("format").value, digest, model: el("modelSelect").value });
    if (!data.ok || !data.audit) throw new Error(data.error || "심사 실패");
    mediaResultEl().innerHTML = renderMediaAudit(data.audit);
  } catch (err) { mediaResultEl().innerHTML = `<div class="impact-loading">심사 실패: ${escapeHtml(err.message || "")}</div>`; }
}

function renderMediaAudit(a) {
  const dims = Object.entries(a.dimensions || {}).map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${v}/100</td></tr>`).join("");
  const fatal = (a.fatalWeaknesses || []).map((w) => `<li><strong>${escapeHtml(w.issue || "")}</strong> — ${escapeHtml(w.why || "")}</li>`).join("");
  const plan = (a.revisionPlan || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  return `<div class="md-output">
    <h3>🏅 완성도 심사 — ${a.overall}/100</h3>
    <p>${escapeHtml(a.grade || "")}</p>
    <table><tbody>${dims}</tbody></table>
    ${fatal ? `<p><strong>치명적 약점</strong></p><ul>${fatal}</ul>` : ""}
    ${plan ? `<p><strong>보강 로드맵</strong></p><ul>${plan}</ul>` : ""}
    <p><em>${escapeHtml(a.verdict || "")}</em></p>
  </div>`;
}

async function mediaConvertAction() {
  const to = el("convertTarget").value;
  const from = currentMedium();
  if (to === from) { toast("다른 매체를 선택하세요.", "warn"); return; }
  await mediaStream("/api/convert", { input: collectInput(), fromMedium: from, toMedium: to, format: el("format").value, digest: mediaDigest(), model: el("modelSelect").value }, `${MEDIUM_LABELS_KO[from]} → ${MEDIUM_LABELS_KO[to]} 변환`);
}

// 🚀 원클릭 흥행 보증: 입력 흥행급 업그레이드 → 빈 칸 보강 → 권장 연출 → 생성 →
//    흥행 보증 채점 → 목표 미달이면 보완 지시 주입해 재생성(최대 2회) → 흥행 보증서.
async function mediaAutopilot() {
  closeMediaModal();
  const idea = el("ideaInput").value.trim();
  const medium = currentMedium();
  if (medium === "webnovel") { toast("매체(애니/영화/다큐/드라마/광고)를 먼저 선택하세요.", "warn"); return; }
  const fmt = el("format").value;
  state.mediaUpgradeBrief = "";
  state.mediaReviseNotes = "";
  try {
    // 1) 입력이 개떡같아도 흥행급으로 — 북극성 브리프 업그레이드.
    el("runStatus").textContent = "입력을 흥행급으로 업그레이드 중";
    try {
      const up = await mediaPost("/api/media-upgrade", { input: collectInput(), medium, format: fmt, model: el("modelSelect").value });
      if (up.ok && up.brief) state.mediaUpgradeBrief = up.brief;
    } catch { /* 업그레이드 실패는 무시(보증 목표 주입만으로도 흥행급 강제) */ }
    // 2) 빈 칸 보강(약하면).
    const filled = PRESET_FIELDS.filter((k) => String(collectInput()[k] ?? "").trim()).length;
    if (idea && filled < 3) { await ideateFill(); }
    else if (filled > 0 && filled < PRESET_FIELDS.length) { await completeFill(); }
    // 3) 권장 연출 가중치.
    if (MEDIA_STEERING[medium]) setSteering(MEDIA_STEERING[medium], false);
    // 4) 보증 루프.
    const maxAttempts = 2;
    let guarantee = null, signal = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      el("runStatus").textContent = `흥행 보증 생성 ${attempt}/${maxAttempts}`;
      await runAgent();
      if (state.controller?.signal?.aborted) return;
      el("runStatus").textContent = `흥행 보증 채점 ${attempt}/${maxAttempts}`;
      const g = await mediaPost("/api/media-guarantee", { input: collectInput(), medium, format: fmt, digest: mediaDigest(), model: el("modelSelect").value });
      if (!g.ok) break;
      guarantee = g.guarantee; signal = g.signal;
      const bar = (signal && signal.bar && signal.bar.refined) || 90;
      // 보수적 점수(결정론·심사 중 낮은 값)가 목표를 넘을 때까지 보완 루프를 돈다.
      const det = (signal && signal.score) || 0;
      const llm = (guarantee && Number.isFinite(guarantee.overall)) ? guarantee.overall : det;
      const score = Math.min(det, llm);
      if (score >= bar || attempt === maxAttempts) break;
      // 미달 → 미달 승리 조건을 보완 지시로 주입하고 재생성.
      state.mediaReviseNotes = guaranteeReviseNoteClient(guarantee, signal);
    }
    state.lastGuarantee = guarantee;
    el("runStatus").textContent = "흥행 보증 완료";
    const det = (signal && signal.score);
    const llm = (guarantee && Number.isFinite(guarantee.overall)) ? guarantee.overall : det;
    const sc = (det != null && llm != null) ? Math.min(det, llm) : (det != null ? det : llm);
    const medLabel = MEDIUM_LABELS_KO[medium] || "이 매체";
    toast(`🏆 ${medLabel} 1등작의 무기 장착 완료 — 보증점수 ${sc != null ? sc : "?"}/100`, "success");
    showGuaranteeCertificate(guarantee, signal);
  } catch (err) {
    toast(err.message || "원클릭 흥행보증 실패", "error");
  } finally {
    state.mediaUpgradeBrief = "";
    state.mediaReviseNotes = "";
  }
}

// 미달 승리 조건 → 다음 재생성에 주입할 보완 지시.
function guaranteeReviseNoteClient(g, signal) {
  const bar = (signal && signal.bar && signal.bar.refined) || 90;
  const lines = [`목표 보증 점수 ${bar}점 이상(현재 ${(signal && signal.score) != null ? signal.score : "?"}점). 아래 미달 승리 조건을 이번 재생성에서 반드시 채운다.`];
  const push = (arr) => (arr || []).forEach((x) => { if (x) lines.push(`- ${x}`); });
  push(g && g.gaps);
  push(g && g.nextActions);
  push(signal && (signal.missing || []).map((m) => `${m} 보강`));
  return lines.join("\n");
}

// 🏆 흥행 보증서 — 현재 산출물을 매체 승리 조건으로 채점·증명.
async function mediaGuaranteeAction() {
  const digest = mediaDigest();
  if (!digest.trim()) { toast("먼저 매체 파이프라인을 실행해 산출물을 만드세요.", "warn"); return; }
  mediaBusy("흥행 보증서 심사 중…");
  try {
    const g = await mediaPost("/api/media-guarantee", { input: collectInput(), medium: currentMedium(), format: el("format").value, digest, model: el("modelSelect").value });
    if (!g.ok || !g.guarantee) throw new Error(g.error || "보증 심사 실패");
    state.lastGuarantee = g.guarantee;
    mediaResultEl().innerHTML = renderGuaranteeCertificate(g.guarantee, g.signal);
  } catch (err) { mediaResultEl().innerHTML = `<div class="impact-loading">보증 심사 실패: ${escapeHtml(err.message || "")}</div>`; }
}

// 보증서를 모달로 띄워 보여준다(원클릭 완료 후).
function showGuaranteeCertificate(g, signal) {
  if (!g && !signal) return;
  openMediaModal();
  mediaResultEl().innerHTML = renderGuaranteeCertificate(g, signal);
}

function renderGuaranteeCertificate(g, signal) {
  // 정직성: 결정론 점수와 LLM 심사 점수 중 '보수적(낮은)' 값을 대표로 표기.
  const llm = (g && Number.isFinite(g.overall)) ? g.overall : null;
  const det = (signal && Number.isFinite(signal.score)) ? signal.score : null;
  const score = (llm != null && det != null) ? Math.min(llm, det) : (llm != null ? llm : (det != null ? det : 0));
  const bar = (signal && signal.bar) || (g && g.bar) || { first: 80, refined: 90 };
  const grade = score >= (bar.refined || 90) ? "흥행 보증" : score >= (bar.first || 80) ? "흥행권" : score >= 60 ? "보완 필요" : "재설계 권장";
  const pass = score >= (bar.refined || 90);
  const scoreDetail = (llm != null && det != null) ? ` <span style="opacity:.6;font-size:.8em">(심사 ${llm} · 결정론 ${det}, 보수적 표기)</span>` : "";
  const crit = (g && g.criteria) || {};
  const critVals = Object.values(crit);
  const metCount = critVals.filter((c) => c.met).length;
  const totalCount = critVals.length || (signal ? (signal.met.length + signal.missing.length) : 0);
  const medLabel = MEDIUM_LABELS_KO[currentMedium()] || "이 매체";
  const banner = score >= (bar.refined || 90)
    ? `🏆 <strong>${escapeHtml(medLabel)} 1등작의 승리 조건을 전부 장착했습니다.</strong> 흥행작이 가진 무기를 빠짐없이 갖췄습니다.`
    : score >= (bar.first || 80)
      ? `🔥 <strong>흥행권 진입.</strong> 1등작 조건 ${metCount}/${totalCount}을 장착했습니다. 아래 미달 항목만 채우면 보증 등급입니다.`
      : `⚙️ 현재 ${metCount}/${totalCount} 장착. 아래 미달 승리 조건만 채우면 흥행권에 진입합니다 — <strong>원클릭 1등작 만들기</strong>가 자동으로 채웁니다.`;
  const critRows = critVals.map((c) => {
    const mark = c.met ? "✅" : "⛔";
    const must = c.mustHave ? ' <span style="opacity:.7">[필수]</span>' : "";
    return `<tr><td>${mark} ${escapeHtml(c.label)}${must}</td><td>${Number.isFinite(c.score) ? c.score : (c.met ? 80 : 40)}/100</td><td style="opacity:.85">${escapeHtml(c.note || "")}</td></tr>`;
  }).join("");
  const list = (arr) => (arr || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  return `<div class="md-output">
    <h3>🏆 흥행 보증서 — ${score}/100${scoreDetail} · <strong>${escapeHtml(grade)}</strong> ${pass ? "✅" : `(목표 ${bar.refined}점)`}</h3>
    <p style="font-size:1.02em;margin:.2em 0 .6em">${banner}</p>
    ${g && g.verdict ? `<p style="opacity:.8">${escapeHtml(g.verdict)}</p>` : ""}
    <table><thead><tr><th>승리 조건</th><th>점수</th><th>근거</th></tr></thead><tbody>${critRows}</tbody></table>
    ${g && g.guaranteedClaims && g.guaranteedClaims.length ? `<p><strong>✅ 구조적으로 보증되는 흥행 요소</strong></p><ul>${list(g.guaranteedClaims)}</ul>` : ""}
    ${g && g.gaps && g.gaps.length ? `<p><strong>⛔ 아직 보강할 것</strong></p><ul>${list(g.gaps)}</ul>` : ""}
    ${g && g.nextActions && g.nextActions.length ? `<p><strong>🚀 1등으로 끌어올릴 다음 행동</strong></p><ul>${list(g.nextActions)}</ul>` : ""}
    <p style="font-size:.95em"><strong>이 작품은 ${escapeHtml(MEDIUM_LABELS_KO[currentMedium()] || "이 매체")} 1등작이 갖춘 승리 조건을 장착했습니다.</strong> 흥행작이 가진 무기를 빠짐없이 갖췄습니다.</p>
  </div>`;
}

async function mediaToolAction(tool) {
  const text = (state.buffers[state.activeTab] || "").trim();
  const label = (MEDIA_TOOLPACK.find(([t]) => t === tool) || [tool, tool])[1];
  await mediaStream("/api/tool", { tool, text, mode: "", ctx: { medium: currentMedium(), genre: el("genre").value, tone: el("tone")?.value || "", protagonist: el("protagonist")?.value || "" }, model: el("modelSelect").value }, label);
}

function handleMediaAction(act) {
  if (act === "autopilot") return mediaAutopilot();
  if (act === "guarantee") return mediaGuaranteeAction();
  if (act === "critique") return mediaCritiqueAction();
  if (act === "audit") return mediaAuditAction();
  if (act === "convert") return mediaConvertAction();
  if (act === "artstyle") return mediaArtstyle();
  if (act === "charsheet") return mediaCharsheet();
  if (act === "techmap") return mediaTechmap();
  if (act === "festival") return mediaFestival();
  if (act === "videoprompt") return mediaVideoprompt();
  if (act === "formconvert") return mediaFormconvert();
}

async function mediaArtstyle() {
  await mediaStream("/api/artstyle", { input: collectInput(), oneSheet: state.oneSheet, format: el("format").value, targetModel: (el("videoModel") && el("videoModel").value) || "kling", model: el("modelSelect").value }, "🎨 그림풍 추천 (A/B/C + 스타일별 프롬프트)");
}

// 🧍 캐릭터 시트 고정: 디자인 시트 프롬프트 + 재사용 CHARACTER LOCK 토큰 + 모델별 고정법.
async function mediaCharsheet() {
  mediaBusy("캐릭터 시트 고정 프롬프트 생성 중…");
  try {
    const data = await mediaPost("/api/charsheet", { input: collectInput(), oneSheet: state.oneSheet, targetModel: (el("videoModel") && el("videoModel").value) || "kling", model: el("modelSelect").value });
    if (!data.ok || !data.charsheet) throw new Error(data.error || "생성 실패");
    const c = data.charsheet;
    state.characterLock = c.lockToken || "";   // 잠금 → 콘티·그림풍·영상 프롬프트에 자동 주입
    localStorage.setItem("sfAgentInput", JSON.stringify(collectInput()));
    const methods = (c.methods || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("");
    mediaResultEl().innerHTML = `<div class="md-output">
      <h3>🧍 캐릭터 시트 고정 ${state.characterLock ? "· 🔒 LOCK 적용됨" : ""}</h3>
      <p style="opacity:.85">아래 <strong>CHARACTER LOCK 토큰</strong>이 잠겨, 이제 콘티·그림풍·영상 프롬프트에 <strong>모든 컷 동일 인물</strong>로 자동 주입됩니다.</p>
      <p><strong>🔒 CHARACTER LOCK 토큰 (모든 샷 맨 앞에 반복 삽입)</strong></p>
      <pre style="white-space:pre-wrap">${escapeHtml(c.lockToken || "")}</pre>
      <p><strong>캐릭터 디자인 시트 프롬프트 (턴어라운드)</strong></p>
      <pre style="white-space:pre-wrap">${escapeHtml(c.sheetPrompt || "")}</pre>
      ${c.expressionSheet ? `<p><strong>표정 시트 프롬프트</strong></p><pre style="white-space:pre-wrap">${escapeHtml(c.expressionSheet)}</pre>` : ""}
      <p><strong>일관성 네거티브</strong></p><pre style="white-space:pre-wrap">${escapeHtml(c.negative || "")}</pre>
      ${c.modelMethod ? `<p><strong>${escapeHtml((el("videoModel") && el("videoModel").value) || "Kling")} 고정법:</strong> ${escapeHtml(c.modelMethod)}</p>` : ""}
      ${methods ? `<p><strong>일반 일관성 고정법</strong></p><ul>${methods}</ul>` : ""}
    </div>`;
    toast("🧍 캐릭터를 LOCK했습니다 — 콘티·그림풍·영상 프롬프트에 동일 인물로 자동 반영됩니다.", "success");
  } catch (err) { mediaResultEl().innerHTML = `<div class="impact-loading">생성 실패: ${escapeHtml(err.message || "")}</div>`; }
}

/* ----------------------- 🎥 AI 영상 제작 도구 ----------------------- */
function onesheetTextSafe() { return (typeof onesheetText === "function") ? onesheetText() : ""; }

async function mediaTechmap() {
  mediaBusy("기술 → 서사 매핑 중…");
  try {
    const data = await mediaPost("/api/techmap", { input: collectInput(), medium: currentMedium(), idea: (el("ideaInput") && el("ideaInput").value) || el("logline").value || "", model: el("modelSelect").value });
    if (!data.ok || !data.techmap) throw new Error(data.error || "매핑 실패");
    const t = data.techmap;
    const hard = (t.hardElements || []).map((e) => `<li><strong>${escapeHtml(e.element)}</strong> — ${escapeHtml(e.why)} → <em>${escapeHtml(e.workaround)}</em></li>`).join("");
    const str = (t.aiStrengths || []).map((e) => `<li><strong>${escapeHtml(e.strength)}</strong> → ${escapeHtml(e.narrativeUse)}</li>`).join("");
    mediaResultEl().innerHTML = `<div class="md-output"><h3>🛠 기술 → 서사 매핑</h3>
      <p><strong>AI가 어려운 요소 → 서사적 치환</strong></p><ul>${hard}</ul>
      <p><strong>AI 강점 → 메타포</strong></p><ul>${str}</ul>
      ${t.rewriteSuggestion ? `<p><strong>재설계 로그라인:</strong> ${escapeHtml(t.rewriteSuggestion)}</p>` : ""}
      <p style="opacity:.8">${escapeHtml(t.verdict || "")}</p></div>`;
  } catch (err) { mediaResultEl().innerHTML = `<div class="impact-loading">매핑 실패: ${escapeHtml(err.message || "")}</div>`; }
}

async function mediaFestival() {
  const digest = mediaDigest() || onesheetTextSafe();
  if (!digest.trim()) { toast("먼저 산출물(또는 원시트)을 만드세요.", "warn"); return; }
  mediaBusy("AI 영화제 감수 중…");
  try {
    const data = await mediaPost("/api/festival", { input: collectInput(), medium: currentMedium(), digest, festival: (el("festivalTarget") && el("festivalTarget").value) || "general", model: el("modelSelect").value });
    if (!data.ok || !data.festival) throw new Error(data.error || "감수 실패");
    const f = data.festival;
    const li = (arr) => (arr || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("");
    const fit = (f.festivalFit || []).map((x) => `<tr><td>${escapeHtml(x.festival)}</td><td>${x.fit}/100</td><td style="opacity:.85">${escapeHtml(x.why)}</td></tr>`).join("");
    mediaResultEl().innerHTML = `<div class="md-output"><h3>🏆 영화제 감수 — 예술성 ${f.artistryIndex}/100 · 독창성 ${f.originalityIndex}/100</h3>
      <p><strong>심사위원 공감대 예측</strong><br>${escapeHtml(f.juryReview || "")}</p>
      ${f.strengths && f.strengths.length ? `<p><strong>강점</strong></p><ul>${li(f.strengths)}</ul>` : ""}
      ${f.risks && f.risks.length ? `<p><strong>탈락 위험</strong></p><ul>${li(f.risks)}</ul>` : ""}
      <p><strong>수상권으로 끌어올릴 제안</strong></p><ul>${li(f.fixes)}</ul>
      ${fit ? `<table><thead><tr><th>영화제</th><th>적합</th><th>이유</th></tr></thead><tbody>${fit}</tbody></table>` : ""}
      <p style="opacity:.8">${escapeHtml(f.verdict || "")}</p></div>`;
  } catch (err) { mediaResultEl().innerHTML = `<div class="impact-loading">감수 실패: ${escapeHtml(err.message || "")}</div>`; }
}

async function mediaVideoprompt() {
  const digest = mediaDigest() || onesheetTextSafe();
  await mediaStream("/api/videoprompt", { input: collectInput(), medium: currentMedium(), format: el("format").value, digest, model: el("modelSelect").value }, "씬별 영상 프롬프트팩(Runway/Sora/Kling)");
}

async function mediaFormconvert() {
  const text = (state.buffers[state.activeTab] || "").trim() || mediaDigest();
  if (!text) { toast("변환할 산출물(탭)을 먼저 만드세요.", "warn"); return; }
  const isScript = /(S\d|씬\s|INT\.|EXT\.|지문|콘티|컷\d)/.test(text);
  const to = isScript ? "novel" : "script";
  const from = isScript ? "script" : "novel";
  await mediaStream("/api/formconvert", { input: collectInput(), medium: currentMedium(), text, from, to, model: el("modelSelect").value }, to === "script" ? "→ 시나리오/콘티 변환" : "→ 소설 변환");
}

/* ----------------------- 🎬 감독 원시트 (Director One-Sheet) ----------------------- */

function openOnesheetModal() {
  renderOnesheet();
  updateOnesheetLockUI();
  el("onesheetResult").hidden = true;
  el("onesheetResult").innerHTML = "";
  el("onesheetModal").hidden = false;
  document.body.classList.add("modal-open");
}
function closeOnesheetModal() { el("onesheetModal").hidden = true; document.body.classList.remove("modal-open"); }

function renderOnesheet() {
  const body = el("onesheetBody");
  if (!body) return;
  const visual = VISUAL_MEDIA_KO.has(currentMedium());
  body.innerHTML = ONESHEET_BLOCKS_KO.map(([key, label, labelText]) => {
    const lbl = (!visual && labelText) ? labelText : label;
    const v = state.oneSheet[key] || "";
    const big = (key === "beatStructure" || key === "forbiddenDrift" || key === "continuityBible");
    return `<label class="field onesheet-row"><span>${escapeHtml(lbl)}</span>
      <textarea data-os="${key}" rows="${big ? 4 : 2}" placeholder="‘원시트 생성’ 또는 직접 입력">${escapeHtml(v)}</textarea></label>`;
  }).join("");
}

function updateOnesheetLockUI() {
  const btn = el("onesheetLockBtn");
  const badge = el("onesheetLockBadge");
  if (btn) btn.textContent = state.oneSheetLocked ? "🔓 잠금 해제" : "🔒 LOCK";
  if (badge) badge.hidden = !state.oneSheetLocked;
  if (el("onesheetBtn")) el("onesheetBtn").classList.toggle("active", state.oneSheetLocked);
}

function syncOnesheetFromDom() {
  document.querySelectorAll("#onesheetBody [data-os]").forEach((n) => { state.oneSheet[n.dataset.os] = n.value; });
}
function onesheetText() {
  return ONESHEET_BLOCKS_KO.map(([k, label]) => { const v = (state.oneSheet[k] || "").trim(); return v ? `## ${label}\n${v}` : ""; }).filter(Boolean).join("\n\n");
}
function onesheetHasContent() { return Object.values(state.oneSheet).some((v) => String(v || "").trim()); }
function onesheetDigest() {
  let d = onesheetText();
  const md = (typeof mediaDigest === "function") ? mediaDigest() : "";
  if (md) d += "\n\n# 산출물\n" + md;
  return d;
}
function onesheetBusy(msg) { const r = el("onesheetResult"); r.hidden = false; r.innerHTML = `<div class="impact-loading"><span class="dot"></span>${escapeHtml(msg)}</div>`; }

async function generateOnesheet() {
  onesheetBusy("감독 원시트 생성 중…");
  try {
    const data = await mediaPost("/api/onesheet", { input: collectInput(), medium: currentMedium(), genre: el("genre").value, format: el("format").value, model: el("modelSelect").value });
    if (!data.ok || !data.onesheet) throw new Error(data.error || "원시트 생성 실패");
    state.oneSheet = data.onesheet;
    renderOnesheet();
    el("onesheetResult").hidden = true;
    localStorage.setItem("sfAgentInput", JSON.stringify(collectInput()));
    toast(data.fallback ? "원시트를 생성했습니다(폴백). 검토 후 LOCK하세요." : "원시트를 생성했습니다. 검토·수정 후 🔒 LOCK하면 모든 산출물에 적용됩니다.", "success");
  } catch (err) { el("onesheetResult").innerHTML = `<div class="impact-loading">생성 실패: ${escapeHtml(err.message || "")}</div>`; }
}

function toggleOnesheetLock() {
  syncOnesheetFromDom();
  if (!state.oneSheetLocked && !onesheetHasContent()) { toast("원시트를 먼저 생성하거나 입력하세요.", "warn"); return; }
  state.oneSheetLocked = !state.oneSheetLocked;
  updateOnesheetLockUI();
  localStorage.setItem("sfAgentInput", JSON.stringify(collectInput()));
  if (typeof updateJourney === "function") updateJourney();
  toast(state.oneSheetLocked
    ? "🔒 원시트를 LOCK했습니다 — 모든 장르·매체 산출물이 이 잠금값(주제·오브젝트·결말·금지규칙)을 따릅니다."
    : "🔓 LOCK을 해제했습니다.", state.oneSheetLocked ? "success" : "info");
}

async function runIntegrity() {
  syncOnesheetFromDom();
  const digest = onesheetDigest();
  if (!digest.trim()) { toast("원시트를 먼저 생성하세요.", "warn"); return; }
  onesheetBusy("서사 무결성 채점 중…");
  try {
    const data = await mediaPost("/api/integrity", { input: collectInput(), medium: currentMedium(), oneSheet: state.oneSheet, digest, model: el("modelSelect").value });
    if (!data.ok || !data.integrity) throw new Error(data.error || "채점 실패");
    renderIntegrity(data.integrity);
  } catch (err) { el("onesheetResult").innerHTML = `<div class="impact-loading">채점 실패: ${escapeHtml(err.message || "")}</div>`; }
}

function renderIntegrity(ig) {
  const rows = Object.entries(ig.scores || {}).map(([k, v]) => {
    const w = (ig.dims || []).find((d) => d[0] === k);
    return `<tr><td>${escapeHtml(k)}</td><td>${v}/${w ? w[1] : "?"}</td></tr>`;
  }).join("");
  const gate = ig.gate || "";
  const badge = gate === "통과" ? "✅" : gate === "구조 재작성" ? "⛔" : "🔁";
  const list = (arr) => (arr || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  const r = el("onesheetResult");
  r.hidden = false;
  r.innerHTML = `<div class="md-output">
    <h3>📊 서사 무결성 — ${ig.overall}/100 · ${badge} <strong>${escapeHtml(gate)}</strong></h3>
    <table><tbody>${rows}</tbody></table>
    ${ig.weak && ig.weak.length ? `<p><strong>약한 항목</strong></p><ul>${list(ig.weak)}</ul>` : ""}
    <p><strong>수정 지시</strong></p><ul>${list(ig.fixes)}</ul>
    <p style="opacity:.8">${escapeHtml(ig.verdict || "")}</p>
  </div>`;
}

async function runConte() {
  syncOnesheetFromDom();
  if (!onesheetText().trim()) { toast("원시트를 먼저 생성하세요.", "warn"); return; }
  onesheetBusy("콘티·6층 프롬프트 컴파일 중…");
  const r = el("onesheetResult");
  try {
    const res = await fetch("/api/conte", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: collectInput(), medium: currentMedium(), oneSheet: state.oneSheet, format: el("format").value, model: el("modelSelect").value }) });
    if (!res.ok || !res.body) throw new Error(`서버 오류 (HTTP ${res.status})`);
    const reader = res.body.getReader(); const decoder = new TextDecoder();
    let buf = "", acc = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let sep;
      while ((sep = buf.indexOf("\n\n")) !== -1) {
        const raw = buf.slice(0, sep); buf = buf.slice(sep + 2);
        let type = "message", dataLine = "";
        raw.split("\n").forEach((line) => { if (line.startsWith("event:")) type = line.slice(6).trim(); else if (line.startsWith("data:")) dataLine += line.slice(5).trim(); });
        if (!dataLine) continue;
        let d; try { d = JSON.parse(dataLine); } catch { continue; }
        if (type === "delta" && d.text) { acc += d.text; r.innerHTML = `<div class="md-output">${window.renderMarkdown(acc)}</div>`; }
        else if (type === "done") { acc = d.result || acc; }
      }
    }
    r.innerHTML = `<div class="tool-result-actions"><span class="tool-result-tag">🎞 콘티·프롬프트</span></div><div class="md-output">${window.renderMarkdown(acc)}</div>`;
  } catch (err) { r.innerHTML = `<div class="impact-loading">컴파일 실패: ${escapeHtml(err.message || "")}</div>`; }
}

function handleOnesheetAction(act) {
  if (act === "generate") return generateOnesheet();
  if (act === "lock") return toggleOnesheetLock();
  if (act === "integrity") return runIntegrity();
  if (act === "conte") return runConte();
}

/* ----------------------- ⚖️ 방향 비교 A/B ----------------------- */

function openAbModal() {
  el("abModal").hidden = false;
  document.body.classList.add("modal-open");
  renderAbControls();
  // 처음엔 아직 생성 전 상태 유지 (버튼 눌러야 생성)
}

function closeAbModal() {
  el("abModal").hidden = true;
  document.body.classList.remove("modal-open");
  state.abBusy = false;
}

// B 방향으로 쓸 프리셋 선택기 렌더
function renderAbControls() {
  const host = el("abControls");
  if (!host) return;
  const presetOpts = Object.entries(STEER_PRESETS)
    .map(([k, p]) => `<option value="${k}">${p.label}</option>`).join("");
  host.innerHTML = `
    <label class="ab-pick">A 방향: <span id="abCurLabel" class="ab-cur-label">${steeringSummaryText()}</span> <span class="ab-cur-hint">(현재 다이얼 값)</span></label>
    <label class="ab-pick">B 방향:
      <select id="abPresetPick">${presetOpts}</select>
    </label>
    <button class="command primary" id="abRunBtn" type="button"><span class="dot"></span><span>두 방향 동시 생성</span></button>`;
  el("abRunBtn").addEventListener("click", runAbCompare);
}

async function runAbCompare() {
  if (state.abBusy) return;
  const bPreset = STEER_PRESETS[el("abPresetPick").value] || STEER_PRESETS.speed;
  const input = collectInput();
  if (!input.logline && !input.protagonist && !input.ipTitle) {
    toast("먼저 Core IP(제목·로그라인·주인공)를 채워 주세요.", "warn"); return;
  }
  state.abBusy = true;
  const btn = el("abRunBtn");
  if (btn) { btn.disabled = true; btn.querySelector("span:last-child").textContent = "생성 중…"; }

  // A = 현재 다이얼, B = 선택한 프리셋
  const aWeights = readSteering();
  const bWeights = bPreset.weights;
  const aLabel = steeringSummaryText();
  const bLabel = bPreset.label;

  el("abTagA").textContent = aLabel;
  el("abTagB").textContent = bLabel;
  el("abBodyA").innerHTML = `<div class="impact-loading"><span class="dot"></span>A 방향 생성 중…</div>`;
  el("abBodyB").innerHTML = `<div class="impact-loading"><span class="dot"></span>B 방향 생성 중…</div>`;
  el("abApplyA").hidden = true; el("abApplyB").hidden = true;
  el("abColA").dataset.weights = JSON.stringify(aWeights);
  el("abColB").dataset.weights = JSON.stringify(bWeights);

  const model = el("modelSelect").value || state.config.defaultModel;
  // SSE 샘플 스트리밍 — 생성 중에 해당 칸을 실시간으로 업데이트.
  const fetchSample = async (steering, bodyEl) => {
    const res = await fetch("/api/sample", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: { ...input, steering }, model }),
    });
    if (!res.body) return { ok: false };
    const reader = res.body.getReader(); const dec = new TextDecoder();
    let buf = ""; let acc = ""; let done2 = {};
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let sep;
      while ((sep = buf.indexOf("\n\n")) !== -1) {
        const raw = buf.slice(0, sep); buf = buf.slice(sep + 2);
        let type = ""; let dl = "";
        raw.split("\n").forEach((l) => { if (l.startsWith("event:")) type = l.slice(6).trim(); else if (l.startsWith("data:")) dl += l.slice(5).trim(); });
        if (!dl) continue;
        let d; try { d = JSON.parse(dl); } catch { continue; }
        if (type === "delta" && d.text) { acc += d.text; if (bodyEl) bodyEl.innerHTML = `<div class="md-output ab-sample">${window.renderMarkdown(acc)}<span class="cursor"></span></div>`; }
        if (type === "done") done2 = d;
      }
    }
    return { ok: true, sample: done2.sample || acc, fallback: !!done2.fallback };
  };

  const [rA, rB] = await Promise.all([fetchSample(aWeights, el("abBodyA")), fetchSample(bWeights, el("abBodyB"))]);
  el("abBodyA").innerHTML = `<div class="md-output ab-sample">${window.renderMarkdown(rA.sample || "(생성 실패)")}</div>`;
  el("abBodyB").innerHTML = `<div class="md-output ab-sample">${window.renderMarkdown(rB.sample || "(생성 실패)")}</div>`;
  el("abApplyA").hidden = false; el("abApplyB").hidden = false;

  if (btn) { btn.disabled = false; btn.querySelector("span:last-child").textContent = "다시 생성"; }
  state.abBusy = false;
  toast("A/B 비교 생성 완료. 마음에 드는 방향을 적용하세요.", "success");
}

function applyAbWeights(side) {
  const col = el(side === "A" ? "abColA" : "abColB");
  const weights = JSON.parse(col?.dataset.weights || "{}");
  if (!weights || !Object.keys(weights).length) return;
  setSteering(weights);
  closeAbModal();
  toast(`방향 ${side} 가중치를 적용했습니다. 이후 생성이 이 방향으로 이어집니다.`, "success");
  updateJourney();
}

/* ------------------------------ Projects -------------------------------- */

function currentReport() {
  const agents = {};
  AGENTS.forEach((a) => {
    if (state.buffers[a.id]) {
      agents[a.id] = { id: a.id, name: a.name, tabs: [a.id], text: state.buffers[a.id] };
    }
  });
  // 생성한 연속 원고(2화 이후)도 함께 저장/내보내기.
  const chapters = {};
  Object.entries(state.chapters).forEach(([k, v]) => { if (v) chapters[k] = v; });
  return { generatedAt: new Date().toISOString(), model: state.lastModel, agents, usage: state.usage, chapters, memories: state.memories, outline: state.outline };
}

async function loadProjects(selectId) {
  try {
    const res = await fetch("/api/projects");
    const data = await res.json();
    state.projects = data.projects || [];
  } catch { state.projects = []; }
  const sel = el("projectSelect");
  sel.innerHTML = `<option value="">새 프로젝트</option>` +
    state.projects.map((p) => `<option value="${p.id}">${escapeHtml(p.title)} · ${p.score ?? 0}%</option>`).join("");
  sel.value = selectId || state.currentProjectId || "";
}

function escapeHtml(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

async function saveProject() {
  const input = collectInput();
  const payload = {
    id: state.currentProjectId || undefined,
    title: input.ipTitle || "무제 SF",
    input,
    report: Object.keys(state.buffers).length ? currentReport() : null,
    score: state.score,
  };
  try {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.ok) throw new Error("저장 실패");
    state.currentProjectId = data.project.id;
    await loadProjects(data.project.id);
    toast("프로젝트를 저장했습니다.", "success");
  } catch (err) {
    toast(err.message || "저장 실패", "error");
  }
}

async function openProject(id) {
  if (!id) { newProject(); return; }
  try {
    const res = await fetch(`/api/projects/${id}`);
    const data = await res.json();
    if (!data.ok) throw new Error("불러오기 실패");
    const p = data.project;
    state.currentProjectId = p.id;
    // 저장된 스튜디오로 먼저 전환해 입력 패널/탭을 맞춘다.
    setStudio(STUDIOS[p.input?.studio] ? p.input.studio : "production", { silent: true });
    fillForm(p.input || {});
    if (state.studio !== "platform") onGenreChange(false); // 장르 라벨 적용(제작·박성우)
    if (state.studio === "production") onMediumChange(); // 저장된 매체에 맞춰 탭·라벨 재구성
    resetRun();
    if (p.report?.agents) {
      Object.values(p.report.agents).forEach((a) => {
        state.buffers[a.id] = a.text || "";
        state.statuses[a.id] = a.error ? "error" : "done";
        if (a.error) state.errors[a.id] = a.error;
        updateAgentCard(a.id);
      });
      state.lastModel = p.report.model || "";
      if (p.report.usage) { state.usage = p.report.usage; updateUsage(); }
      if (p.report.chapters) state.chapters = { ...p.report.chapters };
      state.memories = (p.report.memories && typeof p.report.memories === "object") ? { ...p.report.memories } : {};
      state.outline = (p.report.outline && Array.isArray(p.report.outline.acts)) ? p.report.outline : null;
    }
    el("workspaceTitle").textContent = p.title || (STUDIO_META[state.studio] || STUDIO_META.production).title;
    setActiveTab(AGENTS[0].id);
    updateJourney();
    toast("프로젝트를 불러왔습니다.", "success");
  } catch (err) {
    toast(err.message || "불러오기 실패", "error");
  }
}

function newProject() {
  state.currentProjectId = "";
  el("projectSelect").value = "";
  fillForm(DEFAULTS);
  // 박성우 모드면 SF 장르를 유지/복원한다.
  if (state.studio === "foresight") { const g = el("genre"); if (g) g.value = "aiForesight"; }
  if (state.studio !== "platform") onGenreChange(false); // 적응형 라벨 갱신(제작·박성우)
  if (state.studio === "production") onMediumChange(); // 기본 매체(웹소설)로 탭·라벨 재구성
  el("workspaceTitle").textContent = (STUDIO_META[state.studio] || STUDIO_META.production).title;
  resetRun();
  setActiveTab(AGENTS[0].id);
  updateJourney();
}

async function deleteProject() {
  const id = state.currentProjectId;
  if (!id) { toast("저장된 프로젝트가 아닙니다.", "warn"); return; }
  if (!confirm("이 프로젝트를 삭제할까요?")) return;
  try {
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    state.currentProjectId = "";
    await loadProjects("");
    newProject();
    toast("삭제했습니다.", "success");
  } catch (err) {
    toast("삭제 실패", "error");
  }
}

/* ------------------------------- Export --------------------------------- */

async function exportMarkdown() {
  const payload = {
    title: collectInput().ipTitle || "무제 SF",
    input: collectInput(),
    report: currentReport(),
    score: state.score,
  };
  try {
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.ok) throw new Error("내보내기 실패");
    const blob = new Blob([data.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safe = (payload.title || "sf-webnovel").replace(/[^\p{L}\p{N}]+/gu, "-");
    a.href = url;
    a.download = `${safe}-production-report.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Markdown 리포트를 내보냈습니다.", "success");
  } catch (err) {
    toast(err.message || "내보내기 실패", "error");
  }
}

/* ------------------------------- Config --------------------------------- */

async function loadConfig() {
  try {
    const res = await fetch("/api/config");
    const data = await res.json();
    state.config = data;
  } catch {
    state.config = { hasApiKey: false, models: {}, defaultModel: "" };
  }

  const sel = el("modelSelect");
  const models = state.config.models || {};
  sel.innerHTML = Object.entries(models)
    .map(([tier, id]) => `<option value="${id}">${MODEL_LABELS[tier] || id}</option>`)
    .join("");
  if (state.config.defaultModel) sel.value = state.config.defaultModel;

  const chip = el("modeChip");
  const notice = el("keyNotice");
  const mode = state.config.mode || (state.config.hasApiKey ? "api" : "local");
  if (mode === "api") {
    chip.textContent = "● Claude API";
    chip.dataset.kind = "live";
    notice.hidden = true;
  } else if (mode === "cli") {
    chip.textContent = "● Claude Code 구독";
    chip.dataset.kind = "live";
    notice.hidden = true;
  } else {
    chip.textContent = "● 로컬 폴백";
    chip.dataset.kind = "fallback";
    notice.hidden = false;
    notice.querySelector("span").innerHTML =
      "LLM 엔진이 연결되지 않아 결정론적 미리보기로 동작합니다. " +
      "<strong>Claude Max 구독</strong>으로 쓰려면 <code>.env</code>에 <code>LLM_PROVIDER=cli</code>를 넣고, 터미널에서 <code>claude</code>로 로그인한 뒤 서버를 재시작하세요. " +
      "또는 <code>ANTHROPIC_API_KEY</code>를 넣으면 API(토큰 과금)로 동작합니다.";
  }
}

/* -------------------------------- Boot ---------------------------------- */

function boot() {
  const savedBatch = Number(localStorage.getItem("sfChapterBatch"));
  if (savedBatch === 1 || savedBatch === 5) state.batchSize = savedBatch;
  const savedSeason = Number(localStorage.getItem("sfSeasonLen"));
  if (SEASON_OPTIONS.includes(savedSeason)) state.totalChapters = savedSeason;
  state.autoFeedback = localStorage.getItem("sfAutoFeedback") === "1";
  if (localStorage.getItem("sfAutoFinalPass") === "0") state.autoFinalPass = false;
  renderAgentGrid();
  renderTabs();
  renderSteering(); // 가중치 다이얼 먼저 렌더(아래 fillForm이 값을 복원)

  // 첫 진입은 범용 빈 폼(DEFAULTS)으로 시작한다. 장르별 예시는 '예시' 버튼,
  // AI 미래예측 SF 데모는 'AI미래학자 박성우' 모드에서 불러온다.
  const saved = localStorage.getItem("sfAgentInput");
  if (saved) {
    try { fillForm(JSON.parse(saved)); } catch { fillForm(DEFAULTS); }
  } else {
    fillForm(DEFAULTS);
  }

  el("runAgent").addEventListener("click", runAgent);
  el("stopAgent").addEventListener("click", stopAgent);
  el("ideateBtn").addEventListener("click", ideateFill);
  el("completeBtn").addEventListener("click", completeFill);
  el("impactBtn").addEventListener("click", runImpact);
  el("impactClose").addEventListener("click", closeImpactModal);
  el("impactModal").addEventListener("click", (e) => { if (e.target === el("impactModal")) closeImpactModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el("impactModal").hidden) closeImpactModal(); });
  // AI 글쓰기 도구상자
  el("toolboxBtn").addEventListener("click", () => openToolbox());
  el("toolClose").addEventListener("click", closeToolbox);
  // A/B 방향 비교
  el("abCompareBtn").addEventListener("click", openAbModal);
  el("abClose").addEventListener("click", closeAbModal);
  el("abModal").addEventListener("click", (e) => { if (e.target === el("abModal")) closeAbModal(); });
  el("abApplyA").addEventListener("click", () => applyAbWeights("A"));
  el("abApplyB").addEventListener("click", () => applyAbWeights("B"));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el("abModal").hidden) closeAbModal(); });
  el("toolModal").addEventListener("click", (e) => { if (e.target === el("toolModal")) closeToolbox(); });
  el("toolRun").addEventListener("click", runTool);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el("toolModal").hidden) closeToolbox(); });
  el("refFile").addEventListener("change", (e) => handleRefUpload(e.target.files[0]));
  // '예시' 버튼: 현재 선택된 장르의 기본 예시 프리셋을 불러온다.
  el("loadExample").addEventListener("click", () => onGenreChange(true));
  el("exportMarkdown").addEventListener("click", exportMarkdown);
  el("resetForm").addEventListener("click", newProject);
  el("saveProject").addEventListener("click", saveProject);
  el("newProject").addEventListener("click", newProject);
  el("deleteProject").addEventListener("click", deleteProject);
  el("projectSelect").addEventListener("change", (e) => openProject(e.target.value));
  // 제작실 ↔ 운영실 전환
  document.querySelectorAll(".studio-btn").forEach((btn) =>
    btn.addEventListener("click", () => setStudio(btn.dataset.studio)));
  // 장르 변경(사용자 선택): 적응형 라벨 + 기본 예시 자동 채움
  el("genre").addEventListener("change", () => onGenreChange(true));
  // 매체 변경: 전용 파이프라인 탭·라벨·가시성 재구성 + 권장 연출 가중치 적용.
  el("medium").addEventListener("change", () => onMediumChange(true));
  el("format").addEventListener("change", () => {
    // 포맷 변경 시 그 포맷의 추천 설계값을 다시 적용(매체일 때).
    if (currentMedium() !== "webnovel") loadDesignSpec(currentMedium(), el("format").value, "apply");
    localStorage.setItem("sfAgentInput", JSON.stringify(collectInput()));
    el("runStatus").textContent = "수정됨";
  });
  // 상세 설계 요소: 입력 시 state 동기화 + 저장.
  el("designSpecBody")?.addEventListener("input", (e) => {
    const k = e.target && e.target.dataset && e.target.dataset.ds;
    if (!k) return;
    state.designSpec[k] = e.target.value;
    localStorage.setItem("sfAgentInput", JSON.stringify(collectInput()));
    el("runStatus").textContent = "수정됨";
  });
  // 추천값 다시 적용 버튼.
  el("designRecommendBtn")?.addEventListener("click", () => {
    loadDesignSpec(currentMedium(), el("format").value, "apply");
    toast("이 매체·포맷의 추천 설계값을 적용했습니다.", "info");
  });
  // 감독 스타일 변경: 저장(프롬프트 주입은 collectInput→input.directorStyle로 전달).
  el("directorStyle")?.addEventListener("change", () => {
    localStorage.setItem("sfAgentInput", JSON.stringify(collectInput()));
    el("runStatus").textContent = "수정됨";
  });
  // 🎬 매체 작업대 모달
  el("mediaToolsBtn")?.addEventListener("click", openMediaModal);
  el("mediaClose")?.addEventListener("click", closeMediaModal);
  el("mediaModal")?.addEventListener("click", (e) => {
    if (e.target === el("mediaModal")) { closeMediaModal(); return; }
    const act = e.target.closest("[data-media-act]");
    if (act) { handleMediaAction(act.dataset.mediaAct); return; }
    const tool = e.target.closest("[data-media-tool]");
    if (tool) { mediaToolAction(tool.dataset.mediaTool); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && el("mediaModal") && !el("mediaModal").hidden) closeMediaModal(); });
  // 🎬 감독 원시트 모달 (전 장르·전 매체)
  el("onesheetBtn")?.addEventListener("click", openOnesheetModal);
  el("onesheetClose")?.addEventListener("click", closeOnesheetModal);
  el("onesheetModal")?.addEventListener("click", (e) => {
    if (e.target === el("onesheetModal")) { closeOnesheetModal(); return; }
    const act = e.target.closest("[data-os-act]");
    if (act) handleOnesheetAction(act.dataset.osAct);
  });
  el("onesheetBody")?.addEventListener("input", (e) => {
    if (e.target && e.target.dataset && e.target.dataset.os) {
      state.oneSheet[e.target.dataset.os] = e.target.value;
      if (state.oneSheetLocked) { localStorage.setItem("sfAgentInput", JSON.stringify(collectInput())); el("runStatus").textContent = "수정됨"; }
    }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && el("onesheetModal") && !el("onesheetModal").hidden) closeOnesheetModal(); });
  // 세부 장르 변경: 성공 방정식 표시 갱신 + 저장
  el("subgenre").addEventListener("change", () => {
    renderSubgenreFormula(state.playbookCache[el("genre").value]);
    localStorage.setItem("sfAgentInput", JSON.stringify(collectInput()));
    el("runStatus").textContent = "수정됨";
    if (state.activeTab === "prompts") renderActiveTab();
  });
  // 혼합 장르 / 연재 플랫폼(다중) 변경: 저장
  const saveInput = () => {
    localStorage.setItem("sfAgentInput", JSON.stringify(collectInput()));
    el("runStatus").textContent = "수정됨";
    if (state.activeTab === "prompts") renderActiveTab();
  };
  el("blendGenres").addEventListener("change", saveInput);
  el("platformChecks").addEventListener("change", saveInput);
  el("agentForm").addEventListener("input", () => {
    el("runStatus").textContent = "수정됨";
    updateJourney(); // 입력할 때마다 제작도·스텝퍼 실시간 갱신
    if (state.activeTab === "prompts") renderActiveTab();
  });
  // 제작도 칩 클릭 → 빈 항목 패널 토글
  el("readinessChip").addEventListener("click", toggleReadinessPanel);

  AGENTS.forEach((a) => { state.statuses[a.id] = "idle"; });
  setActiveTab("foresight");
  loadConfig();
  loadProjects();
  // 초기 장르에 맞춰 라벨만 적용 (프리셋은 덮어쓰지 않음)
  onGenreChange(false);
  // 마지막으로 쓰던 스튜디오 복원 (production·platform·foresight·business)
  const savedStudio = localStorage.getItem("sfAgentStudio");
  if (savedStudio && STUDIOS[savedStudio] && savedStudio !== "production") {
    setStudio(savedStudio, { silent: true });
  }
  // 제작 스튜디오면 저장/기본 매체에 맞춰 탭·라벨·가시성을 적용한다.
  if (state.studio === "production") onMediumChange();
  updateJourney(); // 초기 렌더
}

document.addEventListener("DOMContentLoaded", boot);
