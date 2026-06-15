"use strict";

/**
 * 완성도 심사 (Quality Audit) — 공모전 '작품 완성도' 기준.
 *
 * 상업적 연독률(흥행 공식)이 아니라 '작품으로서의 완성도'를 본다.
 * 까다로운 심사위원단 + 레드팀('왜 본심/수상에서 떨어지는가') 관점으로
 * 냉정하게 채점하고, 치명적 약점·기시감·정합성 오류·보강 로드맵을 낸다.
 */

const DIMS = ["문장력", "구성", "개연성", "캐릭터", "주제의식", "독창성", "정서", "기술완성도"];

// 흥행 플레이북을 일부러 빼고, 작품 정보만 가볍게 싣는다(상업 공식 쪽으로 편향되지 않게).
function inputSummary(input) {
  const v = (x, f = "(미지정)") => String(x ?? "").trim() || f;
  return [
    `작품: ${v(input.ipTitle, "무제")} / 장르: ${input.genre || "미지정"}`,
    `로그라인: ${v(input.logline)}`,
    `작품 명제/코어: ${v(input.sfPremise)}`,
    input.references ? `업로드 과학 근거(발췌): ${String(input.references).slice(0, 1500)}` : "",
  ].filter(Boolean).join("\n");
}

function buildWorkAuditPrompt({ input, digest }) {
  const system = `너는 문예·SF 공모전 '본심' 수준의 까다로운 심사위원단이다. 평가 대상은 상업적 연독률(흥행 공식·사이다)이 아니라 '작품으로서의 완성도'다.

[심사 렌즈 — 각 0~100, 후하게 주지 마라. 평범하면 평범하다고 한다]
- 문장력: 정확성·리듬·묘사력, 상투적 표현(클리셰) 없는가
- 구성: 플롯 설계·페이싱 통제·복선과 회수·아크의 응집
- 개연성: 내적 정합성, 설정·과학적 근거의 설득력
- 캐릭터: 내면·동기·변화·고유한 목소리
- 주제의식: 이 작품이 '결국 무엇에 대한 이야기인가', 깊이
- 독창성: 기시감/클리셰의 부재, 신선한 발상·전개 (어디서 본 듯하면 어디서인지 짚어라)
- 정서: 정서적 울림·여운
- 기술완성도: 연속성 오류·반복·군더더기·톤 일관성

[필수]
- 여러 렌즈로 본 뒤, 레드팀으로서 '왜 이 작품이 본심/수상에서 떨어질 수 있는가'를 fatalWeaknesses에 정리한다(치명적인 것부터).
- 기시감/클리셰는 cliches에, 연속성·설정 오류는 inconsistencies에 구체적으로.
- revisionPlan은 '완성도를 끌어올릴' 구체 행동(문장/장면/구조 단위). 흥행 사이다 추가 같은 건 금지.
- 발췌(회차 도입부/마무리) 기반 심사이므로 단정 못 할 부분은 그렇게 표시한다.
- 점수는 정직하게. 근거 없는 후한 점수 금지. 오직 JSON 하나만 출력(코드펜스·설명 금지).

{
  "overall": 0~100,
  "grade": "본심 가능성/수준 한 줄 평가(정직하게)",
  "dimensions": { "문장력":0~100, "구성":0~100, "개연성":0~100, "캐릭터":0~100, "주제의식":0~100, "독창성":0~100, "정서":0~100, "기술완성도":0~100 },
  "strengths": ["진짜 강점 2~4개"],
  "fatalWeaknesses": [ { "issue":"치명적 약점", "why":"왜 완성도/수상에 치명적인가", "chapters":[관련 회차 번호 배열] } ],
  "cliches": ["기시감/클리셰 요소와 어디서 본 듯한지"],
  "inconsistencies": ["연속성·설정 오류"],
  "revisionPlan": ["완성도를 끌어올릴 우선순위 보강 지시 4~6개"],
  "verdict": "한 줄 총평(냉정하게)"
}`;

  const user = `${inputSummary(input)}\n\n## [작품 본문 — 회차별 도입부/마무리 발췌]\n${String(digest).slice(0, 40000)}\n\n위 작품의 '완성도'를 공모전 본심 기준으로 냉정하게 심사하고 JSON으로 출력하라.`;
  return { system, user };
}

function parseAudit(text) {
  if (!text) return null;
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1 || e <= s) return null;
  const raw = text.slice(s, e + 1);
  let obj = null;
  try { obj = JSON.parse(raw); } catch { try { obj = JSON.parse(raw.replace(/,(\s*[}\]])/g, "$1")); } catch { return null; } }
  if (!obj || typeof obj !== "object") return null;
  const arr = (x) => (Array.isArray(x) ? x : []);
  const dimensions = {};
  DIMS.forEach((d) => { dimensions[d] = Number(obj.dimensions?.[d]) || 0; });
  const fatal = arr(obj.fatalWeaknesses).map((w) => ({
    issue: String(w?.issue || w || ""),
    why: String(w?.why || ""),
    chapters: arr(w?.chapters).map(Number).filter((n) => !Number.isNaN(n)),
  })).filter((w) => w.issue);
  return {
    overall: Number(obj.overall) || Math.round(Object.values(dimensions).reduce((a, b) => a + b, 0) / DIMS.length),
    grade: String(obj.grade || ""),
    dimensions,
    strengths: arr(obj.strengths).map(String),
    fatalWeaknesses: fatal,
    cliches: arr(obj.cliches).map(String),
    inconsistencies: arr(obj.inconsistencies).map(String),
    revisionPlan: arr(obj.revisionPlan).map(String),
    verdict: String(obj.verdict || ""),
  };
}

function localAudit(input, digest) {
  const len = String(digest || "").length;
  return {
    overall: 62,
    grade: "로컬 폴백 추정 — 실제 심사는 키/구독 연결 시 가능",
    dimensions: { 문장력: 60, 구성: 64, 개연성: 62, 캐릭터: 60, 주제의식: 58, 독창성: 55, 정서: 60, 기술완성도: 62 },
    strengths: ["콘셉트와 세계관의 방향이 분명함"],
    fatalWeaknesses: [
      { issue: "독창성 검증 불가", why: "기시감 여부는 실제 LLM 심사가 필요. 흥행 공식 최적화는 클리셰 위험을 키운다", chapters: [] },
      { issue: "문장·정서의 밀도 미확인", why: "발췌만으로는 단정 어려움", chapters: [] },
    ],
    cliches: ["(키/구독 연결 시 기시감 탐지 가능)"],
    inconsistencies: [],
    revisionPlan: [
      "회차마다 클리셰 표현을 신선한 묘사로 교체",
      "주인공의 내면·동기를 장면으로 더 깊게",
      "주제의식을 한 문장으로 벼리고, 그 주제가 사건으로 드러나게 구성 정리",
      "설정·연속성 점검(이름·수치·시간선)",
    ],
    verdict: `발췌 ${len}자 기반 폴백 추정치입니다. 실제 완성도 심사는 LLM 연결 후 진행하세요.`,
    fallback: true,
  };
}

module.exports = { buildWorkAuditPrompt, parseAudit, localAudit, DIMS };
