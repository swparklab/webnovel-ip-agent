"use strict";

/**
 * Platform Intelligence — 운영실(Operations Studio) 에이전트 스위트.
 *
 * deep-research-report2.md 의 결론을 구조화 데이터 + 에이전트로 인코딩한다.
 *   "이 에이전트는 '좋은 SF를 생성하는 모델'이 아니라,
 *    플랫폼별 취향·규칙·노출 구조를 학습해 SF를 패키징하고 운영하는 시스템이어야 한다."
 *
 * 제작실(agents.js)이 Narrative Intelligence 라면, 이 파일은 Platform Intelligence 다.
 * 같은 오케스트레이터/스트리밍/폴백 인프라를 재사용한다(에이전트 객체 형태 동일).
 */

/* ----------------------------- 플랫폼 지형 ----------------------------- */
/* 보고서 "서브레딧과 플랫폼 비교" 표를 인코딩. */
const PLATFORMS = {
  hfy: {
    label: "r/HFY",
    surface: "인간 중심 SF/투기적 서사, 시리즈 연재",
    signals: "플레어, 시리즈 링크, 위키, 외부 Royal Road 연결",
    rules: "게시물당 플레어 1개, 장르 플레어 확대에 소극적, 외부 링크 규칙 준수",
    implication: "메타데이터만으로 SF 세부분류가 어려워 본문 기반 자동 태깅이 필수. '인간이 무엇을 해내는가'를 먼저 말한다.",
    blurbVoice: "인류/인간성의 강점·결함이 드러나는 순간을 1문장으로 먼저 던진다.",
  },
  royalroad: {
    label: "Royal Road",
    surface: "공개 태그·발견성·팔로워 경제가 강한 웹소설 플랫폼",
    signals: "조회·평균조회·팔로워·즐겨찾기·평점·페이지·랭킹·Rising Stars",
    rules: "Rising Stars/Main 노출 구조 영향 큼. 태그-장르 적합도가 노출을 좌우.",
    implication: "태그 전략 + 초반 3~5화 훅 + 안정 cadence 를 가장 정교하게 최적화해야 하는 곳. Big3(Fantasy/Adventure/Action)+Progression 조합 점수화.",
    blurbVoice: "성장/시스템/진행도가 보이는 태그와 초반 훅을 전면에.",
  },
  webnovel: {
    label: "Webnovel",
    surface: "모바일형 대용량 연재·리뷰·선물 경제",
    signals: "조회·평점·리뷰·파워스톤/선물 기대",
    rules: "매우 높은 업데이트 기대. 리뷰 노이즈/봇 리뷰 존재.",
    implication: "연재 안정성 + 리뷰 신뢰도 필터링이 핵심. 불쾌 상호작용·문장품질 신호를 조기 차단.",
    blurbVoice: "강한 콘셉트 + 빠른 보상 + '다음 챕터' 기대를 자극.",
  },
  naver: {
    label: "Naver Series (네이버 시리즈)",
    surface: "쿠키 경제, 무료 회차, 평점, 장르형 진열",
    signals: "평점·회차·무료 회차·쿠키 가격·인기 카운터",
    rules: "상위 장르 탭에 SF 전면화 약함(로맨스·로판·판타지·현판·무협 중심).",
    implication: "한국형 외부 SF 분류 레이어 필수. SF를 현대/재난/시스템 서사로 번역해 진열어를 만든다.",
    blurbVoice: "문제 해결형 현대/재난/시스템 톤. '아포칼립스에 집을 숨김'류 생존·현판 포장.",
  },
  kakao: {
    label: "KakaoPage (카카오페이지)",
    surface: "랭킹·열람자·기다무 중심 진열",
    signals: "열람자·평점·랭킹·탭 구조",
    rules: "SF가 상위 장르 탭에 거의 없음. 판타지 라벨 안에서 소비.",
    implication: "작품 자체보다 포장 카피/진열 언어 최적화가 중요. 투기적 세계관도 판타지 라벨로 흡수.",
    blurbVoice: "판타지/현판 라벨 안에서 먹히는 후킹 카피. 첫 줄에 사이다·역전 약속.",
  },
};

const PLATFORM_IDS = Object.keys(PLATFORMS);

/* ------------------------- 6층 자동 태깅 분류체계 ------------------------- */
/* 보고서 "태깅 분류체계" 표. */
const TAXONOMY = [
  { layer: "세계관/설정", use: "검색·유사작 추천",
    tags: ["사이버펑크", "우주오페라", "포스트아포칼립스", "하드SF", "솔라펑크", "군사SF", "첫접촉", "디스토피아"] },
  { layer: "기술 모티프", use: "설정 클러스터링",
    tags: ["AI보조자", "증강", "나노테크", "메카", "생명공학", "행성개척", "시뮬레이션", "포털/차원", "시스템/상태창"] },
  { layer: "서사 기능", use: "장면 수준 학습",
    tags: ["훅", "첫반전", "미스터리떡밥", "파워업", "감정회수", "세계관설명", "클리프행어"] },
  { layer: "독자 경험", use: "취향 매칭",
    tags: ["설명밀도", "하드함", "속도감", "유머", "잔혹도", "로맨스밀도", "관계온도"] },
  { layer: "플랫폼 적합", use: "패키징 최적화",
    tags: ["HFY적합", "RR_Main적합", "PF적합", "Webnovel적합", "한국현판형적합"] },
  { layer: "안전/운영", use: "모더레이션·리스크",
    tags: ["크리피로맨스경보", "태그불일치", "AI개입표기필요", "표절의심", "18+위험"] },
];

/* ----------------------------- 독자 페르소나 ----------------------------- */
/* 보고서 "페르소나 기반 서사 선호". */
const PERSONAS = [
  ["인간중심 쾌감형", "HFY", "인간성·인류의 강점/결함이 드러나는 순간", "하드설정보다 '인간이 무엇을 해내는가'를 먼저"],
  ["성장 추적형", "Royal Road · ProgressionFantasy", "훈련·단계 상승·시스템·성장의 명시성", "성장이 '어떻게 측정되는가'까지 보여줄 것"],
  ["아이디어 검증형", "r/scifiwriting", "'재밌는가'보다 '말이 되는가'", "생성이 아니라 설정 검증 코파일럿으로"],
  ["모바일 binge형", "Webnovel · Naver · Kakao", "챕터 수·안정 업로드·무료 회차·랭킹", "작품성보다 연재 습관·접근성·진열 카피"],
  ["사회적 상호작용형", "Wattpad · 팬덤", "코멘트·관계·작가-독자 친밀도", "댓글을 관계망으로 — 베타리더·피드백 서클"],
];

/* --------------------------- 한국형 SF 오버레이 --------------------------- */
/* 보고서: 한국 플랫폼에서 SF는 독립 장르보다 '문제 해결형 현대/재난/시스템'으로 포장될 때 유리. */
const KR_SF_OVERLAY = {
  aiForesight: ["현대판타지(예측/시스템)", "회귀·미래정보형 사이다", "직업물(분석관) 톤"],
  cyberpunk: ["현대 헌터/시스템", "하극상 능력각성", "도시 생존 스릴러"],
  posthuman: ["각성/판정 시스템물", "전생·환생 변주", "휴먼드라마형 미스터리"],
  climate: ["아포칼립스 생존", "거점건설/현대 재난", "회귀 생존 사이다"],
  space: ["개척/건설 시스템물", "회귀 직업물(정비공/엔지니어)", "독립·건국 사이다"],
  solarpunk: ["힐링+건설 현판", "마을경영/농장물", "재난후 재건 드라마"],
  sfApocalypse: ["아포칼립스 생존", "시스템 헌터물", "거점건설 사이다"],
  default: ["현대판타지/시스템", "재난·생존 현판", "회귀·각성 사이다"],
};

/* ----------------------------- 성공식/실패식 ----------------------------- */
const SUCCESS_FORMULA =
  "선명한 SF 콘셉트 × 초반 3~5화 훅 × 안정적 연재 cadence × 플랫폼 장르 적합도 × 관계/감정 접점 × 커뮤니티 신뢰";
const FAILURE_FORMULA =
  "플랫폼-장르 미스매치 + 느린 초반 전개 + 불쾌한 성정치/캐릭터 행위 + 문장 품질 불안정 + 프로모션만 하고 사라짐 + 분류 부재";

/* 6축 반응 평가 축 (보고서 샘플 프롬프트). */
const REACTION_AXES = ["속도", "문장", "캐릭터", "로맨스", "설정정합성", "태그약속"];

/* ------------------------------- 입력 블록 ------------------------------- */
function val(value, fallback = "(미입력)") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

const GENRE_HINT = {
  aiForesight: "AI 미래예측 SF", cyberpunk: "사이버펑크", posthuman: "포스트휴먼",
  climate: "기후 SF", space: "우주개척 SF", solarpunk: "솔라펑크",
};

function targetPlatformList(input) {
  const picked = (input.targetPlatforms || "")
    .split(",").map((s) => s.trim()).filter((s) => PLATFORMS[s]);
  return picked.length ? picked : PLATFORM_IDS;
}

function platformContextBlock(input) {
  const ids = targetPlatformList(input);
  const lines = ids.map((id) => {
    const p = PLATFORMS[id];
    return `- **${p.label}**: 표면=${p.surface} / 공개신호=${p.signals} / 규칙=${p.rules} / 시사점=${p.implication}`;
  });
  return `# 타깃 플랫폼 지형\n${lines.join("\n")}`;
}

function taxonomyBlock() {
  const lines = TAXONOMY.map((t) => `- **${t.layer}** (${t.use}): ${t.tags.join(", ")}`);
  return `# 6층 태깅 분류체계 (이 6층을 모두 채운다)\n${lines.join("\n")}`;
}

function buildOpsInputBlock(input) {
  return [
    `# 운영 대상 작품`,
    `- 작품 제목: ${val(input.ipTitle, "무제")}`,
    `- SF 세부 스타일: ${GENRE_HINT[input.genre] || input.genre || "미지정"}`,
    `- 한 줄 콘셉트(시놉시스): ${val(input.logline)}`,
    `- 작가가 쓰는 핵심 태그: ${val(input.coreTags)}`,
    `- 타깃 플랫폼: ${targetPlatformList(input).map((id) => PLATFORMS[id].label).join(", ")}`,
    input.manuscript ? `- 샘플 챕터/원고:\n${input.manuscript}` : `- 샘플 챕터/원고: (미입력)`,
    input.feedback ? `- 붙여넣은 리뷰/댓글/지표:\n${input.feedback}` : `- 붙여넣은 리뷰/댓글/지표: (미입력)`,
  ].join("\n");
}

const OPS_DOCTRINE = `[운영 원칙 — 보고서 결론]
- 이 작업의 본질은 '글을 더 잘 쓰기'가 아니라 '같은 글을 플랫폼마다 다르게 설명·태깅·연재·대응'하는 것이다.
- 성공작 대부분은 순수 하드SF가 아니라 혼합형 SF다(사이버펑크+시스템, 디스토피아+성장, 아포칼립스+생활/경제). 순수성 테스트가 아니라 플랫폼이 실제로 읽고 진열하는 방식을 기준으로 판단한다.
- 한국 플랫폼(Naver/Kakao)은 SF가 독립 진열어를 잃은 상태다. SF 핵심은 유지하되 현판·재난·미스터리·시스템 언어로 번역한다.
- 추측 금지: 리뷰/댓글이 비어 있으면 '데이터 없음'으로 표기하고 무엇을 수집해야 하는지 지시한다.

[성공식] ${SUCCESS_FORMULA}
[실패식] ${FAILURE_FORMULA}

[출력 형식]
- 한국어. 지정된 Markdown 구조(## 제목, 표, 목록)를 정확히 따른다.
- 군더더기 인사말 없이 결과물만 출력한다.`;

function condense(text, limit = 1600) {
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

/* ------------------------------- 에이전트 ------------------------------- */
const PLATFORM_AGENTS = [
  {
    id: "tagger",
    name: "자동 태깅기",
    icon: "tags",
    tabs: ["tagger"],
    dependsOn: [],
    temperature: 0.4,
    system: `너는 SF 웹소설 챕터 태깅 분석기다. 작품 메타와 샘플을 6층 분류체계로 태깅하고 운영 리스크를 표시한다.

${OPS_DOCTRINE}

[출력 구조]
## 6층 태그
| 층위 | 부여 태그 | 근거 |
|---|---|---|
(세계관/설정, 기술 모티프, 서사 기능, 독자 경험, 플랫폼 적합, 안전/운영 — 6행. 각 층 2~5개 태그)

## 혼합형 포지셔닝
- 이 작품이 결합한 'SF + α'(시스템/성장/디스토피아/생활경제 등)를 한 문장으로.

## 안전/리스크 플래그
| 플래그 | 위험도 | 설명 | 조치 |
|---|---|---|---|
(크리피로맨스/태그불일치/AI개입표기/표절의심/18+ 중 해당하는 것만. 없으면 '해당 없음' 1행)

## 검색 키워드
- 플랫폼 검색·발견용 키워드 10~14개를 한 줄로.`,
    buildUser(input) {
      return `${buildOpsInputBlock(input)}\n\n${taxonomyBlock()}\n\n위 작품을 6층 분류체계로 태깅하라.`;
    },
  },

  {
    id: "reaction",
    name: "반응 분석기",
    icon: "message-square",
    tabs: ["reaction"],
    dependsOn: [],
    temperature: 0.5,
    system: `너는 커뮤니티 반응 요약기다. 붙여넣은 리뷰·댓글을 신뢰도 가중해 6축으로 정렬하고, 즉시/장기 수정안을 분리한다.

${OPS_DOCTRINE}

[리뷰 신뢰도 규칙]
- 리뷰를 그대로 먹이지 말 것. 계정 신뢰 프록시(구체성, 텍스트 반복성, 극단 감정, 모순)를 함께 보고 가중한다.
- 봇/가짜리뷰/드롭앤런 의심 신호를 분리 표기한다.
- 리뷰/댓글이 비어 있으면 점수 대신 '데이터 없음'으로 적고, 무엇을 수집해야 하는지 지시한다.

[출력 구조]
## 좋아요 이유 (최대 5)
- …

## 싫어요 이유 (최대 5)
- …

## 6축 감정 점수
| 축 | 점수(0~10) | 신뢰도 | 근거 |
|---|---|---|---|
(속도/문장/캐릭터/로맨스/설정정합성/태그약속 — 6행)

## 리뷰 신뢰도 진단
- 노이즈/봇/가짜리뷰 의심 신호와 가중 처리 방식을 2~3줄.

## 수정 항목
| 시점 | 항목 | 조치 |
|---|---|---|
(다음 챕터에서 즉시 수정 / 장기 수정 으로 나눠 3~6행)`,
    buildUser(input) {
      return `${buildOpsInputBlock(input)}\n\n6축은 [${REACTION_AXES.join(", ")}]. 위 리뷰/댓글을 신뢰도 가중해 분석하라.`;
    },
  },

  {
    id: "fit",
    name: "플랫폼 적합도",
    icon: "gauge",
    tabs: ["fit"],
    dependsOn: ["tagger"],
    temperature: 0.5,
    system: `너는 플랫폼 적합도 스코어러다. 작품 태그·콘셉트가 각 플랫폼의 노출 구조에 맞는지 0~1로 점수화하고 진입 가능성을 진단한다.

${OPS_DOCTRINE}

[채점 규칙]
- Royal Road는 태그-장르 적합도가 노출을 좌우한다. Big3(Fantasy/Adventure/Action)+Progression 조합과의 거리, Rising Stars 진입에 필요한 팔로워 체감(Fantasy/Adventure ~180, Historical ~50 수준)을 함께 본다.
- 한국 플랫폼(Naver/Kakao)은 SF 전면화가 약하다. 순수 SF면 적합도를 낮게 주고, 현판/재난/시스템 번역 필요를 명시한다.
- 각 점수에는 반드시 '왜'를 한 줄로 단다.

[출력 구조]
## 플랫폼 적합도
| 플랫폼 | 적합도(0~1) | 진입 가능성 | 핵심 근거 | 가장 큰 미스매치 |
|---|---|---|---|---|
(타깃 플랫폼별 1행)

## Royal Road 노출 진단
- Main/Rising Stars 진입을 위해 필요한 태그 조합·팔로워 체감·cadence를 3~4줄.

## 우선 공략 순서
- 이 작품을 어느 플랫폼부터 미는 게 유리한지 순위와 이유를 불릿으로.`,
    buildUser(input, context) {
      return `${buildOpsInputBlock(input)}\n\n${platformContextBlock(input)}\n\n${upstream(context, ["tagger"])}\n\n위 태그를 근거로 플랫폼별 적합도를 채점하라.`;
    },
  },

  {
    id: "packaging",
    name: "플랫폼 번역기",
    icon: "package",
    tabs: ["packaging"],
    dependsOn: ["tagger", "fit"],
    temperature: 0.7,
    system: `너는 플랫폼 패키징 리라이터다. 같은 작품을 플랫폼마다 다르게 설명·태깅한다. 한국 플랫폼에는 SF 핵심을 유지한 현판/재난/시스템 오버레이를 입힌다.

${OPS_DOCTRINE}

[출력 구조]
## 플랫폼별 패키징
타깃 플랫폼마다 아래 블록을 반복한다:

### {플랫폼명}
- **제목 후보**: 2개 (해당 플랫폼 제목 문법에 맞게)
- **120자 요약**: …
- **400자 블럽**: …
- **태그 8개**: \`태그, 태그 …\` (플랫폼 메타와 충돌하면 사유 1줄)
- **반드시 포함할 단어**: …
- **피해야 할 단어**: …

## 한국형 SF 오버레이
| 플랫폼 | SF 원본 핵심 | 번역된 진열어(현판/재난/시스템) | 후킹 카피 |
|---|---|---|---|
(Naver, Kakao 2행 — SF를 한국 플랫폼 장르 언어로 번역)`,
    buildUser(input, context) {
      const overlay = KR_SF_OVERLAY[input.genre] || KR_SF_OVERLAY.default;
      return `${buildOpsInputBlock(input)}\n\n${platformContextBlock(input)}\n\n한국형 오버레이 후보(참고): ${overlay.join(" / ")}\n\n${upstream(context, ["tagger", "fit"])}\n\n위를 토대로 플랫폼별 패키징과 한국형 오버레이를 작성하라.`;
    },
  },

  {
    id: "strategy",
    name: "전략 리포터",
    icon: "clipboard-list",
    tabs: ["strategy"],
    dependsOn: ["tagger", "fit", "packaging"],
    temperature: 0.6,
    system: `너는 운영 전략 리포터다. 성공식/실패식으로 작품을 채점하고, 조기 이탈 중심 KPI와 이번 주 액션을 제시한다.

${OPS_DOCTRINE}

[KPI 원칙]
- 전체 작품 평점보다 장면·챕터 단위 정렬을 중시한다. 핵심 KPI는 챕터 1→2 전환율, 첫 주 follow/save율, 부정 댓글 비율이다.
- 프로모션보다 기여: 각 커뮤니티 규칙(RR 월1회 자기홍보·drop-and-run 금지, PF 10:1 기여비율 등)을 위반하지 않는지 점검한다.

[출력 구조]
## 성공식 / 실패식 채점
| 식 | 항목 | 충족도 | 근거 |
|---|---|---|---|
(성공식 6요소 + 실패식 위험 6요소를 충족도(상/중/하)로 채점)
- 종합 판정: 한 문장.

## 핵심 KPI 가설
| KPI | 목표 신호 | 현재 진단 |
|---|---|---|
(1→2화 전환 / 첫주 follow·save / 부정댓글 비율 / 태그-노출 일치 4행)

## 이번 주 액션 (우선순위)
| 우선순위 | 액션 | 기대 효과 |
|---|---|---|
(매우높음/높음/중간 으로 4~6행)

## 커뮤니티 컴플라이언스 체크
- 오늘 홍보해도 되는가? 규칙 위반 위험은? 2~3줄.

## 한 줄 다음 행동
- 지금 당장 실행할 한 가지.`,
    buildUser(input, context) {
      return `${buildOpsInputBlock(input)}\n\n${upstream(context, ["tagger", "fit", "packaging"])}\n\n위를 종합해 성공식/실패식 채점과 주간 전략 리포트를 작성하라.`;
    },
  },
];

const PLATFORM_AGENTS_BY_ID = Object.fromEntries(PLATFORM_AGENTS.map((a) => [a.id, a]));

module.exports = {
  PLATFORM_AGENTS,
  PLATFORM_AGENTS_BY_ID,
  PLATFORMS,
  PLATFORM_IDS,
  TAXONOMY,
  PERSONAS,
  KR_SF_OVERLAY,
  REACTION_AXES,
  SUCCESS_FORMULA,
  FAILURE_FORMULA,
  buildOpsInputBlock,
  targetPlatformList,
};
