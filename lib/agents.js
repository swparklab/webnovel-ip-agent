







































































"use strict";

/**
 * Agent definitions for the SF WebNovel production pipeline.
 *
 * Each agent is a real LLM call. Agents declare `dependsOn` so the
 * orchestrator can run independent agents in parallel and feed the
 * condensed outputs of upstream agents into downstream prompts.
 *
 * Every agent streams Markdown so the UI can render it live.
 */

const { buildPlaybookBlock, checklistBlock, getPlaybook } = require("./playbook");

const GENRE_LABELS = {
  // SF 특화
  aiForesight: "AI 미래예측 SF",
  cyberpunk: "사이버펑크",
  posthuman: "포스트휴먼",
  climate: "기후 SF",
  space: "우주 개척 SF",
  solarpunk: "솔라펑크",
  // 무협 특화
  wuxiaOrthodox: "정통 무협",
  wuxiaNew: "신무협",
  xianxia: "선협 · 수선",
  murimReturn: "무림 회귀 · 환생",
  fusionMurim: "퓨전 무협 (시스템·이세계)",
  // 웹소설 메인 장르
  romanceFantasy: "로맨스판타지",
  modernFantasy: "현대판타지/헌터/시스템",
  academyFantasy: "판타지/아카데미/게임판타지",
  martialArts: "무협",
  modernRomance: "현대 로맨스",
  bl: "BL",
  chaebol: "재벌/기업/전문직",
  entertainment: "연예계/아이돌/스포츠",
  altHistory: "대체역사/전쟁/밀리터리",
  thriller: "스릴러/미스터리/공포",
  healing: "힐링/일상/요리/농장",
  sfApocalypse: "SF/디스토피아/아포칼립스",
};

const PLATFORM_LABELS = {
  kakao: "카카오페이지",
  naver: "네이버시리즈",
  ridi: "리디",
  novelpia: "노벨피아",
  global: "글로벌 동시 기획",
};

const CADENCE_LABELS = {
  daily: "매일 연재",
  five: "주 5회",
  three: "주 3회",
  season: "시즌제",
};

function genreLabel(value) {
  return GENRE_LABELS[value] || "AI 미래예측 SF";
}

function val(value, fallback = "미정") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

/** A compact, shared description of the IP — injected into every agent. */
function buildInputBlock(input) {
  const branches = [
    input.webtoonBranch && "웹툰",
    input.globalBranch && "글로벌",
    input.fanCommunity && "팬 채널",
    input.commerceBranch && "굿즈",
  ].filter(Boolean);

  const sub = getPlaybook(input.genre, input.subgenre).sub;
  const blendLabels = String(input.blendGenres || "")
    .split(",").map((s) => s.trim())
    .filter((k) => k && k !== input.genre && GENRE_LABELS[k])
    .map((k) => GENRE_LABELS[k]);
  const plats = String(input.platforms || "")
    .split(",").map((s) => s.trim()).filter((k) => PLATFORM_LABELS[k]);
  const platLine = plats.length
    ? plats.map((p) => PLATFORM_LABELS[p]).join(", ")
    : (input.platform && PLATFORM_LABELS[input.platform] ? PLATFORM_LABELS[input.platform] : "플랫폼 무관(미선택) — 플랫폼 색에 얽매이지 않음");

  // 심화 기획(IP Bible) — 채워진 항목만 구속 조건으로 싣는다.
  const bible = [
    ["힘·능력 체계(성장 등급)", input.powerSystem],
    ["핵심 세력·진영", input.factions],
    ["세계 이전사·핵심 연표", input.worldHistory],
    ["주인공의 비밀·치명적 약점", input.protagonistSecret],
    ["조력자·동료(이름·역할)", input.supportingCast],
    ["관계 상대·히로인(관계 온도)", input.loveInterest],
    ["적대자의 목적·논리", input.antagonistLogic],
    ["중심 갈등", input.centralConflict],
    ["중심 떡밥·미스터리", input.coreMystery],
    ["계획된 반전·금지된 선택", input.twistPlan],
    ["성장·떡밥 회수 계획", input.payoffPlan],
    ["주제의식·메시지", input.theme],
    ["차별점(USP)", input.usp],
    ["비교작·레퍼런스", input.comps],
    ["연령등급·수위", input.contentRating],
  ].filter(([, v]) => String(v ?? "").trim());
  const bibleBlock = bible.length
    ? `\n# 심화 기획 (IP Bible) — 아래 채워진 항목은 '구속 조건'이다. 빠짐없이 반영하고 임의로 바꾸지 마라.\n${bible.map(([k, v]) => `- ${k}: ${v}`).join("\n")}`
    : null;
  return [
    `# 작품 입력 데이터`,
    `- IP 제목: ${val(input.ipTitle, "무제")}`,
    `- 장르: ${genreLabel(input.genre)}${sub ? ` ▸ ${sub.label}` : ""}${blendLabels.length ? ` (혼합: ${blendLabels.join(", ")})` : ""}`,
    `- 연재 플랫폼: ${platLine}`,
    `- 연재 리듬: ${CADENCE_LABELS[input.cadence] || "매일 연재"}`,
    `- 시대/배경 시점: ${val(input.futureYear)}`,
    `- 타깃 독자: ${val(input.targetReader)}`,
    `- 한 줄 콘셉트(로그라인): ${val(input.logline)}`,
    `- 작품 명제(핵심 질문): ${val(input.sfPremise)}`,
    `- 핵심 소재·장치: ${val(input.coreTech)}`,
    `- 핵심 제약·규칙: ${val(input.scienceConstraint)}`,
    `- 세계·사회·관계 변화: ${val(input.socialShift)}`,
    `- 주인공: ${val(input.protagonist)}`,
    `- 핵심 욕망: ${val(input.desire)}`,
    `- 핵심 존재(조력/적대/시스템): ${val(input.aiEntity)}`,
    `- 적대 압력: ${val(input.antagonist)}`,
    `- 세계 규칙: ${val(input.worldRule)}`,
    `- 시즌 목표: ${val(input.seasonGoal)}`,
    `- 톤 앤 매너: ${val(input.tone)}`,
    input.manuscript ? `- 작가가 제공한 원고/메모:\n${input.manuscript}` : null,
    input.feedback ? `- 독자 반응/지표:\n${input.feedback}` : null,
    branches.length ? `- 확장 분기 요청: ${branches.join(", ")}` : null,
    bibleBlock,
    input.references
      ? `\n# 업로드한 과학 근거 자료 (논문·자료에서 추출 — 과학소재·개연성의 근거로 활용)\n${String(input.references).slice(0, 5000)}`
      : null,
    ``,
    buildPlaybookBlock(input.genre, input.subgenre, input.blendGenres),
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n");
}

/** Shared genre-agnostic production doctrine appended to each system prompt. */
const DOCTRINE = `[웹소설 제작 원칙]
1. 설정은 설명하지 말고 사건으로 보여준다.
2. 세계 규칙·시스템은 전능한 장치가 아니라 제약·대가·비용을 가진다.
3. 세계 변화는 주인공의 생존 조건(돈·관계·신분·생존·인정)을 직접 바꾼다.
4. 매 회차에는 첫 보상·금지된 선택·새 단서·역전 중 하나가 반드시 남는다.
5. 시즌 피날레에서는 판(세계 질서)이 눈에 보이게 흔들린다.
6. 한국 웹소설 독자의 호흡(빠른 사건, 강한 절단, 사이다)을 지킨다.

[흥행 문법 — 입력의 '흥행 문법' 블록을 반드시 따른다]
- 장르명을 나열하지 말고 '결핍 → 특권(주인공 특수성) → 회차별 검증 → 즉시 보상 → 세계 확장' 구조를 만든다.
- 주인공은 관찰자가 아니라 판을 바꾸는 행위자다.
- 입력의 '초반 5화 공식'과 '반복 루프'를 회차 설계의 뼈대로 쓴다.
- 입력의 '독자 결핍/주인공 유형'과 '필수 흥행 장치', '제목 문법'을 적극 활용한다.
- 입력의 '피해야 할 실패 패턴'을 절대 범하지 않는다.
- 선택된 장르의 정서·관습(로맨스/무협/현판/추리 등)에 맞게 표현한다. SF가 아니면 SF 용어를 쓰지 않는다.
- '업로드한 과학 근거 자료'가 있으면 과학소재·기술의 개연성을 그 자료의 개념·메커니즘·수치에 근거해 구체적으로 설명한다(단, 원문을 그대로 베끼지 말고 작품 언어로 녹인다).

[심화 기획(IP Bible) 하네스 — 가장 강한 구속]
- 입력의 'IP Bible' 항목(힘 체계·세력·이전사·주인공 비밀·조력자·관계·적대 논리·중심 갈등·떡밥·반전·회수 계획·주제·차별점·비교작·등급)은 작가가 확정한 설정이다. 채워진 항목은 한 글자도 흘리지 말고 그대로 반영한다.
- 인물 이름·관계·세력·반전·주제는 IP Bible에 있으면 그것을 최우선으로 따른다. 임의로 새 이름/설정으로 바꾸지 않는다.
- 비어 있는 항목만 장르 흥행 문법에 근거해 보강하되, 채워진 항목과 모순되지 않게 한다.
- 모든 회차·설정·전개는 'IP Bible의 중심 갈등·떡밥·주제'를 향해 정렬한다(곁가지로 새지 않는다).

[출력 형식]
- 한국어로 작성한다.
- 지정된 Markdown 구조(## 제목, 표, 목록)를 정확히 따른다.
- 군더더기 인사말·메타 발언("알겠습니다" 등) 없이 결과물만 출력한다.`;

/** Condense an upstream agent's output so downstream prompts stay lean. */
function condense(text, limit = 1800) {
  const clean = String(text || "").trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit)}\n…(이하 생략)`;
}

function upstream(context, ids) {
  return ids
    .map((id) => {
      const entry = context[id];
      if (!entry) return null;
      return `## [${entry.name} 산출물]\n${condense(entry.text)}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

const AGENTS = [
  {
    id: "foresight",
    name: "Foresight Agent",
    icon: "radar",
    tabs: ["brief"],
    dependsOn: [],
    temperature: 0.6,
    system: `너는 웹소설의 기획 총괄(Foresight Agent)이다.
작가의 아이디어를 선택된 장르의 '연재 가능한 IP의 약속'으로 정리한다.

${DOCTRINE}

[출력 구조]
## 제작 판단
- 현재 기획 완성도를 1~2문장으로 진단하고, 다음에 무엇을 강화해야 하는지 한 문장으로 지시.

## 한 문장 피치
- 주인공/핵심 장치/사회·관계 압력/독자 보상을 담은, 다듬은 로그라인 1개.

## 작품 명제
- 작품이 끝까지 붙들 핵심 질문(약속) 1개. (없으면 입력을 토대로 새로 제안)

## 결핍-특권 구조
- 주인공의 핵심 결핍 1개와 그를 특별하게 만드는 특권(특수성) 1개를 한 줄씩. (흥행 문법의 주인공 유형·생성 변수에서 고른다)

## 장르 약속과 독자 보상
- 이 작품이 독자에게 주는 핵심 쾌감 3가지를 불릿으로. (장르 핵심 보상을 반드시 반영)

## 연재 운영 원칙
- 이 작품에 특화된 회차 운영 원칙 4가지를 불릿으로.

## 추천 제목 5개
- 흥행 문법의 '제목 문법' 톤을 그대로 따라 이 작품에 맞는 웹소설 제목 5개를 《제목》 형식 불릿으로.

## 핵심 키워드
- 검색/태깅용 키워드 8~12개를 \`태그1, 태그2 …\` 한 줄로.`,
    buildUser(input) {
      return `${buildInputBlock(input)}\n\n위 데이터로 제작 브리프를 작성하라.`;
    },
  },

  {
    id: "world",
    name: "세계관 바이블",
    icon: "atom",
    tabs: ["world", "timeline"],
    dependsOn: ["foresight"],
    temperature: 0.6,
    system: `너는 장르 세계관 설계자(World Bible Agent)다.
핵심 소재·장치, 제약·규칙, 세계·사회·관계 구조를 개연성 있는 세계관 바이블로 구조화한다.
장치의 '제약·대가'에서 갈등이 나오도록 설계하는 것이 핵심이다.
그리고 무엇보다, 산출물 맨 앞에 '작품개요'를 둬서 이것만 읽어도 독자가 "이거 당장 읽고 싶다"고 느끼게 만든다.

${DOCTRINE}

[작품개요 작성 규칙 — 가장 중요]
- '작품개요'는 투자자·독자에게 던지는 1페이지 피치다. 밋밋하면 실패다. 치명적 이해관계, 금지된 선택, 반전 떡밥을 반드시 심는다.
- 다섯 항목을 정확히 이 순서로 쓴다: 작품장르 / 과학소재 / 로그라인 / 기획의도 / 줄거리.
- 작품장르: 주장르 + 결합 서브장르를 함께 적어 '혼합형'임을 드러낸다. (예: 하드 SF × 연구소 스릴러 × 도시 재난)
- 과학소재: SF면 실재하는 과학·기술 근거를 한 줄로 깔고 작품적 확장을 잇는다. 비SF 장르면 항목명을 '핵심 소재'로 바꾸고 그 장르의 핵심 장치를 쓴다.
- 로그라인: 한 문장. '누가/무엇을 잃고/어떤 금지된 선택을 하는가'가 들어가 다음이 궁금해야 한다.
- 기획의도: 목표 독자 + 이 작품이 긁어주는 욕망 또는 공포 + 왜 지금 이 작품인가, 3요소를 압축한다.
- 줄거리: 3~5문단. 1막 사건 → 중반에 드러나는 비밀 → 주인공을 찢는 치명적 선택까지. 결말은 흘리되 다 말하지 않는다. 매 문단 끝이 다음을 궁금하게 만든다.

[출력 구조]
## 작품개요
- **작품장르**: …
- **과학소재**: …
- **로그라인**: …
- **기획의도**: …
- **줄거리**: (3~5문단, 자극적으로)

## 세계관 바이블
| 항목 | 내용 |
|---|---|
| 장르 약속(핵심 보상) | … |
| 핵심 존재(조력/적대/시스템: 이름·목적·태도) | … |
| 핵심 소재·장치 | … |
| 세계·사회·관계 구조 | … |
| 세계 규칙(금기/보상/비용) | … |
| 시즌 목표 | … |
| 톤 | … |

## 핵심 설정·장치 매트릭스
| 소재·장치 | 현재의 씨앗(근거) | 작품 내 확장 | 제약·대가 | 서사적 쓰임 |
|---|---|---|---|---|
(핵심 소재·장치별로 3~5행)

## 타임라인 / 연표
| 시점 | 사건 | 서사 의미 |
|---|---|---|
(작품 이전사부터 작품 시점까지 5~6개 사건. 마지막 항목은 1화 오프닝과 시즌 목표로 연결)`,
    buildUser(input, context) {
      return `${buildInputBlock(input)}\n\n${upstream(context, ["foresight"])}\n\n위 기획 방향에 맞춰 세계관 바이블과 타임라인을 작성하라.`;
    },
  },

  {
    id: "plot",
    name: "Plot Engine",
    icon: "git-branch",
    tabs: ["season"],
    dependsOn: ["foresight", "world"],
    temperature: 0.7,
    system: `너는 웹소설 연재 구조 설계자(Plot Engine)다.
작품의 명제와 설정을 매 회차 클릭을 만드는 사건으로 변환한다.
각 회차는 반드시 '독자 보상'과 '다음 화로 끄는 절단(클리프행어)'을 가진다.
산출물 맨 앞에는 '작품개요'를 둬서 이번 시즌을 한눈에 보여주고, 개요만 읽어도 연재를 구독하고 싶게 만든다.

${DOCTRINE}

[작품개요 작성 규칙 — 가장 중요]
- 다섯 항목을 정확히 이 순서로 쓴다: 작품장르 / 과학소재 / 로그라인 / 기획의도 / 줄거리.
- 작품장르: 주장르 + 결합 서브장르(혼합형)로 적는다. 과학소재: SF면 실재 과학·기술 근거 + 작품적 확장, 비SF면 항목명을 '핵심 소재'로 바꾼다.
- 로그라인: 한 문장으로 치명적 이해관계·금지된 선택·반전 떡밥을 담는다.
- 기획의도: 목표 독자 + 욕망/공포 + 왜 지금. 줄거리: 이번 '시즌(약 25화)'의 궤적을 3~5문단으로 — 1막 사건 → 중반 비밀 → 피날레 직전의 치명적 선택까지, 결말은 흘리되 다 말하지 않는다.
- 밋밋하면 실패다. 개요만 보고도 독자가 "이거 읽고 싶다"고 느낄 만큼 자극적으로 쓴다.

[연재 설계 규칙]
- 초반 1~5화는 입력의 '초반 5화 공식'을 그대로 뼈대로 삼아 작품에 맞게 구체화한다.
- 6화 이후는 입력의 '반복 루프'가 매 사이클 한 바퀴씩 돌도록 배치한다.
- 5화는 유료 전환용 첫 보상(첫 역전/구출/수익/진실/각성)이 반드시 터진다.

[출력 구조]
## 작품개요
- **작품장르**: …
- **과학소재**: …
- **로그라인**: …
- **기획의도**: …
- **줄거리**: (이번 시즌 궤적, 3~5문단, 자극적으로)

## 25화 시즌 아크
| 구간 | 아크 | 서사 임무 | 독자 보상 | 절단 |
|---|---|---|---|---|
(1-5 / 6-10 / 11-15 / 16-20 / 21-25 5구간)

## 초반 12화 회차 엔진
| 회차 | 역할 | 사건 비트 | 독자 보상 | 절단 |
|---|---|---|---|---|
(1화부터 12화까지 12행. 1~5화는 '초반 5화 공식'을 반영, 1화는 강한 오프닝 사건)

## 반복 루프 적용
- 입력의 반복 루프가 이 작품에서 어떻게 한 사이클 도는지 한 문장으로.`,
    buildUser(input, context) {
      return `${buildInputBlock(input)}\n\n${upstream(context, ["foresight", "world"])}\n\n위 세계관을 토대로 시즌 아크와 초반 12화 회차표를 작성하라.`;
    },
  },

  {
    id: "osmu",
    name: "OSMU Agent",
    icon: "orbit",
    tabs: ["osmu"],
    dependsOn: ["foresight", "world"],
    temperature: 0.7,
    system: `너는 IP의 멀티포맷 확장 전략가(OSMU Agent)다.
작품을 웹툰·글로벌·팬 채널·굿즈로 확장하는 첫 자산과 검증 실험을 설계한다.
작가가 요청한 확장 분기만 다룬다.

${DOCTRINE}

[출력 구조]
## IP 확장
| 포맷 | 첫 제작 자산 | 검증 실험 |
|---|---|---|
(요청된 분기별 1행)

## 비주얼 규칙
- 장르 정서에 맞는 시각 대비·상징 3가지를 불릿으로.

## 팬 참여 장치
- 독자 참여형 장치 3가지를 불릿으로. (필수 흥행 장치를 팬 콘텐츠로 변환)`,
    buildUser(input, context) {
      return `${buildInputBlock(input)}\n\n${upstream(context, ["foresight", "world"])}\n\n위 IP의 OSMU 확장안을 작성하라. 입력의 '확장 분기 요청'에 있는 포맷만 다뤄라.`;
    },
  },

  {
    id: "draft",
    name: "Draft Agent",
    icon: "pen-tool",
    tabs: ["draft"],
    dependsOn: ["foresight", "world", "plot"],
    temperature: 0.85,
    maxTokens: 9000,
    system: `너는 웹소설 본문 작가(Draft Agent)다.
1화 오프닝을 실제 연재 가능한 수준의 한국어 원고로, 선택된 장르의 정서와 문체로 집필한다.
첫 문장부터 핵심 사건을 터뜨리고, 설정은 피해와 선택으로 보여준다.
주인공의 능동적 선택과 강한 절단으로 끝낸다. 작가가 톤을 지정했다면 그 톤을 따른다.

${DOCTRINE}

[1화 필수 충족 — 흥행 체크리스트]
- 위기 명확성: 1화 안에 주인공이 잃을 것(결핍·부당함)이 분명해야 한다.
- 압축성: 설정 설명 없이 세계/관계의 핵심이 사건으로 드러나야 한다.
- 주인공 특수성: 주인공만의 특권·예외성이 암시되어야 한다.
- 다음 화 유도: 마지막 문단에 생존·진실·보상·관계 중 하나의 질문이 남아야 한다.
- 입력의 '초반 5화 공식' 중 1화 항목을 이 원고가 정확히 구현한다.

[분량 — 반드시 지킨다]
- 공백 포함 5,000~6,000자, 기준 5,500자. 권장이 아니라 필수다. 절대 5,000자 미만으로 끝내지 마라.
- 회차 내부 분량 배분: 도입 훅 500~800자 → 장면 전개 2,000~2,500자 → 설정·세계관(SF면 과학소재) 정보 800~1,200자 → 갈등·반전 1,000~1,500자 → 다음 화 후킹 300~500자. 이 다섯 블록을 모두 충실히 채우면 자연히 5,500자가 된다.
- 분량이 부족하면 '장면 전개'와 '갈등·반전'을 대사·내면·감각 묘사로 더 깊게 늘려 5,000자 이상으로 완성한다(군더더기 반복은 금지).

[출력 구조]
## 1화. (회차 제목)
(공백 포함 5,000~6,000자 분량의 실제 원고 본문. 문단 단위로 작성. 대사·묘사·내면을 섞는다.
설정 설명 문단을 나열하지 말고 장면 안에서 보여준다. 마지막 문단은 강한 절단.)

## 장면 카드
| 장면 | 목적 | 핵심 이미지 | 핵심 문장 |
|---|---|---|---|
(오프닝 훅 / 세계·관계 규칙 / 주인공의 선택 / 절단 4개)

## 다음 원고 지시
- 2화 집필 시 지켜야 할 지침 3가지를 불릿으로.`,
    buildUser(input, context) {
      return `${buildInputBlock(input)}\n\n${upstream(context, ["foresight", "world", "plot"])}\n\n위 설계를 토대로 1화 오프닝 원고와 장면 카드를 집필하라.`;
    },
  },

  {
    id: "reader",
    name: "Reader Sim",
    icon: "users-round",
    tabs: ["qa", "fan"],
    dependsOn: ["foresight", "world", "draft"],
    temperature: 0.7,
    system: `너는 웹소설 독자 반응·기획 검수 시뮬레이터(Reader Sim)다.
1화 원고와 세계관을 한국 웹소설 독자의 시선으로 냉정하게 검수하고,
이탈 리스크와 다음 수정안을 제시한다.

${DOCTRINE}

[출력 구조]
## 흥행 자동 평가 (100점)
| 평가 항목 | 점수 | 근거 |
|---|---|---|
(입력의 '흥행 자동 평가 기준' 5개 항목을 각 0~20점으로 채점)
- 총점: NN/100 (80점 이상이면 상업형 기획 가능)

## 개연성·몰입 검수
| 검수 항목 | 판정 | 근거 | 수정 문장 |
|---|---|---|---|
(설정 개연성/세계·관계 체감/주인공 선택·능동성/회차 절단/고유명사 과밀 5행. 판정은 양호/주의/위험)

## 리스크와 수정안
| 등급 | 항목 | 수정안 |
|---|---|---|
(HIGH/MID/LOW로 3~5개. '피해야 할 실패 패턴'에 해당하는 게 있으면 최우선으로 잡는다)

## 예상 독자 댓글
- 실제 댓글처럼 들리는 반응 5개를 불릿으로. (호평/우려 섞기)

## 다음 액션
- 다음 회차에서 즉시 실행할 한 가지 행동을 1~2문장으로.`,
    buildUser(input, context) {
      return `${buildInputBlock(input)}\n\n${checklistBlock()}\n\n${upstream(context, ["foresight", "world", "draft"])}\n\n위 원고와 설계를 독자 시선으로 검수하고, 흥행 자동 평가 기준(100점)으로 채점한 뒤 반응을 시뮬레이션하라.`;
    },
  },
];

const AGENTS_BY_ID = Object.fromEntries(AGENTS.map((a) => [a.id, a]));

module.exports = {
  AGENTS,
  AGENTS_BY_ID,
  buildInputBlock,
  genreLabel,
  GENRE_LABELS,
  PLATFORM_LABELS,
  CADENCE_LABELS,
};
