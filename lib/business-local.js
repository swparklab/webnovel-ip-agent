"use strict";

/**
 * IP 사업실(business 파이프라인)의 무API 결정론적 폴백.
 * platform-local.js와 동일한 형태로, 키 없이도 데모가 동작하게 한다.
 */

const { genreLabel } = require("./agents");
const { REVENUE_MODELS, OSMU_MEDIA } = require("./business-intel");

function table(headers, rows) {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.map((c) => String(c).replace(/\n/g, " ")).join(" | ")} |`).join("\n");
  return `${head}\n${sep}\n${body}`;
}

function platformIds(input) {
  const ids = String(input.platforms || input.platform || "")
    .split(",").map((s) => s.trim()).filter((k) => REVENUE_MODELS[k]);
  return ids.length ? ids : ["kakao", "naver", "ridi"];
}

function title(input) { return input.ipTitle || "이 작품"; }

function revenueMd(input) {
  const ids = platformIds(input);
  return [
    `## 수익 모델 한 줄`,
    `- 무료 회차로 유입을 모으고, 결정적 절단 지점에서 유료(캐시/쿠키)로 전환하며, 완결 후 소장·OSMU로 수익을 확장한다.`,
    ``,
    `## 플랫폼별 과금 전략`,
    table(["플랫폼", "권장 과금 구조", "유료 전환 지점", "핵심 KPI"],
      ids.map((k) => [REVENUE_MODELS[k].label, REVENUE_MODELS[k].model, "초반 12~20화 절단", "연독률·열람 회차수"])),
    ``,
    `## 편성·무료분 설계`,
    `- 1~5화 강한 훅으로 무료 공개 → 12~20화 구간에 유료 전환 절단 배치 → 매 화 마지막을 다음 화 클릭으로 잇는 클리프행어로 연독률을 끌어올린다.`,
    ``,
    `## 매출 시나리오 (근거 기반·추정치 단정 금지)`,
    table(["시나리오", "가정", "매출 동인"], [
      ["보수", "초반 이탈 큼·전환율 낮음", "소수 충성 독자 소장"],
      ["기본", "연독률 평균·1개 플랫폼 안착", "유료 전환 + 미리보기"],
      ["낙관", "노출 이벤트 당첨·웹툰화", "전환 + 2차 판권 + 글로벌"],
    ]),
    ``,
    `> (로컬 폴백 미리보기 — 키/구독 연결 시 작품 데이터에 맞춘 정교한 모델로 생성됩니다.)`,
  ].join("\n");
}

function osmuRoadMd(input) {
  const top = OSMU_MEDIA.slice(0, 5);
  return [
    `## 매체별 적합도`,
    table(["매체", "적합도", "근거", "진입 난이도"],
      top.map(([m, d, diff, rev, fit]) => [m, rev === "매우높음" ? "상" : rev === "높음" ? "상" : "중", fit, diff])),
    ``,
    `## 확장 로드맵 (단계)`,
    `1. **1차(원작 흥행 직후)** — 웹툰화: 가장 표준적인 1차 확장. 컷·캐릭터 비주얼로 팬덤 가시화.`,
    `2. **2차(팬덤 형성 후)** — 오디오드라마/굿즈: 낮은 비용으로 팬덤 화력을 수익화.`,
    `3. **3차(대형 판권)** — 드라마/OTT·게임: 캐릭터·세계관이 강하면 대형 판권으로.`,
    ``,
    `## 우선 확장 1순위와 이유`,
    `- **웹툰화**. ${genreLabel(input.genre)} 장르 IP는 웹툰 전환 수요가 크고, 비주얼화가 팬덤·후속 판권의 발판이 됩니다.`,
  ].join("\n");
}

function rightsMd() {
  return [
    `## ⚠️ 고지`,
    `- 본 내용은 일반 가이드이며 **법률 자문이 아닙니다**. 실제 계약 전 변호사/에이전시 검토를 받으세요.`,
    ``,
    `## 권리 구조 한눈에`,
    table(["권리", "의미", "작가가 지켜야 할 것"], [
      ["연재 전송권", "플랫폼이 작품을 게재·전송할 권리", "독점 범위·기간을 한정"],
      ["2차적저작물작성권", "웹툰·영상·게임화 권리", "본 계약과 별도 협의·일괄양도 주의"],
      ["해외 번역권", "외국어판 제작·유통", "언어·지역별 분리 가능"],
      ["상품화권", "굿즈·MD 제작", "수익 배분·승인 절차 명시"],
    ]),
    ``,
    `## 계약 협상 체크리스트`,
    `- 정산 비율 / 정산 주기 / MG(미니멈 개런티) / 독점 범위·기간 / 해지 조건 / 2차 판권 별도 여부 / 분쟁 관할 / 권리 반환 조건을 반드시 확인.`,
    ``,
    `## 흔한 함정`,
    `- 모든 2차 권리를 본 계약에 '일괄 양도'하는 조항 / 무기한 독점 / 정산 산정 기준 모호 / 해지 후에도 권리가 묶이는 조항.`,
  ].join("\n");
}

function valuationMd(input) {
  return [
    `## IP 종합 점수`,
    `- **B등급 (예시 점수 72/100)** — 확장 여지가 있으나, 차별점과 완성도 보강이 점수를 끌어올림.`,
    ``,
    `## 5축 평가`,
    table(["축", "점수(0~100)", "근거"], [
      ["흥행성", "70", "장르 흥행 공식 적용 시 상승 여지"],
      ["확장성(OSMU)", "75", "웹툰화 적합도 높음"],
      ["차별성(USP)", input.usp ? "74" : "60", input.usp ? "USP 명시됨" : "USP 보강 필요"],
      ["완성도", "70", "연재 연속성·떡밥 회수로 보강 가능"],
      ["수익성", "72", "플랫폼 과금 구조 적합"],
    ]),
    ``,
    `## 투자 관점 한 줄 코멘트`,
    `- 매력: 웹툰화·글로벌 확장 그림이 그려진다. 리스크: 초반 이탈·차별점 약화 시 노출 경쟁에서 밀릴 수 있다.`,
    ``,
    `## 가치 상승 레버 (우선순위)`,
    `1. USP(결정적 차별점) 한 줄을 더 날카롭게.`,
    `2. 초반 5화 훅·절단 강화로 연독률↑.`,
    `3. 웹툰화 적합 장면(비주얼 훅) 의도적으로 설계.`,
  ].join("\n");
}

function pitchMd(input) {
  return [
    `## 한 줄 피치`,
    `- ${input.logline || `${title(input)} — 강한 전제와 확장 가능한 세계관을 가진 ${genreLabel(input.genre)} IP.`}`,
    ``,
    `## 왜 지금, 왜 이 IP`,
    `- 장르 수요가 살아 있고, 웹툰·글로벌 확장 경로가 명확하다.`,
    `- ${input.usp || "유사작과 구분되는 결정적 차별점"}으로 노출 경쟁에서 차별화된다.`,
    `- 연재 연속성·완성도를 시스템으로 보장해 2차 판권 리스크가 낮다.`,
    ``,
    `## 시장성 & 비교작`,
    `- 비교작: ${input.comps || "동장르 흥행작"}. 동급 IP의 웹툰·판권 성과를 벤치마크로 한다.`,
    ``,
    `## 확장 가치 (OSMU)`,
    `- 1순위 웹툰화 → 팬덤 가시화 → 드라마/게임 대형 판권으로 단계 확장.`,
    ``,
    `## 한눈에 보는 IP 카드`,
    table(["항목", "내용"], [
      ["장르", genreLabel(input.genre)],
      ["타깃", input.targetReader || "장르 핵심 독자"],
      ["USP", input.usp || "(보강 필요)"],
      ["1차 확장", "웹툰"],
      ["IP 등급", "B (예시)"],
      ["리스크", "초반 이탈·차별점 약화"],
    ]),
    ``,
    `## 콜 투 액션`,
    `- 웹툰 공동 개발 또는 1차 판권 우선 협상을 제안합니다.`,
  ].join("\n");
}

function buildBizLocalReport(input) {
  const mk = (id, name, tabs, text) => ({ id, name, tabs, text });
  return {
    generatedAt: new Date().toISOString(),
    model: "local-fallback",
    fallback: true,
    agents: {
      revenue: mk("revenue", "수익 모델러", ["revenue"], revenueMd(input)),
      osmuRoad: mk("osmuRoad", "OSMU 로드맵", ["osmuRoad"], osmuRoadMd(input)),
      rights: mk("rights", "권리·계약 가이드", ["rights"], rightsMd(input)),
      valuation: mk("valuation", "IP 가치 평가", ["valuation"], valuationMd(input)),
      pitch: mk("pitch", "IP 피치덱", ["pitch"], pitchMd(input)),
    },
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

module.exports = { buildBizLocalReport };
