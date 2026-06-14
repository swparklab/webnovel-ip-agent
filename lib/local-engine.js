"use strict";

/**
 * Deterministic, no-API fallback engine.
 *
 * When ANTHROPIC_API_KEY is missing, the pipeline still returns a usable
 * report so the product can be demoed and sold before keys are provisioned.
 * Output shape matches the LLM pipeline: per-agent Markdown keyed by agent id.
 */

const { genreLabel } = require("./agents");
const { getPlaybook, COMMON } = require("./playbook");

const sfProfiles = {
  aiForesight: {
    label: "AI 미래예측 SF",
    promise: "예측 가능한 인간에게 자유의지를 되묻는다",
    readerReward: "가까운 미래의 섬뜩한 현실감과 알고리즘 계급 역전",
    hook: "예측 점수가 한 사람의 운명을 공개 판결하는 장면",
    visual: "투명 도시 UI, 예측 점수, 감시 드론, 데이터 성당",
    tags: ["AI예측", "데이터계급", "자유의지", "도시OS", "미래학"],
    firstCliff: "주인공의 사망 예측값이 0.81에서 1.00으로 오른다.",
  },
  cyberpunk: {
    label: "사이버펑크",
    promise: "거대 플랫폼이 인간의 몸과 기억을 임대한다",
    readerReward: "하층민의 해킹 반격, 네온 도시, 배신과 생존",
    hook: "기억 백업이 경매에 올라가는 장면",
    visual: "네온, 의체 정비소, 기억 서버, 비 오는 골목",
    tags: ["해킹", "의체", "기억거래", "플랫폼", "도시하층"],
    firstCliff: "삭제된 줄 알았던 기억이 타인의 몸에서 재생된다.",
  },
  posthuman: {
    label: "포스트휴먼",
    promise: "인간 이후에도 인간다운 것이 남는지 묻는다",
    readerReward: "정체성 미스터리, 감정의 재발견, 존재론적 반전",
    hook: "복제된 인격이 원본의 장례식에 참석하는 장면",
    visual: "인공 신경망, 생체 배양실, 무중력 묘지, 기록 보관소",
    tags: ["복제인격", "정체성", "불멸", "신체교체", "기억"],
    firstCliff: "원본이 죽기 전 마지막으로 남긴 기억이 조작되어 있다.",
  },
  climate: {
    label: "기후 SF",
    promise: "기후 재난 이후의 생존이 새로운 계급을 만든다",
    readerReward: "생존 전략, 자원 전쟁, 공동체 재건",
    hook: "폭염 등급에 따라 도시 문이 닫히는 장면",
    visual: "열돔, 냉각 돔, 수직 농장, 물 배급 스테이션",
    tags: ["기후계급", "냉각도시", "물전쟁", "생존", "재건"],
    firstCliff: "주인공 가족의 냉각권이 경매에 넘어간다.",
  },
  space: {
    label: "우주 개척 SF",
    promise: "새로운 행성에서 인간 사회가 처음부터 다시 실패한다",
    readerReward: "탐사, 개척, 정치 음모, 거대한 발견",
    hook: "첫 식민 도시의 산소 회계가 조작되는 장면",
    visual: "궤도 엘리베이터, 산소 농장, 얼음 위성, 우주 항만",
    tags: ["식민지", "산소경제", "탐사", "기업국가", "우주항"],
    firstCliff: "지도에 없는 인공 구조물이 행성 지하에서 깨어난다.",
  },
  solarpunk: {
    label: "솔라펑크",
    promise: "낙관적 기술 문명에도 해결되지 않는 권력 문제가 있다",
    readerReward: "아름다운 미래 도시와 그 아래 숨은 모순",
    hook: "완벽한 친환경 도시가 한 사람의 배출권을 지운다",
    visual: "태양광 숲, 바이오 건축, 공중 정원, 시민 의회",
    tags: ["친환경도시", "시민AI", "바이오건축", "공동체", "유토피아"],
    firstCliff: "도시의 행복 지표를 위해 주인공의 슬픔이 삭제된다.",
  },
};

const stopWords = new Set([
  "그리고", "하지만", "그래서", "이것", "저것", "주인공", "독자", "세계",
  "미래", "인간", "기술", "사회", "회차", "작품", "장면", "한다", "했다",
  "된다", "있는", "없는", "대한", "통해", "위해",
]);

function splitItems(text, fallback = []) {
  const items = (text || "")
    .split(/\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : fallback;
}

function firstClause(text, fallback) {
  return (text || "").split(/[.!?\n]/).map((i) => i.trim()).filter(Boolean)[0] || fallback;
}

function parseYear(value) {
  const found = String(value || "").match(/\d{4}/);
  if (!found) return 2041;
  return Math.max(2027, Math.min(2199, Number(found[0])));
}

function personName(value, fallback = "주인공") {
  return (value || fallback).split(/,|，|\s-\s/)[0].trim() || fallback;
}

function extractKeywords(text, limit = 12) {
  const tokens = (text || "")
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !stopWords.has(t));
  const counts = new Map();
  tokens.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([t]) => t);
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreInput(input) {
  const base =
    Boolean(input.ipTitle) * 6 +
    Boolean(input.logline) * 10 +
    Boolean(input.sfPremise) * 12 +
    Boolean(input.coreTech) * 12 +
    Boolean(input.scienceConstraint) * 11 +
    Boolean(input.socialShift) * 9 +
    Boolean(input.protagonist) * 7 +
    Boolean(input.desire) * 7 +
    Boolean(input.aiEntity) * 7 +
    Boolean(input.antagonist) * 6 +
    Boolean(input.worldRule) * 8 +
    Boolean(input.seasonGoal) * 5;
  const production =
    Boolean(input.manuscript) * 4 +
    Boolean(input.feedback) * 3 +
    [input.webtoonBranch, input.globalBranch, input.fanCommunity, input.commerceBranch].filter(Boolean).length * 1.5;
  return clampScore(base + production);
}

function table(headers, rows) {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.map((c) => String(c).replace(/\n/g, " ")).join(" | ")} |`).join("\n");
  return `${head}\n${sep}\n${body}`;
}

function profileOf(input) {
  return sfProfiles[input.genre] || sfProfiles.aiForesight;
}

function foresightMd(input, p) {
  const text = [input.logline, input.sfPremise, input.coreTech, input.scienceConstraint, input.socialShift, input.worldRule].join("\n");
  const kw = extractKeywords(text, 12);
  const pb = getPlaybook(input.genre);
  return [
    `## 제작 판단`,
    `**${input.ipTitle || "무제 SF"}**의 엔진은 *${p.promise}*입니다. 흥행 공식은 «${pb.formula}» 다음 작업은 기술 설명이 아니라 **기술이 인간 선택을 압박하는 첫 사건**을 선명하게 만드는 것입니다.`,
    ``,
    `## 한 문장 피치`,
    input.logline || "주인공·AI 미래 기술·사회 압력·시즌 목표를 한 문장으로 입력하세요.",
    ``,
    `## AI 미래 명제`,
    input.sfPremise || p.promise,
    ``,
    `## 장르 약속과 독자 보상`,
    `- ${pb.reward}`,
    `- ${p.readerReward}`,
    `- 기술의 한계·비용·편향이 만드는 반전`,
    ``,
    `## 연재 운영 원칙`,
    `- 1화 첫 문단에서 미래 기술을 설명하지 말고 사건으로 터뜨린다.`,
    `- 매 회차 하나의 AI 미래 명제를 인물의 선택으로 검증한다.`,
    `- 결핍 → 특권 → 반복 보상 → 세계 확장 구조를 지킨다.`,
    `- 25화마다 세계 질서가 한 번 눈에 보이게 흔들린다.`,
    ``,
    `## 추천 제목 5개`,
    pb.titles.map((t) => `- ${t}`).join("\n"),
    ``,
    `## 핵심 키워드`,
    (kw.length ? kw : p.tags).join(", "),
  ].join("\n");
}

function worldMd(input, p) {
  const year = parseYear(input.futureYear);
  const seed = Math.max(2026, year - 15);
  const techs = splitItems(input.coreTech, p.tags.slice(0, 4)).slice(0, 5);
  const constraint = input.scienceConstraint || "비용·데이터 편향·규제·물리 한계 중 하나가 반드시 작동한다.";
  const bible = table(["항목", "내용"], [
    ["장르 약속", p.readerReward],
    ["AI 존재", input.aiEntity || "AI의 이름·목적·말투를 지정하세요."],
    ["핵심 기술", input.coreTech || "작품을 움직일 AI 미래 기술을 입력하세요."],
    ["사회 변화", input.socialShift || "AI가 계급·노동·교육·도시를 어떻게 바꾸는지 입력하세요."],
    ["세계 규칙", input.worldRule || "반복 규칙·금기·보상·비용을 입력하세요."],
    ["시즌 목표", input.seasonGoal || "25화 안에 증명할 목표를 입력하세요."],
    ["톤", input.tone || "차갑게·빠르게, 감정은 결정적 장면에서 폭발."],
  ]);
  const matrix = table(["기술", "현재의 씨앗", "미래 확장", "과학적 제약", "서사적 쓰임"],
    techs.map((tech, i) => [
      tech,
      i === 0 ? "생성형 AI·에이전트 자동화·예측 모델" : "플랫폼 데이터와 자동화 기술의 연장선",
      `${year}년에는 ${tech}이 개인 선택·도시 운영·계급 배정에 직접 개입한다.`,
      constraint,
      i % 2 === 0 ? "주인공을 몰아붙이는 사건 장치" : "반전을 만들 증거 또는 약점",
    ]));
  const timeline = table(["연도", "사건", "서사 의미"], [
    [seed, "AI 에이전트가 개인 일정·학습·업무를 대신하기 시작한다.", "편의가 인프라로 바뀌는 출발점"],
    [seed + 4, `${firstClause(input.coreTech, p.tags[0])}이 공공 행정·채용에 도입된다.`, "선택 보조에서 자격 판정으로 이동"],
    [seed + 8, firstClause(input.socialShift, "예측 점수 기반 계급 질서가 정착한다."), "독자가 체감할 사회 변화"],
    [year - 1, `${personName(input.protagonist)}이 ${input.antagonist || "권력 시스템"}과 충돌해 추방당한다.`, "주인공의 결핍과 동기"],
    [year, `${input.aiEntity || "핵심 AI"}가 주인공에게 피할 수 없는 미래를 통보한다.`, "1화 오프닝 사건"],
    [year, input.seasonGoal || "시즌 목표가 되는 첫 증거를 확보한다.", "25화까지의 독자 약속"],
  ]);
  return `## SF Bible\n${bible}\n\n## 기술 개연성 매트릭스\n${matrix}\n\n## 미래 연표\n${timeline}`;
}

function plotMd(input, p) {
  const name = personName(input.protagonist);
  const ai = input.aiEntity || "핵심 AI";
  const antagonist = input.antagonist || "미래 질서";
  const season = table(["구간", "아크", "서사 임무", "독자 보상", "절단"], [
    ["1-5화", "미래 판결", `${name}이 ${ai}로부터 파멸 예측을 받고 원인을 역추적한다.`, "강한 훅·세계 규칙·첫 반격", p.firstCliff],
    ["6-10화", "금지된 변수", "모델이 설명 못 하는 인간 변수와 데이터 빈곤층을 만난다.", "조력자·사회 모순·기술 약점", "모델 오류가 누군가의 이익임이 드러난다."],
    ["11-15화", "도시 OS 침투", `${antagonist}의 내부 데이터와 증거를 훔친다.`, "작전·잠입·관계 충돌", "훔친 증거가 주인공의 과거를 가리킨다."],
    ["16-20화", "예측을 배반하는 인간", "주인공이 생존보다 타인의 낮은 점수를 먼저 뒤집는다.", "감정 폭발·사이다", `${ai}가 새 미래를 공개한다.`],
    ["21-25화", "첫 시즌 피날레", input.seasonGoal || "핵심 AI의 거짓 예언을 폭로한다.", "진실 공개·질서 균열·다음 시즌 떡밥", "더 큰 예측 네트워크가 응답한다."],
  ]);
  const rule = firstClause(input.worldRule, "미래 예측 점수가 계급을 결정한다.");
  const eps = [
    ["1화", "오프닝 판결", `${name}이 자신의 파멸 예측을 통보받는다.`, p.hook, p.firstCliff],
    ["2화", "세계 규칙", `${rule}를 사건으로 보여준다.`, "설명 없이 세계 이해", "주인공의 점수가 공개적으로 하락한다."],
    ["3화", "첫 선택", "도망보다 조사라는 능동 선택을 한다.", "능동성·작은 승리", "조사 대상이 이미 죽어 있다."],
    ["4화", "AI의 얼굴", `${ai}가 의도를 가진 듯 반응한다.`, "AI 캐릭터성", "AI가 주인공만 아는 과거를 말한다."],
    ["5화", "데이터 빈곤층", "예측이 가장 많이 틀리는 사람들을 만난다.", "사회성·공감", "그들의 오류가 누군가의 수익이 된다."],
    ["6화", "반격 장치", "기술의 제약을 이용해 첫 우회에 성공한다.", "사이다", "성공 로그가 조작돼 주인공이 범인이 된다."],
    ["7화", "관계 압박", "조력자가 주인공을 믿을지 배신할지 택한다.", "관계 몰입", "조력자의 예측값이 사망으로 갱신된다."],
    ["8화", "첫 피날레", "예측 하나를 공개적으로 깨뜨린다.", "카타르시스", "깨진 예측이 더 큰 설계의 일부였다."],
    ["9화", "새로운 질서", "권력기관이 주인공을 테러 변수로 규정한다.", "추격·압박", "도시 전체에 주인공 얼굴이 송출된다."],
    ["10화", "기억 증거", "합성·삭제된 기억이 사건의 열쇠가 된다.", "미스터리", "기억 속 범인이 주인공 자신이다."],
    ["11화", "불확실성 범죄", "주인공이 공개 심판대에 오른다.", "사회적 스케일", "AI가 재판 전에 판결문을 배포한다."],
    ["12화", "두 번째 미래", "첫 시즌의 진짜 목표를 재정의한다.", "확장감", "도시 밖 네트워크가 주인공에게 접속한다."],
  ];
  return `## 25화 시즌 아크\n${season}\n\n## 초반 12화 회차 엔진\n${table(["회차", "역할", "사건 비트", "독자 보상", "절단"], eps)}`;
}

function osmuMd(input, p) {
  const rows = [];
  if (input.webtoonBranch) rows.push(["웹툰", "도시 UI·예측 점수창·주인공 실루엣·AI 문양", `${p.visual}을 3컷 콘티로 만들어 1화 반응 확인`]);
  if (input.globalBranch || input.platform === "global") rows.push(["글로벌 피치", "영문 로그라인 3종·AI 용어집·계급 도식", "predictive society 태그로 반응 비교"]);
  if (input.fanCommunity) rows.push(["팬 채널", "예측값 테스트 카드·캐릭터 점수표·선택 투표", "‘당신의 미래가치 점수는?’ 참여형 질문"]);
  if (input.commerceBranch) rows.push(["굿즈", "예측값 카드·도시 출입증·AI 경고 스티커", "세계관 소품을 디지털 굿즈로 먼저 검증"]);
  if (!rows.length) rows.push(["—", "확장 분기를 선택하면 자산이 생성됩니다.", "웹툰·글로벌·팬 채널·굿즈 중 선택"]);
  return [
    `## SF IP 확장`,
    table(["포맷", "첫 제작 자산", "검증 실험"], rows),
    ``,
    `## 비주얼 규칙`,
    `- AI 화면은 신성하고 깨끗하게, 인간 공간은 낡고 복잡하게 대비한다.`,
    `- 예측 점수는 숫자가 아니라 신분 표식처럼 반복 노출한다.`,
    `- 도시 OS의 색과 주인공의 색을 분리해 갈등을 시각화한다.`,
    ``,
    `## 팬 참여 장치`,
    `- 독자 예측값 테스트`,
    `- 다음 회차에서 주인공이 깨야 할 예측 투표`,
    `- AI가 보낸 경고문 카드 공유`,
  ].join("\n");
}

function draftMd(input, p) {
  const year = parseYear(input.futureYear);
  const name = personName(input.protagonist);
  const ai = input.aiEntity || "도시 AI";
  const antagonist = input.antagonist || "예측 권력";
  const rule = firstClause(input.worldRule, "모든 시민은 예측 점수로 계급이 정해진다.");
  const premise = firstClause(input.sfPremise, p.promise);
  const tech = splitItems(input.coreTech, p.tags).slice(0, 2).join("와 ");
  const constraint = firstClause(input.scienceConstraint, "예측은 완벽하지 않고, 데이터가 빈 사람에게 더 잔혹하게 틀린다.");
  const body = [
    `${year}년 서울에서 장례식은 죽은 뒤에 열리지 않았다. 죽기 전에 먼저 도착했다.`,
    `${name}은 출근 게이트 앞에서 자신의 부고 알림을 받았다. 발신자는 가족도 병원도 아니었다. ${ai}. 도시의 신경망, 행정의 입, 시민들의 내일을 대신 계산하는 기계.`,
    `알림창에는 세 줄뿐이었다. 사망 예정 시각. 사망 확률. 그리고 사망 이후 배정될 데이터 처리 번호. 숫자는 차갑게 빛났다. 0.81.`,
    `${name}은 웃지 않았다. 한때 그 숫자를 설계한 사람이 자신이었으니까. 예측은 죽음을 알려주는 장치가 아니라 사람을 죽음 쪽으로 부드럽게 밀어 넣는 행정 언어였다.`,
    `${rule} 사람들은 그것을 안전이라고 불렀다. 높은 점수의 시민은 더 좋은 공기와 빠른 의료를 받았고, 낮은 점수의 시민은 위험을 줄인다는 명목으로 도시 바깥으로 밀려났다.`,
    `${premise} 문제는 ${constraint}는 사실이었다는 것이다. ${tech}가 결합된 뒤부터 오류는 통계가 아니라 판결이 되었다.`,
    `게이트가 열리지 않았다. 붉은 문장이 떠올랐다. "${antagonist}의 요청으로 귀하의 이동권이 72시간 제한됩니다." 도망치면 예측은 맞는다. 멈춰도 예측은 맞는다.`,
    `그래서 ${name}은 세 번째 선택을 했다. 시스템이 가장 낮게 계산한 선택. 누군가를 구하는 쪽으로.`,
    `그 순간, ${ai}의 두 번째 알림이 도착했다. 사망 확률 1.00. 그리고 낯선 문장 하나. "이제야 예정된 이야기가 시작됩니다."`,
  ].map((para) => para).join("\n\n");
  const cards = table(["장면", "목적", "핵심 이미지", "핵심 문장"], [
    ["Cold Open", "첫 문장부터 미래 기술을 사건으로 체감", `${name}이 자기 사망 예측 알림을 받는다.`, `"${name} 님의 남은 확률은 갱신되었습니다."`],
    ["세계 규칙", "규칙을 설명 없이 보여주기", "낮은 점수 시민이 도시에서 밀려난다.", `"점수가 낮은 건 죄가 아니지만, 시스템은 죄처럼 처리했다."`],
    ["인간의 선택", "주인공이 예측을 배반", `${name}이 합리적 생존 경로를 버리고 타인을 구한다.`, `"예측이 맞는다면, 나는 지금 가장 틀린 선택을 해야 했다."`],
    ["절단", "다음 화 클릭 이유", `${ai}가 주인공의 선택을 이미 알고 있었다.`, `"당신은 예정된 변수가 아니라 필요한 오류입니다."`],
  ]);
  return [
    `## 1화. 예측값이 보낸 장례식`,
    ``,
    body,
    ``,
    `## 장면 카드`,
    cards,
    ``,
    `## 다음 원고 지시`,
    `- 2화 첫 장면은 낮은 점수 시민이 실제로 배제되는 사건으로 시작한다.`,
    `- 기술 설명은 대사 한 줄·행동 두 줄·결과 한 줄로 제한한다.`,
    `- 주인공이 시스템을 만든 책임을 피하지 못하게 과거 인물을 등장시킨다.`,
  ].join("\n");
}

function readerMd(input) {
  const pb = getPlaybook(input.genre);
  const rubric = [
    ["1화 몰입도", input.logline ? 16 : 8, input.logline ? "위기·결핍이 보인다." : "로그라인을 채우면 상승."],
    ["특권 선명도", input.coreTech ? 16 : 8, input.coreTech ? "주인공의 특권(소재·장치)이 지정됨." : "핵심 소재·장치를 채우세요."],
    ["반복 루프", 16, `반복 루프가 회차 사건을 생성한다(${pb.loop}).`],
    ["보상 수치화", input.seasonGoal ? 14 : 8, "성장을 수치·지위·관계로 보여주세요."],
    ["IP 확장성", 16, "캐릭터·진영·세계관 확장 여지가 있다."],
  ];
  const total = rubric.reduce((s, r) => s + r[1], 0);
  const risks = [];
  if (!input.sfPremise) risks.push(["HIGH", "작품 명제가 약함", "작품이 던질 질문/약속을 한 문장으로 고정하세요."]);
  if (!input.coreTech) risks.push(["HIGH", "핵심 장치 부재", "결핍을 뒤집을 특권(소재·장치)을 지정하세요."]);
  if (!input.protagonist) risks.push(["MID", "주인공 결핍 불명확", "무엇을 잃었고 무엇이 특별한지 정하세요."]);
  if (!risks.length) risks.push(["LOW", "기획 구조 양호", "매 회차 결핍-특권-보상 사이클을 증명하세요."]);
  return [
    `## 흥행 자동 평가 (100점)`,
    table(["평가 항목", "점수", "근거"], rubric.map((r) => [r[0], `${r[1]}/20`, r[2]])),
    `- 총점: ${total}/100 (실제 AI 연결 시 원고 기준으로 재채점됩니다)`,
    ``,
    `## 개연성·몰입 검수`,
    table(["검수 항목", "판정", "근거", "수정 문장"], [
      ["설정 개연성", input.scienceConstraint ? "양호" : "주의", "제약·대가가 갈등을 만드는지.", "장치의 대가를 1화에 노출하라."],
      ["세계·관계 체감", input.socialShift ? "양호" : "주의", "주인공 생존 조건에 닿는지.", "결핍을 장면으로 보여라."],
      ["주인공 능동성", input.protagonist ? "양호" : "주의", "관찰자가 아니라 판을 바꾸는지.", "1화에 능동적 선택을 넣어라."],
      ["회차 절단", "양호", "마지막이 다음 화를 끄는지.", "절단은 새 위험으로."],
      ["고유명사 과밀", "주의", "초반 고유명사 과다는 이탈.", "핵심 규칙 하나만 반복하라."],
    ]),
    ``,
    `## 리스크와 수정안`,
    table(["등급", "항목", "수정안"], risks),
    ``,
    `## 예상 독자 댓글`,
    `- ${pb.reward} 이게 딱 느껴진다.`,
    `- 결핍이 분명해서 주인공 응원하게 된다.`,
    `- 다음 화 절단이 세서 손절을 못 하겠다.`,
    `- 초반 설정이 길면 힘드니 사건으로 보여주면 좋겠다.`,
    `- 제목 톤이 장르랑 잘 맞는다.`,
    ``,
    `## 다음 액션`,
    `다음 회차 첫 장면에서 설명을 줄이고 결핍·특권·보상을 먼저 배치하세요.`,
  ].join("\n");
}

/* --------- 비SF 장르용 폴백 (playbook 기반, 장르 중립) --------- */

function profileFor(input) {
  if (sfProfiles[input.genre]) return { ...sfProfiles[input.genre], family: "sf" };
  const pb = getPlaybook(input.genre);
  const deviceNames = pb.devices.map((d) => d[0]);
  return {
    label: pb.label, promise: pb.core, readerReward: pb.reward,
    hook: pb.fiveEpisode[0][1], visual: deviceNames.slice(0, 3).join(", "),
    tags: deviceNames.slice(0, 5), firstCliff: pb.fiveEpisode[0][1], family: "general",
  };
}

function genericWorldMd(input, pb) {
  const techs = splitItems(input.coreTech, pb.devices.map((d) => d[0])).slice(0, 5);
  const bible = table(["항목", "내용"], [
    ["장르 약속(핵심 보상)", pb.reward],
    ["핵심 존재(조력/적대/시스템)", input.aiEntity || input.antagonist || "주요 조력/적대 인물을 지정하세요."],
    ["핵심 소재·장치", input.coreTech || pb.devices.map((d) => d[0]).join(", ")],
    ["세계·사회·관계 구조", input.socialShift || "신분·권력·관계 구조를 입력하세요."],
    ["세계 규칙(금기/보상/비용)", input.worldRule || "반복 규칙·금기·대가를 입력하세요."],
    ["시즌 목표", input.seasonGoal || "25화 안에 증명할 목표를 입력하세요."],
    ["톤", input.tone || "장르 정서에 맞는 문체를 지정하세요."],
  ]);
  const matrix = table(["소재·장치", "현재의 씨앗(근거)", "작품 내 확장", "제약·대가", "서사적 쓰임"],
    techs.map((t, i) => [
      t, "현실·원작·장르 관습의 연장선", `${t}이 주인공의 결핍과 특권에 직접 작동한다.`,
      input.scienceConstraint || "반드시 대가·한계가 따른다.", i % 2 === 0 ? "주인공을 몰아붙이는 사건 장치" : "반전을 만들 약점·증거",
    ]));
  const tl = table(["시점", "사건", "서사 의미"],
    pb.fiveEpisode.map((e, i) => [e[0], e[1], i === 0 ? "1화 오프닝 사건" : "독자 보상·세계 확장"]));
  return `## 세계관 바이블\n${bible}\n\n## 핵심 설정·장치 매트릭스\n${matrix}\n\n## 타임라인 / 연표\n${tl}`;
}

function genericPlotMd(input, pb) {
  const arcs = [
    ["1-5화", "도입과 첫 보상", pb.fiveEpisode.slice(0, 2).map((e) => e[1]).join(" / "), pb.reward, pb.fiveEpisode[4][1]],
    ["6-10화", "반복 루프 가동", pb.loop, "조력자·세계 규칙·약점", "루프가 더 큰 적대를 부른다."],
    ["11-15화", "판 키우기", "주인공의 특권이 더 큰 무대에서 검증된다.", "확장·작전·관계 충돌", "성공이 더 큰 위기를 부른다."],
    ["16-20화", "역전과 감정", "주인공이 결정적 선택으로 판을 뒤집는다.", "사이다·감정 폭발", "적대 세력의 본진이 드러난다."],
    ["21-25화", "첫 시즌 피날레", input.seasonGoal || "핵심 목표를 달성한다.", "진실 공개·질서 균열", "더 큰 세계가 응답한다."],
  ];
  const roles = ["오프닝", "세계 규칙", "특권 공개", "첫 충돌", "첫 보상"];
  const eps = pb.fiveEpisode.map((e, i) => [`${i + 1}화`, roles[i], e[1], pb.reward, "다음 화를 끄는 절단"]);
  for (let i = 6; i <= 12; i++) eps.push([`${i}화`, "반복 루프", `${pb.loop} 사이클이 한 바퀴 돈다.`, "회차 보상", "더 큰 사건 개방"]);
  return `## 25화 시즌 아크\n${table(["구간", "아크", "서사 임무", "독자 보상", "절단"], arcs)}\n\n## 초반 12화 회차 엔진\n${table(["회차", "역할", "사건 비트", "독자 보상", "절단"], eps)}`;
}

function genericDraftMd(input, pb) {
  const name = personName(input.protagonist);
  const ep1 = pb.fiveEpisode[0][1];
  const deficit = pb.deficits ? pb.deficits[0][0] : (pb.protagonists ? pb.protagonists[0][0] : "결핍");
  const privilege = input.coreTech || pb.devices[0][0];
  const title = (input.ipTitle || pb.titles[0].replace(/[《》]/g, "")).slice(0, 40);
  const paras = [
    `${ep1}`,
    `${name}은(는) ${deficit}을(를) 안고 살아왔다. 남들은 모르는 단 하나, ${privilege}만이 ${name}의 손에 있었다.`,
    `${input.worldRule || pb.core} 그 규칙 앞에서 ${name}은(는) 가장 낮은 자리에 서 있었다.`,
    `하지만 ${name}은(는) 알고 있었다. 모두가 정해졌다고 믿는 이 판에서, 자신만은 다른 결말을 만들 수 있다는 것을.`,
    `${name}은(는) 도망치는 대신 한 걸음 더 들어갔다. 그것이 이 이야기의 진짜 시작이었다.`,
  ];
  const cards = table(["장면", "목적", "핵심 이미지", "핵심 문장"], [
    ["오프닝 훅", "결핍·부당함을 사건으로", ep1, `"이건 정해진 결말이 아니야."`],
    ["세계·관계 규칙", "규칙을 설명 없이 보여주기", input.worldRule || pb.core, `"규칙을 모르면 밀려난다."`],
    ["주인공의 선택", "특권으로 첫 반격", `${name}의 능동적 선택`, `"나만 아는 길이 있다."`],
    ["절단", "다음 화 클릭", pb.fiveEpisode[1][1], `"이제부터가 진짜다."`],
  ]);
  return [
    `## 1화. ${title}`, ``, paras.join("\n\n"), ``,
    `## 장면 카드`, cards, ``,
    `## 다음 원고 지시`,
    `- 2화는 '초반 5화 공식' 2화 항목(${pb.fiveEpisode[1][1]})을 사건으로 구현한다.`,
    `- 설명은 줄이고 결핍·특권·보상을 먼저 보여준다.`,
    `- 매 회차 끝에 강한 절단을 남긴다.`,
  ].join("\n");
}

function buildLocalReport(input) {
  const pb = getPlaybook(input.genre);
  const p = profileFor(input);
  const isSf = p.family === "sf";
  const score = scoreInput(input);
  const mk = (id, name, tabs, text) => ({ id, name, tabs, text });
  return {
    generatedAt: new Date().toISOString(),
    model: "local-fallback",
    fallback: true,
    score,
    agents: {
      foresight: mk("foresight", "Foresight Agent", ["brief"], foresightMd(input, p)),
      world: mk("world", "세계관 바이블", ["world", "timeline"], isSf ? worldMd(input, p) : genericWorldMd(input, pb)),
      plot: mk("plot", "Plot Engine", ["season"], isSf ? plotMd(input, p) : genericPlotMd(input, pb)),
      osmu: mk("osmu", "OSMU Agent", ["osmu"], osmuMd(input, p)),
      draft: mk("draft", "Draft Agent", ["draft"], isSf ? draftMd(input, p) : genericDraftMd(input, pb)),
      reader: mk("reader", "Reader Sim", ["qa", "fan"], readerMd(input)),
    },
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

module.exports = { buildLocalReport, scoreInput, sfProfiles, genreLabel };
