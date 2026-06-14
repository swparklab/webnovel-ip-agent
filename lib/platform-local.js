"use strict";

/**
 * Deterministic, no-API fallback for the Operations Studio (platform pipeline).
 * Mirrors local-engine.js for the production pipeline: returns usable Markdown
 * per agent so the product demos before keys are provisioned.
 */

const {
  PLATFORMS, TAXONOMY, REACTION_AXES, KR_SF_OVERLAY,
  SUCCESS_FORMULA, FAILURE_FORMULA, targetPlatformList,
} = require("./platform-intel");

function table(headers, rows) {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.map((c) => String(c).replace(/\n/g, " ")).join(" | ")} |`).join("\n");
  return `${head}\n${sep}\n${body}`;
}

function hasReviews(input) {
  return Boolean(String(input.feedback || "").trim());
}

function splitTags(input, fallback) {
  const t = (input.coreTags || "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  return t.length ? t : fallback;
}

const GENRE_TAGS = {
  aiForesight: { setting: ["하드SF", "디스토피아"], tech: ["AI보조자", "시뮬레이션", "시스템/상태창"], fit: ["한국현판형적합", "Webnovel적합"] },
  cyberpunk: { setting: ["사이버펑크", "디스토피아"], tech: ["증강", "AI보조자"], fit: ["RR_Main적합", "한국현판형적합"] },
  posthuman: { setting: ["하드SF", "포스트아포칼립스"], tech: ["생명공학", "AI보조자"], fit: ["HFY적합"] },
  climate: { setting: ["포스트아포칼립스", "하드SF"], tech: ["행성개척", "생명공학"], fit: ["한국현판형적합"] },
  space: { setting: ["우주오페라", "군사SF", "첫접촉"], tech: ["행성개척", "메카"], fit: ["RR_Main적합", "HFY적합"] },
  solarpunk: { setting: ["솔라펑크"], tech: ["나노테크", "생명공학"], fit: ["한국현판형적합"] },
};

function tagsFor(input) {
  return GENRE_TAGS[input.genre] || { setting: ["하드SF"], tech: ["AI보조자", "시스템/상태창"], fit: ["한국현판형적합"] };
}

function taggerMd(input) {
  const g = tagsFor(input);
  const core = splitTags(input, [...g.setting, ...g.tech]);
  const rows = [
    ["세계관/설정", g.setting.join(", "), "SF 세부 스타일 기반"],
    ["기술 모티프", g.tech.join(", "), "핵심 장치에서 추출"],
    ["서사 기능", "훅, 클리프행어, 파워업", "초반 훅·절단 중심 권장"],
    ["독자 경험", "속도감, 하드함(중), 관계온도(중)", "혼합형 리텐션 문법"],
    ["플랫폼 적합", g.fit.join(", "), "SF는 혼합형으로 진열될 때 유리"],
    ["안전/운영", hasReviews(input) ? "태그불일치 점검" : "AI개입표기필요", "리뷰 미입력 시 데이터 수집 우선"],
  ];
  return [
    `## 6층 태그`,
    table(["층위", "부여 태그", "근거"], rows),
    ``,
    `## 혼합형 포지셔닝`,
    `- 이 작품은 **SF + 시스템/성장** 혼합형으로 포지셔닝하는 것이 플랫폼 리텐션에 유리합니다. (순수 하드SF는 발견성에서 불리)`,
    ``,
    `## 안전/리스크 플래그`,
    table(["플래그", "위험도", "설명", "조치"],
      hasReviews(input)
        ? [["태그불일치", "중", "리뷰의 기대와 태그 약속이 어긋날 수 있음", "반응 분석의 '태그약속' 축 확인"]]
        : [["AI개입표기필요", "낮음", "운영 정책상 AI 사용·출처 표기 권장", "공개 시 라벨 명시"]]),
    ``,
    `## 검색 키워드`,
    `${core.concat(["웹소설", "연재", input.genre || "SF"]).slice(0, 14).join(", ")}`,
  ].join("\n");
}

function reactionMd(input) {
  if (!hasReviews(input)) {
    return [
      `## 데이터 없음`,
      `붙여넣은 리뷰/댓글이 없어 6축 점수를 산출할 수 없습니다. 아래를 수집하세요.`,
      ``,
      `## 수집 가이드`,
      `- Royal Road: 챕터 댓글, 리뷰(평점+본문), 첫 주 follow/save 추이`,
      `- Webnovel: 리뷰 본문(특히 '캐릭터/문장/업데이트' 언급), 파워스톤 추이`,
      `- 한국 플랫폼: 별점 분포, 무료→유료 전환 구간 이탈 댓글`,
      ``,
      `## 6축 (수집 후 채점)`,
      table(["축", "점수(0~10)", "신뢰도", "근거"], REACTION_AXES.map((a) => [a, "—", "—", "데이터 없음"])),
    ].join("\n");
  }
  const text = String(input.feedback);
  const neg = /(느리|지루|어색|크리피|불쾌|별로|이탈|손절|문장)/.test(text);
  const pos = /(재밌|좋|사이다|몰입|기대|최고|꿀잼|다음화)/.test(text);
  return [
    `## 좋아요 이유 (최대 5)`,
    pos ? `- 콘셉트/전개에 대한 긍정 신호가 보입니다.\n- 다음 화 기대를 표현하는 반응이 있습니다.` : `- 명확한 긍정 신호는 약합니다.`,
    ``,
    `## 싫어요 이유 (최대 5)`,
    neg ? `- 속도/문장/캐릭터 관련 불만 신호가 있습니다.\n- 초반 전개 또는 상호작용 불쾌감 가능성.` : `- 두드러진 불만 신호는 약합니다.`,
    ``,
    `## 6축 감정 점수`,
    table(["축", "점수(0~10)", "신뢰도", "근거"], REACTION_AXES.map((a) => {
      const score = a === "속도" && neg ? 4 : a === "문장" && neg ? 5 : pos ? 7 : 6;
      return [a, String(score), "중", neg && (a === "속도" || a === "문장") ? "불만 키워드 감지" : "표면 신호 기반"];
    })),
    ``,
    `## 리뷰 신뢰도 진단`,
    `- 표본이 적거나 극단 감정이 섞여 있으면 가중치를 낮춰 해석하세요. (실제 LLM 연결 시 계정 신뢰 프록시까지 반영)`,
    ``,
    `## 수정 항목`,
    table(["시점", "항목", "조치"], [
      ["즉시(다음 챕터)", neg ? "초반 속도/문장" : "훅 강화", neg ? "설명 줄이고 사건 먼저, 1문장 다듬기" : "1화 절단을 더 강하게"],
      ["장기", "캐릭터/관계 온도", "관계·감정 접점을 회차마다 1개 확보"],
    ]),
  ].join("\n");
}

function fitMd(input) {
  const ids = targetPlatformList(input);
  const isPureSf = !/(시스템|헌터|회귀|아포칼립스|생존|현판)/.test(`${input.coreTags} ${input.logline}`);
  const score = (id) => {
    if (id === "royalroad") return "0.7";
    if (id === "hfy") return input.genre === "space" || input.genre === "posthuman" ? "0.7" : "0.5";
    if (id === "webnovel") return "0.65";
    if (id === "naver" || id === "kakao") return isPureSf ? "0.35" : "0.6";
    return "0.5";
  };
  const rows = ids.map((id) => {
    const p = PLATFORMS[id];
    const kr = id === "naver" || id === "kakao";
    return [p.label, score(id),
      kr && isPureSf ? "낮음(번역 필요)" : "중",
      p.implication.split(".")[0],
      kr ? "SF 전면화 약세 → 현판/재난 번역" : id === "royalroad" ? "Big3+Progression 적합도" : "리뷰/연재 안정성"];
  });
  return [
    `## 플랫폼 적합도`,
    table(["플랫폼", "적합도(0~1)", "진입 가능성", "핵심 근거", "가장 큰 미스매치"], rows),
    ``,
    `## Royal Road 노출 진단`,
    `- Main/Rising Stars는 Fantasy/Adventure/Action/Progression과 80~89% 겹칩니다. SF 단독 태그보다 **Progression/시스템 태그를 함께** 거는 게 노출에 유리합니다.`,
    `- RS 진입 팔로워 체감: Fantasy/Adventure ~180, Historical ~50. 초반 3~5화 훅 + 안정 cadence가 전제.`,
    ``,
    `## 우선 공략 순서`,
    `1. Royal Road — 가시 지표가 풍부해 최적화 수익이 큼`,
    `2. Webnovel — 연재 안정성으로 리텐션 확보`,
    `3. 한국(Naver/Kakao) — 현판/재난 오버레이 적용 후 진입`,
  ].join("\n");
}

function packagingMd(input) {
  const ids = targetPlatformList(input);
  const title = input.ipTitle || "무제 SF";
  const concept = input.logline || "주인공이 시스템의 균열을 발견하고 판을 뒤집는다.";
  const overlay = KR_SF_OVERLAY[input.genre] || KR_SF_OVERLAY.default;
  const blocks = ids.map((id) => {
    const p = PLATFORMS[id];
    return [
      `### ${p.label}`,
      `- **제목 후보**: 《${title}》 / 《${title} — ${id === "royalroad" ? "System Awakening" : "생존 규칙"}》`,
      `- **120자 요약**: ${concept.slice(0, 110)}`,
      `- **400자 블럽**: ${p.blurbVoice} ${concept}`,
      `- **태그 8개**: \`${(input.coreTags || "SF, 시스템, 성장, 생존, 미스터리, 디스토피아, 반전, 사이다").split(/[,\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 8).join(", ")}\``,
      `- **반드시 포함할 단어**: ${id === "hfy" ? "인간, 인류" : id === "royalroad" ? "system, progression" : "사이다, 각성"}`,
      `- **피해야 할 단어**: ${id === "naver" || id === "kakao" ? "하드SF, 사변" : "난해, 실험적"}`,
    ].join("\n");
  });
  return [
    `## 플랫폼별 패키징`,
    blocks.join("\n\n"),
    ``,
    `## 한국형 SF 오버레이`,
    table(["플랫폼", "SF 원본 핵심", "번역된 진열어", "후킹 카피"], [
      ["Naver Series", GENRE_HINTLabel(input), overlay[0], `${title}: 무너진 세계, 단 하나의 규칙`],
      ["KakaoPage", GENRE_HINTLabel(input), overlay[1] || overlay[0], `정해진 결말을 비트는 자의 이야기`],
    ]),
  ].join("\n");
}

function GENRE_HINTLabel(input) {
  const m = { aiForesight: "AI 미래예측", cyberpunk: "사이버펑크", posthuman: "포스트휴먼", climate: "기후 재난", space: "우주개척", solarpunk: "솔라펑크" };
  return m[input.genre] || "SF";
}

function strategyMd(input) {
  const reviews = hasReviews(input);
  return [
    `## 성공식 / 실패식 채점`,
    `- 성공식: ${SUCCESS_FORMULA}`,
    `- 실패식: ${FAILURE_FORMULA}`,
    ``,
    table(["식", "항목", "충족도", "근거"], [
      ["성공", "선명한 SF 콘셉트", input.logline ? "상" : "하", input.logline ? "콘셉트 입력됨" : "시놉시스 보강 필요"],
      ["성공", "초반 3~5화 훅", input.manuscript ? "중" : "하", "샘플로 훅 검증 권장"],
      ["성공", "플랫폼 장르 적합도", "중", "혼합형 태깅 시 상승"],
      ["실패위험", "플랫폼-장르 미스매치", "중", "한국 플랫폼은 오버레이 필수"],
      ["실패위험", "분류 부재", "하", "6층 태깅으로 해소됨"],
    ]),
    `- 종합 판정: 혼합형 포지셔닝 + 한국 오버레이를 적용하면 상업 진입 가능.`,
    ``,
    `## 핵심 KPI 가설`,
    table(["KPI", "목표 신호", "현재 진단"], [
      ["1→2화 전환율", "≥ 60%", reviews ? "리뷰 기반 재산출" : "데이터 없음"],
      ["첫 주 follow/save율", "RR 기준 상위", "초반 훅·cadence에 의존"],
      ["부정 댓글 비율", "낮을수록 좋음", reviews ? "반응 분석 참조" : "수집 필요"],
      ["태그-노출 일치", "높을수록 좋음", "플랫폼 적합도 참조"],
    ]),
    ``,
    `## 이번 주 액션 (우선순위)`,
    table(["우선순위", "액션", "기대 효과"], [
      ["매우높음", "한국 플랫폼용 현판/재난 오버레이 카피 확정", "SF 발견성 회복"],
      ["매우높음", "Royal Road 태그를 Progression 결합으로 재구성", "Main/RS 노출 가능성↑"],
      ["높음", "초반 3화 훅 점검·재작성", "조기 이탈 감소"],
      ["중간", "리뷰/댓글 수집 파이프 가동", "반응 학습 기반 마련"],
    ]),
    ``,
    `## 커뮤니티 컴플라이언스 체크`,
    `- 자기홍보 전 최근 기여 기록과 규칙(RR 월1회·drop-and-run 금지, PF 10:1 기여)을 확인하세요. 프로모션만 하고 사라지면 신뢰가 깎입니다.`,
    ``,
    `## 한 줄 다음 행동`,
    `- 가장 가시 지표가 풍부한 Royal Road에 혼합형 태그로 먼저 올리고 첫 주 follow/save율을 측정하세요.`,
  ].join("\n");
}

function buildOpsLocalReport(input) {
  const mk = (id, name, tabs, text) => ({ id, name, tabs, text });
  return {
    generatedAt: new Date().toISOString(),
    model: "local-fallback",
    fallback: true,
    agents: {
      tagger: mk("tagger", "자동 태깅기", ["tagger"], taggerMd(input)),
      reaction: mk("reaction", "반응 분석기", ["reaction"], reactionMd(input)),
      fit: mk("fit", "플랫폼 적합도", ["fit"], fitMd(input)),
      packaging: mk("packaging", "플랫폼 번역기", ["packaging"], packagingMd(input)),
      strategy: mk("strategy", "전략 리포터", ["strategy"], strategyMd(input)),
    },
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

module.exports = { buildOpsLocalReport };
