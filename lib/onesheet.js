"use strict";

/**
 * 감독 원시트 (Director One-Sheet) — Director-Agent 사전제작 레이어.
 *
 * 제품의 본질: 단순 콘티/영상 생성기가 아니라, 감독의 주제·캐릭터 내면·상징 오브젝트·
 * 시각/사운드 문법·장면 인과성을 하나의 '원시트(12블록)'로 구조화·잠그고(LOCK), 그 잠금값을
 * 기준으로 모든 산출물을 통제하는 엔진. 모든 장르·모든 매체에 공통 적용된다.
 *
 * 3원칙:
 *  1) 잠금값 > 프롬프트 — 주제·오브젝트·결말·문법·금지규칙을 LOCK해 모든 에이전트에 주입(연속성 보장).
 *  2) 감정은 설명 말고 사물로 번역 — "괴로워했다"(X) → 오브젝트·이미지·행동(O).
 *  3) 모든 장면은 기능 점수 — 압박↑/인물 노출/오브젝트 변형/최종 선택 전진 중 ≥1.
 *
 * 제공:
 *  - buildOneSheetPrompt/parseOneSheet/localOneSheet : 12블록 원시트 생성·파싱·폴백
 *  - buildOneSheetLockBlock : 잠긴 원시트를 모든 에이전트 프롬프트에 주입하는 LOCK 블록
 *  - INTEGRITY_DIMS/GATES, buildIntegrityPrompt/parseIntegrity/localIntegrity : 서사 무결성 100점 게이트
 *  - buildContePrompt/localConte : 컷별 콘티 + 6층 프롬프트 + 네거티브 프롬프트 컴파일
 */

const { resolveMedium, resolveFormat, mediumLabel, formatLabel, mediumStructureTarget } = require("./medium");

// 시각 매체(콘티·이미지/영상 프롬프트) vs 텍스트 매체(장면·문체).
const VISUAL_MEDIA = new Set(["animation", "film", "documentary", "drama", "advertising"]);
function isVisual(medium) { return VISUAL_MEDIA.has(resolveMedium(medium)); }

/** 12블록 정의. visualGrammar/soundGrammar/conte 라벨은 매체에 따라 적응. */
const ONESHEET_BLOCKS = [
  { key: "corePremise", label: "1. Core Premise (핵심 전제)", hint: "제목·러닝타임·장르·한 줄 콘셉트·관객이 마지막에 느낄 감정" },
  { key: "moralQuestion", label: "2. Moral Question (윤리적 질문)", hint: "작품이 끝까지 던지는 단 하나의 윤리적 질문" },
  { key: "emotionalWound", label: "3. Emotional Wound (내면 결핍)", hint: "주인공의 상처 · 믿는 거짓말 · 끝내 인정할 진실" },
  { key: "centralObject", label: "4. Central Object (핵심 오브젝트)", hint: "감정을 운반하는 사물 1개와 초반→중반→후반 의미 변화" },
  { key: "characterEngine", label: "5. Character Engine (캐릭터 엔진)", hint: "표면 욕망 · 숨은 욕망 · 가장 두려워하는 것 · 마지막 선택" },
  { key: "worldTexture", label: "6. World Texture (세계 질감)", hint: "시대 · 장소 · 사회 배경 · 공간 질감 · 날씨 · 반복 이미지" },
  { key: "visualGrammar", label: "7. Visual Grammar (시각 문법)", labelText: "7. 장면·문체 문법", hint: "색·조명·렌즈·카메라·화면비·금지할 시각 요소 (텍스트 매체: 문체·시점·묘사 밀도·절단)" },
  { key: "soundGrammar", label: "8. Sound Grammar (사운드 문법)", labelText: "8. 리듬·정서 문법", hint: "주요 사운드·반복 음향·침묵 지점·음악 톤·금지 음악 (텍스트 매체: 호흡·리듬·정서 톤)" },
  { key: "beatStructure", label: "9. Beat Structure (비트 구조)", hint: "5~9개 핵심 장면(Opening Image → … → Closing Image)" },
  { key: "continuityBible", label: "10. Continuity Bible (연속성 고정값)", hint: "주인공 외형·의상·소품·핵심 장소·반복 오브젝트·색 팔레트·시간대" },
  { key: "forbiddenDrift", label: "11. Forbidden Drift (금지 규칙)", hint: "절대 나오면 안 되는 것·캐릭터가 하지 말아야 할 행동·장르 이탈 금지·과장 금지" },
  { key: "evaluationRubric", label: "12. Evaluation Rubric (검수 기준)", hint: "이 작품의 무결성 검수 포인트(자동 채점은 서사 무결성 100점 루브릭으로)" },
];
const ONESHEET_KEYS = ONESHEET_BLOCKS.map((b) => b.key);

/** 매체에 맞는 블록 라벨(텍스트 매체는 시각/사운드 라벨을 문체/리듬으로). */
function blockLabel(block, medium) {
  return (!isVisual(medium) && block.labelText) ? block.labelText : block.label;
}

/* --------------------------- 원시트 생성 프롬프트 --------------------------- */
function buildOneSheetPrompt({ input = {}, medium, genre, format }) {
  const m = resolveMedium(medium);
  const f = resolveFormat(format);
  const visual = isVisual(m);
  const t = mediumStructureTarget(m, f);
  const seed = [
    input.ipTitle && `제목: ${input.ipTitle}`,
    input.logline && `로그라인: ${input.logline}`,
    input.sfPremise && `명제: ${input.sfPremise}`,
    input.protagonist && `인물: ${input.protagonist}`,
    input.centralConflict && `갈등: ${input.centralConflict}`,
    input.theme && `주제: ${input.theme}`,
    input.tone && `톤: ${input.tone}`,
    input.coreObject && `핵심 오브젝트(설계): ${input.coreObject}`,
    input.designSpec && typeof input.designSpec === "object"
      ? `설계 노브: ${Object.values(input.designSpec).filter(Boolean).slice(0, 8).join(" · ")}` : null,
  ].filter(Boolean).join("\n") || "(거의 비어 있음 — 아이디어 한 줄 수준)";

  const grammarNote = visual
    ? "visualGrammar는 색·조명·렌즈·카메라 움직임·화면비·금지할 시각 요소를. soundGrammar는 주요 사운드·반복 음향·침묵 지점·음악 톤·금지 음악을 적는다."
    : "이 매체는 텍스트 기반이다. visualGrammar에는 '문체·시점·묘사 밀도·절단·정보 공개 속도'를, soundGrammar에는 '호흡·리듬·정서 톤·강약'을 적는다.";

  const system = `너는 AI Director Agent다. 너의 임무는 멋진 컷을 뽑는 게 아니라, 감독의 의도·감정 연속성·상징 구조·일관성을 작품 전체에 보존하는 '감독 원시트(One-Sheet)'를 설계하는 것이다. (Director Intent + Dramaturgy + Sensibility + World Bible 역할을 한 번에 수행한다)

[설계 위계 — 반드시 이 순서를 지킨다]
1. 감독 의도가 시각적 화려함보다 우선이다.
2. 감정 인과가 플롯 복잡성보다 우선이다.
3. 핵심 오브젝트는 작품 전반에 걸쳐 '의미가 변해야' 한다(초반→중반→후반).
4. 모든 장면(beat)은 '압박 증가 / 인물 내면 노출 / 오브젝트 의미 변형 / 최종 선택 전진' 중 최소 하나를 한다. 장식용 장면 금지.
5. 감정은 설명하지 말고 사물·공간·행동으로 번역한다("괴로워했다"가 아니라, 오브젝트·이미지로 보여준다).
6. forbiddenDrift(금지 규칙)와 continuityBible(연속성 고정값)을 분명히 못 박는다.

[매체·장르 맥락]
- 매체: ${mediumLabel(m)} · 포맷: ${formatLabel(f)} (구조 타깃: ${t.count}${t.unit}, ${t.runtime}) · 장르 정서: ${genre || "(미지정)"}
- ${grammarNote}
- beatStructure는 ${visual ? "Opening Image → Disruption → First Pressure → False Escape → Object Revelation → Moral Collapse → Final Choice → Closing Image" : "기/도입 → 사건 → 첫 압박 → 회피 → 진실 노출 → 붕괴/전환 → 최종 선택 → 잔상"} 흐름의 5~9개 핵심 장면으로, 각 장면이 무슨 기능을 하는지 한 줄씩.

[출력 — JSON 하나만. 코드펜스·설명 금지. 12개 키를 모두 채운다. 각 값은 한국어 Markdown 텍스트(여러 줄 가능)]
{
  "corePremise": "제목/러닝타임/장르/한 줄 콘셉트/관객이 마지막에 느낄 감정",
  "moralQuestion": "이 작품의 단 하나의 윤리적 질문",
  "emotionalWound": "주인공의 상처 / 믿는 거짓말 / 끝내 인정할 진실",
  "centralObject": "핵심 오브젝트 1개 / 상징 / 의미 변화(초반→중반→후반)",
  "characterEngine": "이름 / 표면 욕망 / 숨은 욕망 / 가장 두려워하는 것 / 마지막 선택",
  "worldTexture": "시대 / 장소 / 사회 배경 / 공간 질감 / 날씨 / 반복 이미지",
  "visualGrammar": "${visual ? "색 / 조명 / 렌즈 / 카메라 / 화면비 / 금지할 시각 요소" : "문체 / 시점 / 묘사 밀도 / 절단 / 정보 공개 속도"}",
  "soundGrammar": "${visual ? "주요 사운드 / 반복 음향 / 침묵 지점 / 음악 톤 / 금지 음악" : "호흡 / 리듬 / 정서 톤 / 강약"}",
  "beatStructure": "Beat 1 ~ Beat N. 각 비트: 무슨 일이 일어나고 어떤 기능을 하는가(한 줄씩, 줄바꿈)",
  "continuityBible": "주인공 외형 / 의상 / 소품 / 핵심 장소 / 반복 오브젝트 / 색 팔레트 / 시간대 (고정값)",
  "forbiddenDrift": "절대 나오면 안 되는 것들(불릿 여러 개) — 장르 이탈·과장·금지 행동 등",
  "evaluationRubric": "이 작품을 검수할 핵심 포인트 4~6개(스토리 인과/감정 연속/오브젝트 기능/일관성/주제 밀도/엔딩 잔상)"
}`;
  const user = `[감독 의도 입력 — 빈약할 수 있음]
${seed}

위 입력을 ${mediumLabel(m)} 감독 원시트(12블록 JSON)로 구조화하라. 약하면 위 위계·원칙에 따라 흥행 단편 수준으로 적극 설계하되, 씨앗은 보존한다.`;
  return { system, user };
}

function parseOneSheet(text) {
  if (!text) return null;
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1 || e <= s) return null;
  const raw = text.slice(s, e + 1);
  let obj = null;
  try { obj = JSON.parse(raw); } catch { try { obj = JSON.parse(raw.replace(/,(\s*[}\]])/g, "$1")); } catch { return null; } }
  if (!obj || typeof obj !== "object") return null;
  const out = {};
  let filled = 0;
  ONESHEET_KEYS.forEach((k) => {
    const v = obj[k];
    out[k] = (v == null) ? "" : (Array.isArray(v) ? v.map(String).join("\n") : String(v)).trim();
    if (out[k]) filled += 1;
  });
  return filled >= 6 ? out : null;
}

/** 결정론 폴백(키 없을 때). 입력·설계값으로 12블록을 구성. */
function localOneSheet({ input = {}, medium, genre, format }) {
  const m = resolveMedium(medium);
  const visual = isVisual(m);
  const t = mediumStructureTarget(m, format);
  const ds = (input.designSpec && typeof input.designSpec === "object") ? input.designSpec : {};
  const obj = ds.coreObject || input.coreObject || "상징물 1개(예: 인형·사진·편지)";
  const title = input.ipTitle || "무제";
  const hero = String(input.protagonist || "주인공").split(/[,，(]/)[0].trim();
  return {
    corePremise: `제목: ${title} / 러닝타임: ${ds.runtime || ds.runningTime || t.runtime} / 장르: ${genre || "드라마"} / 콘셉트: ${input.logline || "한 인물이 숨긴 것 때문에 무너지는 이야기"} / 마지막 감정: ${input.theme ? input.theme : "조용한 불편함과 안도"}`,
    moralQuestion: `인간은 자신만 아는 죄를 끝까지 숨길 수 있는가?`,
    emotionalWound: `상처: ${hero}은(는) 책임을 인정하지 못한다 / 거짓말: 숨기면 없던 일이 된다 / 진실: 인정해야만 사람으로 돌아온다`,
    centralObject: `${obj} — 초반: 증거 / 중반: 따라다니는 목격자 / 후반: 구원의 길`,
    characterEngine: `${hero} / 표면 욕망: ${input.desire || "평온을 지킨다"} / 숨은 욕망: 용서받는다 / 두려움: 정체가 드러남 / 마지막 선택: ${input.seasonGoal || "자백"}`,
    worldTexture: `${ds.setting || "비 오는 밤의 도시"} / 사회: 익명의 군중 / 질감: 젖은 아스팔트·차가운 형광 / 반복 이미지: 빗방울`,
    visualGrammar: visual
      ? `색: ${ds.palette || ds.colorPalette || "차가운 블루·젖은 그레이"} / 조명: 저조도·빗물 반사 / 카메라: 느린 달리·고정 클로즈업 / 화면비: ${ds.aspectRatio || ds.cameraFormat || "2.39:1"} / 금지: 핸드헬드 액션`
      : `문체: 절제·짧은 호흡 / 시점: 1인칭 밀착 / 묘사: 사물 중심 / 절단: 강하게 / 정보: 천천히`,
    soundGrammar: visual
      ? `주요 사운드: 빗소리·앰비언스 / 침묵: 자백 직전 / 음악: 미니멀 / 금지: 감상적 오케스트라`
      : `호흡: 느리게 / 리듬: 정적→폭발 / 정서: 절제 / 강약: 결정적 장면에만`,
    beatStructure: `Beat 1. Opening Image — 세계의 고독 제시\nBeat 2. Disruption — 사건/오브젝트 등장\nBeat 3. First Pressure — 오브젝트가 다시 나타남\nBeat 4. False Escape — 회피 시도\nBeat 5. Object Revelation — 진실/죄책감 폭로\nBeat 6. Moral Collapse — 무너짐\nBeat 7. Final Choice — 자백/희생\nBeat 8. Closing Image — 주제의 시각적 잔상`,
    continuityBible: `${hero}: ${ds.characterCount || "1~2명"} / 의상: 어두운 코트 / 핵심 장소: ${ds.setting || "단일 밀폐 공간"} / 반복 오브젝트: ${obj} / 팔레트: 차가운 톤 / 시간대: 늦은 밤`,
    forbiddenDrift: `- 코미디 금지\n- 추격 액션 금지\n- 괴물/점프스케어 금지\n- 설명형 내레이션 금지\n- 감상적 음악 남발 금지`,
    evaluationRubric: `스토리 인과 / 감정 연속 / 오브젝트 기능 / 표현 일관성 / 주제 밀도 / 엔딩 잔상`,
    _local: true,
  };
}

/** 잠긴 원시트를 모든 에이전트 프롬프트에 주입하는 LOCK 블록(전 매체·장르 공통). */
function buildOneSheetLockBlock(oneSheet, medium) {
  if (!oneSheet || typeof oneSheet !== "object") return "";
  const has = ONESHEET_KEYS.some((k) => String(oneSheet[k] || "").trim());
  if (!has) return "";
  const m = resolveMedium(medium);
  const visual = isVisual(m);
  const g = (k) => String(oneSheet[k] || "").trim();
  const lines = [
    `# 🔒 감독 원시트 LOCK (절대 준수 — 이 잠금값을 벗어나는 산출은 무효다. 1화든 마지막이든 동일 강제력)`,
    g("moralQuestion") && `- 주제·윤리적 질문: ${g("moralQuestion")}`,
    g("centralObject") && `- 핵심 오브젝트(의미 변화): ${g("centralObject")}`,
    g("emotionalWound") && `- 감정 결핍(거짓→진실): ${g("emotionalWound")}`,
    g("characterEngine") && `- 캐릭터 엔진·최종 선택: ${g("characterEngine")}`,
    g("visualGrammar") && `- ${visual ? "시각 문법" : "문체·장면 문법"}: ${g("visualGrammar")}`,
    g("soundGrammar") && `- ${visual ? "사운드 문법" : "리듬·정서 문법"}: ${g("soundGrammar")}`,
    g("worldTexture") && `- 세계 질감: ${g("worldTexture")}`,
    g("continuityBible") && `- 연속성 바이블(고정값, 변형 금지): ${g("continuityBible")}`,
  ].filter(Boolean);
  const forbidden = g("forbiddenDrift");
  if (forbidden) lines.push(`\n[🚫 금지 규칙(Forbidden Drift) — 절대 등장/이탈 금지]\n${forbidden}`);
  lines.push(`\n[감수성 원칙] 감정을 설명하지 말고 사물·공간·행동으로 번역한다. 모든 장면은 '압박 증가 / 인물 내면 노출 / 오브젝트 의미 변형 / 최종 선택 전진' 중 최소 하나를 수행한다. 장식용 장면은 만들지 않는다.`);
  return lines.join("\n");
}

/* --------------------------- 서사 무결성 (100점 게이트) --------------------------- */
const INTEGRITY_DIMS = [
  ["스토리인과성", 20], ["감정연속성", 20], ["오브젝트상징", 15],
  ["표현일관성", 15], ["주제밀도", 15], ["엔딩임팩트", 15],
];
const INTEGRITY_GATES = { plan: 85, conte: 80, prompt: 80, regen: 79, rewrite: 70 };

function buildIntegrityPrompt({ input = {}, medium, oneSheet, digest }) {
  const m = resolveMedium(medium);
  const lock = buildOneSheetLockBlock(oneSheet, m);
  const dimList = INTEGRITY_DIMS.map(([k, w]) => `- ${k} (${w}점)`).join("\n");
  const keys = INTEGRITY_DIMS.map(([k, w]) => `"${k}": 0~${w}`).join(", ");
  const system = `너는 서사 무결성 심사관(Story Integrity Judge)이다. '잘 만들었나'가 아니라, 감독 원시트의 주제·감정 인과·상징·일관성을 산출물이 실제로 이행하는지 100점 기준으로 냉정하게 채점한다. 후하게 주지 마라.

[감독 원시트 LOCK — 채점 기준]
${lock || "(원시트 없음 — 일반 서사 무결성 기준으로 채점)"}

[100점 루브릭]
${dimList}

[감수성 가산/감점]
- 감정을 '설명'했으면 감점, '사물·이미지·행동'으로 보여줬으면 가점.
- 장식용(기능 없는) 장면이 있으면 감점. 모든 장면은 압박/노출/오브젝트변형/최종선택 중 ≥1을 해야 한다.

[게이트] 기획 ${INTEGRITY_GATES.plan}점·콘티/프롬프트 ${INTEGRITY_GATES.conte}점 이상 통과. ${INTEGRITY_GATES.regen}점 이하 재생성, ${INTEGRITY_GATES.rewrite}점 이하 구조 재작성.

[출력 — JSON 하나만. 코드펜스·설명 금지]
{
  "overall": 0~100,
  "scores": { ${keys} },
  "gate": "통과 / 재생성 / 구조 재작성 중 하나",
  "weak": ["가장 약한 항목과 이유 2~4개"],
  "fixes": ["원시트 기준에 맞춘 구체 수정 지시 3~6개"],
  "verdict": "한 줄 총평(정직하게)"
}`;
  const user = `매체: ${mediumLabel(m)}\n\n## [심사할 산출물 발췌]\n${String(digest || "").slice(0, 30000)}\n\n위 산출물을 감독 원시트 LOCK 기준으로 서사 무결성 100점 채점하라.`;
  return { system, user };
}

function parseIntegrity(text) {
  if (!text) return null;
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1 || e <= s) return null;
  const raw = text.slice(s, e + 1);
  let obj = null;
  try { obj = JSON.parse(raw); } catch { try { obj = JSON.parse(raw.replace(/,(\s*[}\]])/g, "$1")); } catch { return null; } }
  if (!obj || typeof obj !== "object") return null;
  const num = (v, fb) => { const n = Number(v); return Number.isFinite(n) ? n : fb; };
  const arr = (x) => (Array.isArray(x) ? x.map(String).filter(Boolean) : []);
  const scores = {};
  INTEGRITY_DIMS.forEach(([k, w]) => { scores[k] = Math.max(0, Math.min(w, num(obj.scores?.[k], 0))); });
  const overall = num(obj.overall, Object.values(scores).reduce((a, b) => a + b, 0));
  return {
    overall: Math.max(0, Math.min(100, overall)),
    scores,
    gate: String(obj.gate || "").trim() || gateOf(overall, "conte"),
    weak: arr(obj.weak),
    fixes: arr(obj.fixes),
    verdict: String(obj.verdict || "").trim(),
    dims: INTEGRITY_DIMS,
  };
}

function gateOf(score, stage) {
  const pass = stage === "plan" ? INTEGRITY_GATES.plan : INTEGRITY_GATES.conte;
  if (score >= pass) return "통과";
  if (score <= INTEGRITY_GATES.rewrite) return "구조 재작성";
  return "재생성";
}

/** 결정론 무결성 채점(신호 기반). */
function scoreIntegritySignals(digest, oneSheet) {
  const t = String(digest || "");
  const obj = (oneSheet && String(oneSheet.centralObject || "").trim()) || "";
  const objWord = obj.split(/[\s—/(]/)[0];
  const scores = {};
  const causal = /(때문에|그래서|결국|탓에|이유로)/.test(t);
  const emotionShown = /(떨어졌다|남았다|젖은|그림자|빗방울|클로즈업|침묵|놓았다|쥐었다)/.test(t);
  const objUsed = objWord && t.includes(objWord);
  const themeRep = /(죄책감|구원|진실|기억|상실|정체성|용서)/.test(t);
  const ending = /(자백|고백|선택했다|마지막|잔상|닫|페이드)/.test(t);
  scores["스토리인과성"] = causal ? 16 : 9;
  scores["감정연속성"] = emotionShown ? 16 : 9;
  scores["오브젝트상징"] = objUsed ? 13 : 6;
  scores["표현일관성"] = 11;
  scores["주제밀도"] = themeRep ? 12 : 7;
  scores["엔딩임팩트"] = ending ? 12 : 7;
  const overall = Object.values(scores).reduce((a, b) => a + b, 0);
  return { overall, scores };
}

function localIntegrity(input, medium, oneSheet, digest) {
  const sg = scoreIntegritySignals(digest, oneSheet);
  return {
    overall: sg.overall,
    scores: sg.scores,
    gate: gateOf(sg.overall, "conte"),
    weak: Object.entries(sg.scores).sort((a, b) => (a[1] / dimWeight(a[0])) - (b[1] / dimWeight(b[0]))).slice(0, 2).map(([k]) => `${k} 보강 필요`),
    fixes: [
      "감정을 사물·이미지·행동으로 번역하라(설명 금지).",
      "핵심 오브젝트의 의미를 장면마다 변주하라.",
      "장식용 장면을 제거하고, 각 장면이 압박/노출/오브젝트/선택 중 1개를 하게 하라.",
    ],
    verdict: `결정론 추정 ${sg.overall}/100 (${gateOf(sg.overall, "conte")}). 실제 무결성 심사는 키/구독 연결 시 정밀해집니다.`,
    dims: INTEGRITY_DIMS,
    fallback: true,
  };
}
function dimWeight(k) { const d = INTEGRITY_DIMS.find((x) => x[0] === k); return d ? d[1] : 15; }

/* ----------------------------- 콘티 + 6층 프롬프트 ----------------------------- */
function buildContePrompt({ input = {}, medium, oneSheet, format }) {
  const m = resolveMedium(medium);
  const visual = isVisual(m);
  const t = mediumStructureTarget(m, format);
  const lock = buildOneSheetLockBlock(oneSheet, m);
  const unit = visual ? "컷" : "장면";
  const n = Math.max(6, Math.min(visual ? 14 : 10, t.count > 24 ? 12 : t.count));
  const promptKind = visual ? "이미지/영상 생성 프롬프트" : "장면 집필 프롬프트";
  const system = `너는 콘티 작가 겸 프롬프트 컴파일러다. 감독 원시트 LOCK을 기준으로 ${n}개 내외의 ${unit} 콘티를 만들고, 각 ${unit}마다 6층 구조의 ${promptKind}를 컴파일한다.

${lock}

[각 ${unit}이 가질 필드]
- Shot ID(S01-C01 형식) · Beat 기능(서사에서 하는 일) · 감정값(0~100) · 비주얼 포커스(가장 중요한 대상) · 오브젝트 상태(핵심 오브젝트가 어떻게 보이는지) · 카메라(렌즈·앵글·움직임) · 예상 초수
- 6층 프롬프트: [1]전역 스타일/문법 [2]캐릭터 LOCK [3]장면 목적 [4]감정 서브텍스트(대사 없이 전달) [5]카메라·조명(또는 문체) [6]네거티브(금지 요소)

[원칙] 감정은 설명 말고 사물·행동으로. 각 ${unit}은 압박/노출/오브젝트변형/최종선택 중 ≥1. 연속성 토큰(반복 오브젝트·색·시간대)을 모든 프롬프트에 반복 주입. 금지 규칙을 네거티브에 반영.

[출력 — 한국어 Markdown]
## 콘티 그리드
| ${unit} | Beat 기능 | 감정 | 비주얼 포커스 | 오브젝트 상태 | 카메라 | 초 |
|---|---|---|---|---|---|---|
(${n}행)

## ${unit}별 프롬프트 팩
각 ${unit}마다:
### S0X-C0Y
- **GLOBAL STYLE**: …
- **CHARACTER LOCK**: …
- **SCENE PURPOSE**: …
- **EMOTIONAL SUBTEXT**: …
- **${visual ? "CAMERA / LIGHTING" : "문체 / 시점"}**: …
- **CONTINUITY**: …
- **NEGATIVE**: …`;
  const user = `매체: ${mediumLabel(m)} · 포맷: ${formatLabel(format)} (${t.count}${t.unit})\n작품: ${input.ipTitle || "무제"}\n\n위 원시트 LOCK으로 ${n}개 내외 ${unit} 콘티와 6층 프롬프트 팩을 컴파일하라.`;
  return { system, user };
}

function localConte({ input = {}, medium, oneSheet, format }) {
  const m = resolveMedium(medium);
  const visual = isVisual(m);
  const unit = visual ? "컷" : "장면";
  const objRaw = (oneSheet && oneSheet.centralObject) || input.coreObject || "오브젝트";
  const obj = String(objRaw).split(/[—/(]/)[0].trim();
  const rows = [
    ["S01-C01", "세계의 고독 제시", 30, "공간 전경", "없음"],
    ["S02-C03", "사건/죄의 흔적 등장", 55, obj, "처음 등장"],
    ["S04-C02", "회피 실패·재등장", 72, obj, "예상 밖 위치에 다시"],
    ["S06-C01", "붕괴", 84, "주인공 얼굴", "손에 쥐어짐"],
    ["S07-C01", "최종 선택(자백)", 95, obj, "내려놓음"],
    ["S08-C01", "잔상", 60, "빈 공간", "남겨진 흔적"],
  ];
  const table = `| ${unit} | Beat 기능 | 감정 | 비주얼 포커스 | 오브젝트 상태 |\n|---|---|---|---|---|\n` +
    rows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} | ${r[4]} |`).join("\n");
  return [
    `## 콘티 그리드 (로컬 데모)`,
    table,
    ``,
    `> API 키 연결 시 각 ${unit}마다 6층 ${visual ? "이미지/영상" : "집필"} 프롬프트 + 네거티브가 컴파일됩니다.`,
  ].join("\n");
}

module.exports = {
  ONESHEET_BLOCKS, ONESHEET_KEYS, blockLabel, isVisual,
  buildOneSheetPrompt, parseOneSheet, localOneSheet, buildOneSheetLockBlock,
  INTEGRITY_DIMS, INTEGRITY_GATES, gateOf,
  buildIntegrityPrompt, parseIntegrity, localIntegrity, scoreIntegritySignals,
  buildContePrompt, localConte,
};
