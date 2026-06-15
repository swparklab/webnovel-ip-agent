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

const STUDIOS = { production: PRODUCTION_AGENTS, platform: PLATFORM_AGENTS };
// 현재 스튜디오의 에이전트 목록. 토글 시 교체된다(아래 렌더 함수들이 모두 참조).
let AGENTS = PRODUCTION_AGENTS;

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
  "ipTitle", "genre", "platform", "targetReader", "logline", "futureYear",
  "cadence", "sfPremise", "coreTech", "scienceConstraint", "socialShift",
  "protagonist", "desire", "aiEntity", "antagonist", "worldRule", "seasonGoal",
  "tone", "manuscript", "feedback", "webtoonBranch", "globalBranch",
  "fanCommunity", "commerceBranch", "coreTags",
];

// 운영실 타깃 플랫폼 체크박스 (data-platform).
const PLATFORM_CHECKS = ["tpRoyalroad", "tpHfy", "tpWebnovel", "tpNaver", "tpKakao"];

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
};

const DEFAULTS = Object.fromEntries(
  SELECTORS.map((id) => [id, ["webtoonBranch", "globalBranch", "fanCommunity"].includes(id)]),
);
Object.assign(DEFAULTS, { genre: "aiForesight", platform: "kakao", cadence: "daily", futureYear: "2041" });
["ipTitle", "targetReader", "logline", "sfPremise", "coreTech", "scienceConstraint",
 "socialShift", "protagonist", "desire", "aiEntity", "antagonist", "worldRule",
 "seasonGoal", "tone", "manuscript", "feedback", "coreTags"].forEach((id) => (DEFAULTS[id] = ""));
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
  "antagonist", "worldRule", "seasonGoal", "tone",
];

function applyPreset(preset) {
  if (!preset) return;
  PRESET_FIELDS.forEach((f) => {
    if (f in preset) el(f).value = preset[f] === "—" ? "" : preset[f];
  });
  if (preset.ipTitle) el("workspaceTitle").textContent = preset.ipTitle;
}

// 장르 변경 시: 적응형 라벨 적용 + (옵션) 기본 예시 프리셋 자동 채움
async function onGenreChange(fillPreset) {
  const genre = el("genre").value;
  const data = await ensurePlaybook(genre);
  const family = data?.playbook?.family || "general";
  applyGenreLabels(family);
  if (fillPreset) {
    applyPreset(data?.playbook?.preset);
    localStorage.setItem("sfAgentInput", JSON.stringify(collectInput()));
    el("runStatus").textContent = "예시 적용됨";
    toast(`${GENRE_LABELS_KO[genre] || genre} 장르 예시를 불러왔습니다.`, "info");
  }
  if (state.activeTab === "prompts") renderActiveTab();
}

// 드롭다운 표시용 한글 라벨
const GENRE_LABELS_KO = {
  aiForesight: "AI 미래예측 SF", cyberpunk: "사이버펑크", posthuman: "포스트휴먼",
  climate: "기후 SF", space: "우주 개척 SF", solarpunk: "솔라펑크",
  romanceFantasy: "로맨스판타지", modernFantasy: "현대판타지", academyFantasy: "아카데미 판타지",
  martialArts: "무협", modernRomance: "현대 로맨스", bl: "BL", chaebol: "재벌/기업",
  entertainment: "연예계/스포츠", altHistory: "대체역사", thriller: "스릴러/미스터리",
  healing: "힐링/일상", sfApocalypse: "SF/아포칼립스",
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

// 제작실 ↔ 운영실 전환: 에이전트 목록·입력 패널·탭을 통째로 스왑한다.
function setStudio(studio, opts = {}) {
  if (!STUDIOS[studio]) return;
  state.studio = studio;
  AGENTS = STUDIOS[studio];
  const ops = studio === "platform";

  document.querySelectorAll(".studio-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.studio === studio));
  document.querySelectorAll(".prod-only").forEach((n) => { n.hidden = ops; });
  document.querySelectorAll(".ops-only").forEach((n) => { n.hidden = !ops; });
  applyStudioLabels(ops);

  const runLabel = el("runAgent")?.querySelector("span:last-child");
  if (runLabel) runLabel.textContent = ops ? "운영 분석 실행" : "SF Agent 실행";
  el("workspaceTitle").textContent = ops
    ? "플랫폼 운영실"
    : (el("ipTitle").value || "AI 미래 SF 제작실");

  AGENTS.forEach((a) => { if (!(a.id in state.statuses)) state.statuses[a.id] = "idle"; });
  renderAgentGrid();
  renderTabs();
  setActiveTab(AGENTS[0].id);
  localStorage.setItem("sfAgentStudio", studio);
  if (!opts.silent) {
    el("runStatus").textContent = ops ? "운영실" : "제작실";
    toast(ops ? "운영실(Platform Intelligence)로 전환했습니다." : "제작실로 전환했습니다.", "info");
  }
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
  // 과학 근거 자료: 프롬프트용 합본 문자열(상한)과 복원용 배열을 함께 싣는다.
  if (state.references.length) {
    input.references = state.references
      .map((r) => `【${r.name}】\n${r.text}`)
      .join("\n\n")
      .slice(0, 6000);
    input._references = state.references;
  }
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
  state.references = Array.isArray(data._references) ? data._references : [];
  renderRefList();
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
  const md = [
    `## 적용 중인 흥행 문법 — ${p.label}`,
    `- 장르 핵심: ${p.core}`,
    `- 흥행 공식: ${p.formula}`,
    `- 핵심 보상: ${p.reward}`,
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
  ].join("\n");
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
    panel.innerHTML = `<div class="empty-state">‘${state.studio === "platform" ? "운영 분석 실행" : "SF Agent 실행"}’을 누르면 <strong>${AGENTS.find((a) => a.id === id)?.name}</strong> 산출물이 여기에 실시간으로 생성됩니다.</div>`;
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
  state.usage = { input_tokens: 0, output_tokens: 0 };
  AGENTS.forEach((a) => { state.statuses[a.id] = "idle"; updateAgentCard(a.id); });
  updateUsage();
  renderActiveTab();
}

function handleEvent(type, data) {
  switch (type) {
    case "meta":
      state.score = data.score ?? state.score;
      el("readinessChip").textContent = `제작도 ${state.score}%`;
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
      if (data.score != null) {
        state.score = data.score;
        el("readinessChip").textContent = `제작도 ${state.score}%`;
      }
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
  const pipeline = state.studio === "platform" ? "platform" : "production";

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
      ${action}
      ${nums.length && !state.chapterRunning ? `<button class="mini" id="novelDownload" type="button" title="생성된 회차를 하나의 소설 파일로 다운로드">⬇ 소설 다운로드</button>` : ""}
      ${maxCh > 1 && !state.chapterRunning ? `<button class="mini danger" id="chapterReset" type="button" title="2화 이후 생성 원고 삭제">원고 초기화</button>` : ""}
    </div>`;

  let body;
  if (!nums.length) {
    body = `<div class="empty-state">위에서 <strong>SF Agent 실행</strong>으로 1화 오프닝을 먼저 만들거나, <strong>다음 1화 생성</strong>으로 1화부터 시작하세요. 좋으면 다음 화를 이어서 생성합니다.</div>`;
  } else {
    body = nums.map((n) => {
      const streaming = state.chapterRunning && state.streamingChapter === n;
      const cursor = streaming ? '<span class="cursor"></span>' : "";
      const tag = streaming ? `<span class="chapter-tag">생성 중…</span>` : "";
      return `<article class="chapter-block">${tag}<div class="md-output manuscript">${window.renderMarkdown(map[n])}${cursor}</div></article>`;
    }).join('<hr class="chapter-sep" />');
  }
  return `<div class="chapter-studio">${controls}<div id="chapterList">${body}</div></div>`;
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
  const stop = el("chapterStop");
  if (stop) stop.addEventListener("click", () => { if (state.chapterController) state.chapterController.abort(); });
  const reset = el("chapterReset");
  if (reset) reset.addEventListener("click", resetChapters);
  const dl = el("novelDownload");
  if (dl) dl.addEventListener("click", downloadNovel);
}

function resetChapters() {
  if (state.chapterRunning) return;
  if (!confirm("2화 이후 생성한 원고를 삭제할까요? (1화 오프닝은 유지됩니다)")) return;
  state.chapters = {};
  toast("연속 원고를 초기화했습니다.", "info");
  if (state.activeTab === "draft") renderDraftStudio(el("outputPanel"));
}

function currentMaxChapter() {
  const nums = chapterNumbers();
  return nums.length ? Math.max(...nums) : 0;
}

// 한 번의 /api/chapter 요청(여러 화 배치)을 스트리밍 처리. running 상태는 호출부가 관리한다.
async function streamChapterRequest(from, count) {
  const prevText = from > 1 ? (chapterMap()[from - 1] || "") : "";
  const input = collectInput();
  const model = el("modelSelect").value || state.config.defaultModel;
  const res = await fetch("/api/chapter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input, model, fromChapter: from, count, total: state.totalChapters, prevText,
      ctx: { foresight: state.buffers.foresight, world: state.buffers.world, plot: state.buffers.plot },
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
      } else if (type === "error") {
        toast(d.message || "원고 생성 오류", "error");
      }
    }
  }
}

// 공통 실행 루프. toEnd=true면 결말(total)에 도달할 때까지 배치를 자동 반복한다.
async function runChapterLoop(from, toEnd) {
  if (state.chapterRunning || state.running) return;
  if (from > state.totalChapters) { toast(`이미 결말(${state.totalChapters}화)까지 생성했습니다.`, "warn"); return; }
  state.chapterRunning = true;
  state.streamingChapter = from;
  state.chapterController = new AbortController();
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
  } catch (err) {
    if (err.name === "AbortError") { el("runStatus").textContent = "중단됨"; toast("원고 생성을 중단했습니다.", "warn"); }
    else { el("runStatus").textContent = "오류"; toast(err.message || "원고 생성 실패", "error"); }
  } finally {
    state.chapterRunning = false;
    state.chapterController = null;
    state.streamingChapter = null;
    if (state.activeTab === "draft") renderDraftStudio(el("outputPanel"));
  }
}

// 다음 배치(state.batchSize) 1회만 생성.
function generateChapters() { return runChapterLoop(currentMaxChapter() + 1, false); }

// 결말(total)까지 자동 반복 생성.
function generateToEnd() { return runChapterLoop(currentMaxChapter() + 1, true); }

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
      body: JSON.stringify({ idea, genre: el("genre").value, model: el("modelSelect").value }),
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
  return { generatedAt: new Date().toISOString(), model: state.lastModel, agents, usage: state.usage, chapters };
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
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
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
    setStudio(p.input?.studio === "platform" ? "platform" : "production", { silent: true });
    fillForm(p.input || {});
    if (state.studio === "production") onGenreChange(false); // 장르 라벨 적용
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
    }
    state.score = p.score ?? 0;
    el("readinessChip").textContent = `제작도 ${state.score}%`;
    el("workspaceTitle").textContent = p.title || (state.studio === "platform" ? "플랫폼 운영실" : "AI 미래 SF 제작실");
    setActiveTab(AGENTS[0].id);
    toast("프로젝트를 불러왔습니다.", "success");
  } catch (err) {
    toast(err.message || "불러오기 실패", "error");
  }
}

function newProject() {
  state.currentProjectId = "";
  el("projectSelect").value = "";
  fillForm(DEFAULTS);
  if (state.studio === "production") onGenreChange(false); // 적응형 라벨 갱신
  el("workspaceTitle").textContent = state.studio === "platform" ? "플랫폼 운영실" : "웹소설 제작실";
  state.score = 0;
  el("readinessChip").textContent = "제작도 0%";
  resetRun();
  setActiveTab(AGENTS[0].id);
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
  renderAgentGrid();
  renderTabs();

  const saved = localStorage.getItem("sfAgentInput");
  if (saved) {
    try { fillForm(JSON.parse(saved)); } catch { fillForm(EXAMPLE); }
  } else {
    fillForm(EXAMPLE);
  }

  el("runAgent").addEventListener("click", runAgent);
  el("stopAgent").addEventListener("click", stopAgent);
  el("ideateBtn").addEventListener("click", ideateFill);
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
  el("agentForm").addEventListener("input", () => {
    el("runStatus").textContent = "수정됨";
    if (state.activeTab === "prompts") renderActiveTab();
  });

  AGENTS.forEach((a) => { state.statuses[a.id] = "idle"; });
  setActiveTab("foresight");
  loadConfig();
  loadProjects();
  // 초기 장르에 맞춰 라벨만 적용 (프리셋은 덮어쓰지 않음)
  onGenreChange(false);
  // 마지막으로 쓰던 스튜디오 복원
  if (localStorage.getItem("sfAgentStudio") === "platform") {
    setStudio("platform", { silent: true });
  }
}

document.addEventListener("DOMContentLoaded", boot);
