"use strict";

/**
 * IP 사업실 (IP Business / Monetization Intelligence) — 4번째 파이프라인.
 *
 * 제작실이 'IP를 만들고', 운영실이 '플랫폼에 유통'한다면, 사업실은 그 IP를
 * '돈과 확장'으로 잇는다: 수익 모델 설계 · OSMU 확장 로드맵 · IP 가치 평가 ·
 * 투자/제작사용 피치덱 · 권리/계약 가이드.
 *
 * 운영실(platform-intel.js)과 동일한 에이전트 인터페이스를 따른다.
 */

const { genreLabel } = require("./agents");

/* --------------------------- 구조화 지식베이스 --------------------------- */

// 국내·글로벌 연재 플랫폼의 과금/수익 구조(요약). 프롬프트에 근거로 주입.
const REVENUE_MODELS = {
  kakao: { label: "카카오페이지", model: "기다리면무료(12/24시간 충전) + 캐시 결제 + 완결작 소장", lever: "초반 무료 회차로 유입 → 절단 지점에서 캐시 전환. 연독률·열람 회차수가 핵심 KPI" },
  naver: { label: "네이버시리즈", model: "쿠키 결제 + 미리보기 유료 + 다운로드 소장", lever: "본편 무료 + 미리보기 유료가 전형. 베스트리그/지상최대공모 등 노출 이벤트가 큰 변수" },
  ridi: { label: "리디", model: "단권 소장 + 대여 + 리디셀렉트 구독", lever: "소장 가치(완성도·소장 욕구)가 매출을 좌우. 장르 충성 독자·BL/로맨스 강세" },
  novelpia: { label: "노벨피아", model: "선독점 연재 + 후원(별) + 유료 전환", lever: "작가 직접 연재·정산 구조. 초기 독점 보너스와 팬덤 후원이 수익원" },
  global: { label: "글로벌(Webnovel/Tapas/Yonder 등)", model: "코인·구독 + 광고 리워드 + 작가 인센티브 풀", lever: "영문 현지화 + 챕터 단가 + 팬 번역/광고 모델. 장르(시스템·프로그레션) 적합도가 관건" },
};

// OSMU 매체별 확장 가이드(난이도·수익기여·장르 적합 힌트).
const OSMU_MEDIA = [
  ["웹툰", "원작 IP의 1차 확장 표준. 컷·연출 전환과 캐릭터 비주얼이 관건", "중", "매우높음", "로판·현판·무협·헌터물 강세"],
  ["드라마/OTT", "캐릭터·감정선·시즌 구조가 강하면 유리. 판권·제작비 규모 큼", "상", "높음", "현대로맨스·재벌·스릴러·힐링"],
  ["영화", "단일 강한 전제·2시간 응축 가능성", "상", "중", "스릴러·SF·미스터리"],
  ["게임", "세계관·시스템·캐릭터 수집 요소가 풍부할수록 유리", "상", "중", "게임판타지·헌터·아카데미"],
  ["애니메이션", "글로벌 팬덤·비주얼 강점 IP. 제작 리드타임 김", "상", "중", "판타지·액션·SF"],
  ["오디오드라마/오디오북", "낮은 제작비로 빠른 확장. 성우 팬덤", "하", "중", "로맨스·BL·힐링"],
  ["굿즈/MD·출판", "팬덤 화력의 직접 수익화", "하", "중", "캐릭터성 강한 전 장르"],
];

const BIZ_DOCTRINE = `[IP 사업 원칙]
- 작품의 '문장 품질'이 아니라 'IP 자산으로서의 수익성·확장성·권리 구조'를 판단한다.
- 추측 매출액을 단정하지 말고, 플랫폼 과금 구조와 비교작(comps) 기준의 '시나리오(보수/기본/낙관)'로 제시한다.
- 권리·계약 항목은 '일반 가이드'이며 법률 자문이 아님을 명확히 한다. 실제 계약 전 전문가 검토를 권고한다.
- 모든 수치는 근거(플랫폼 모델·장르 적합·comps)를 한 줄로 함께 단다.

[출력 형식]
- 한국어. 지정된 Markdown 구조(## 제목, 표, 목록)를 정확히 따른다. 인사말 없이 결과물만.`;

/* ------------------------------- 헬퍼 ------------------------------- */

function val(v, dflt = "(미입력)") {
  const s = String(v ?? "").trim();
  return s || dflt;
}

function platformLine(input) {
  const ids = String(input.platforms || input.platform || "")
    .split(",").map((s) => s.trim()).filter((k) => REVENUE_MODELS[k]);
  if (!ids.length) return "플랫폼 미지정 — 국내 주요 플랫폼 일반 기준으로 판단";
  return ids.map((k) => REVENUE_MODELS[k].label).join(", ");
}

function buildBizInputBlock(input) {
  return [
    `# 사업 대상 IP`,
    `- 작품 제목: ${val(input.ipTitle, "무제")}`,
    `- 장르: ${genreLabel(input.genre)}`,
    `- 한 줄 로그라인: ${val(input.logline)}`,
    `- 작품 명제/핵심 질문: ${val(input.sfPremise)}`,
    `- 시즌 목표: ${val(input.seasonGoal)}`,
    `- 차별점(USP): ${val(input.usp)}`,
    `- 비교작(comps): ${val(input.comps)}`,
    `- 연령등급·수위: ${val(input.contentRating)}`,
    `- 핵심 태그: ${val(input.coreTags)}`,
    `- 타깃 연재 플랫폼: ${platformLine(input)}`,
    input.manuscript ? `- 샘플 원고/메모:\n${String(input.manuscript).slice(0, 2000)}` : null,
  ].filter(Boolean).join("\n");
}

function revenueBlock(input) {
  const ids = String(input.platforms || input.platform || "")
    .split(",").map((s) => s.trim()).filter((k) => REVENUE_MODELS[k]);
  const list = ids.length ? ids : Object.keys(REVENUE_MODELS);
  const rows = list.map((k) => `- ${REVENUE_MODELS[k].label}: ${REVENUE_MODELS[k].model} · 레버: ${REVENUE_MODELS[k].lever}`);
  return `[플랫폼 수익 구조 참고]\n${rows.join("\n")}`;
}

function osmuBlock() {
  const rows = OSMU_MEDIA.map(([m, d, diff, rev, fit]) => `- ${m}: ${d} (난이도 ${diff}/수익기여 ${rev}/적합 ${fit})`);
  return `[OSMU 매체 참고]\n${rows.join("\n")}`;
}

function condense(text, limit = 1500) {
  const s = String(text || "").trim();
  return s.length <= limit ? s : `${s.slice(0, limit)}\n…(이하 생략)`;
}

function upstream(context, ids) {
  return ids
    .map((id) => { const e = context[id]; return e ? `## [${e.name} 산출물]\n${condense(e.text)}` : null; })
    .filter(Boolean)
    .join("\n\n");
}

/* ------------------------------- 에이전트 ------------------------------- */

const BUSINESS_AGENTS = [
  {
    id: "revenue",
    name: "수익 모델러",
    icon: "coins",
    tabs: ["revenue"],
    dependsOn: [],
    temperature: 0.5,
    system: `너는 웹소설 IP 수익 모델 설계자다. 작품을 타깃 플랫폼의 과금 구조에 맞춰 '어디서 어떻게 돈이 도는지'를 설계하고, 보수/기본/낙관 매출 시나리오를 제시한다.

${BIZ_DOCTRINE}

[출력 구조]
## 수익 모델 한 줄
- 이 작품의 핵심 수익 경로(유입→무료→전환→소장/확장)를 한 문장으로.

## 플랫폼별 과금 전략
| 플랫폼 | 권장 과금 구조 | 유료 전환 지점 | 핵심 KPI |
|---|---|---|---|
(타깃 플랫폼별 1행. 플랫폼 미지정이면 국내 대표 2~3개)

## 편성·무료분 설계
- 무료 회차 수, 절단(클리프행어) 배치, 유료 전환 회차, 연독률을 끌어올릴 편성 전략 3~5줄.

## 매출 시나리오 (근거 기반·추정치 단정 금지)
| 시나리오 | 가정 | 매출 동인 |
|---|---|---|
(보수/기본/낙관 — 3행. 금액 단정 대신 '동인'으로)`,
    buildUser(input) {
      return `${buildBizInputBlock(input)}\n\n${revenueBlock(input)}\n\n위 IP의 수익 모델과 편성·매출 시나리오를 설계하라.`;
    },
  },

  {
    id: "osmuRoad",
    name: "OSMU 로드맵",
    icon: "git-branch",
    tabs: ["osmuRoad"],
    dependsOn: [],
    temperature: 0.6,
    system: `너는 IP 확장(OSMU) 전략가다. 작품을 웹툰·드라마·영화·게임·애니·오디오·굿즈로 확장하는 단계별 로드맵을 짜고, 매체별 적합도와 우선순위·타이밍을 제시한다.

${BIZ_DOCTRINE}

[출력 구조]
## 매체별 적합도
| 매체 | 적합도(상/중/하) | 근거(이 작품의 어떤 요소) | 진입 난이도 |
|---|---|---|---|
(웹툰/드라마·OTT/영화/게임/애니/오디오/굿즈 중 상위 5개)

## 확장 로드맵 (단계)
1. 1차(원작 흥행 직후): …
2. 2차(팬덤 형성 후): …
3. 3차(대형 판권): …
(각 단계에 매체·목표·전제 조건)

## 우선 확장 1순위와 이유
- 지금 IP에서 가장 먼저 추진할 매체와 그 이유 2~3줄.`,
    buildUser(input) {
      return `${buildBizInputBlock(input)}\n\n${osmuBlock()}\n\n위 IP의 OSMU 확장 로드맵을 작성하라.`;
    },
  },

  {
    id: "rights",
    name: "권리·계약 가이드",
    icon: "scale",
    tabs: ["rights"],
    dependsOn: [],
    temperature: 0.4,
    system: `너는 콘텐츠 IP 권리·계약 가이드다. 작가가 계약 전 알아야 할 권리 구조와 협상 체크포인트를 정리한다. (법률 자문이 아니며, 실제 계약 전 전문가 검토 필요를 반드시 고지)

${BIZ_DOCTRINE}

[출력 구조]
## ⚠️ 고지
- 본 내용은 일반 가이드이며 법률 자문이 아닙니다. 실제 계약 전 변호사/에이전시 검토를 받으세요. (1줄)

## 권리 구조 한눈에
| 권리 | 의미 | 작가가 지켜야 할 것 |
|---|---|---|
(연재 전송권/2차적저작물작성권(웹툰·영상·게임)/해외 번역권/굿즈·상품화권 — 4행)

## 계약 협상 체크리스트
- 정산 비율·정산 주기·MG(미니멈 개런티)·독점 범위·기간·해지 조건·2차 판권 별도 여부 등 7~10개 체크 항목.

## 흔한 함정
- 신인 작가가 놓치기 쉬운 독소조항·권리 일괄양도 위험 3~4개.`,
    buildUser(input) {
      return `${buildBizInputBlock(input)}\n\n위 IP를 사업화할 때의 권리 구조와 계약 체크리스트를 작성하라.`;
    },
  },

  {
    id: "valuation",
    name: "IP 가치 평가",
    icon: "trending-up",
    tabs: ["valuation"],
    dependsOn: ["revenue", "osmuRoad"],
    temperature: 0.4,
    system: `너는 IP 밸류에이션 평가자다. 작품을 흥행성·확장성·차별성·완성도·수익성 5축으로 0~100 채점하고, 종합 등급과 가치를 끌어올릴 레버를 제시한다. 위 수익 모델·OSMU 로드맵 산출물을 근거로 삼는다.

${BIZ_DOCTRINE}

[출력 구조]
## IP 종합 점수
- 종합 점수(0~100)와 등급(S/A/B/C)을 한 줄로. 과대평가 금지.

## 5축 평가
| 축 | 점수(0~100) | 근거 |
|---|---|---|
(흥행성/확장성(OSMU)/차별성(USP)/완성도/수익성 — 5행)

## 투자 관점 한 줄 코멘트
- 제작사·투자자가 볼 때의 매력과 리스크를 각각 한 줄.

## 가치 상승 레버 (우선순위)
- 이 IP의 점수를 가장 크게 올릴 행동 3가지를 우선순위로.`,
    buildUser(input, context) {
      return `${buildBizInputBlock(input)}\n\n${upstream(context, ["revenue", "osmuRoad"])}\n\n위를 근거로 IP 가치를 5축 평가하라.`;
    },
  },

  {
    id: "pitch",
    name: "IP 피치덱",
    icon: "presentation",
    tabs: ["pitch"],
    dependsOn: ["revenue", "osmuRoad", "valuation"],
    temperature: 0.6,
    system: `너는 IP 세일즈 덱 작성자다. 투자자·제작사·플랫폼 담당자에게 보낼 1페이지 피치를 만든다. 위 수익·OSMU·가치평가 산출물을 녹여, 읽는 사람이 '이 IP를 사고 싶다'고 느끼게 한다.

${BIZ_DOCTRINE}

[출력 구조]
## 한 줄 피치
- 로그라인 + 시장 기회를 한 문장으로.

## 왜 지금, 왜 이 IP
- 시장 타이밍·트렌드 부합·차별점을 3~4불릿.

## 시장성 & 비교작
- 타깃 독자 규모감과 comps(비교작)의 성과를 근거로 한 시장성 3줄.

## 확장 가치 (OSMU)
- 가장 강한 확장 매체와 그 그림을 2~3줄.

## 한눈에 보는 IP 카드
| 항목 | 내용 |
|---|---|
(장르 / 타깃 / USP / 1차 확장 / IP 등급 / 리스크 — 6행)

## 콜 투 액션
- 제작사/투자자에게 제안하는 다음 스텝 한 줄.`,
    buildUser(input, context) {
      return `${buildBizInputBlock(input)}\n\n${upstream(context, ["revenue", "osmuRoad", "valuation"])}\n\n위를 종합해 투자/제작사용 IP 피치덱을 작성하라.`;
    },
  },
];

const BUSINESS_AGENTS_BY_ID = Object.fromEntries(BUSINESS_AGENTS.map((a) => [a.id, a]));

module.exports = {
  BUSINESS_AGENTS,
  BUSINESS_AGENTS_BY_ID,
  REVENUE_MODELS,
  OSMU_MEDIA,
  buildBizInputBlock,
};
