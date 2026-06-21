"use strict";

/**
 * 매체별 성공방정식 + 연출 지식베이스 (Medium Success & Directing Playbook).
 *
 * 장르(playbook.js)와 직교하는 '매체(medium)' 축을 구조화 데이터로 인코딩한다.
 * 웹소설 외에 애니메이션·영화·다큐멘터리·드라마(OTT)·광고를 1급 매체로 다루며,
 * 각 매체마다:
 *   1) 성공 방정식(successEquation) — 매체의 상업·감정 약속 한 줄
 *   2) 실패 패턴(failurePatterns)
 *   3) 연출(directing) — 파트별 '감동 요소'와 '연출값(연출 차원)'
 *   4) 포맷별 구조 타깃(formats) — 단편/중편/장편의 단위·개수·러닝타임·막 모델
 *
 * 모든 값은 LLM 없이 동작하는 순수 데이터다(local 모드 폴백·테스트 대상).
 * playbook.js / steering.js 의 주입 패턴(buildXxxBlock)을 그대로 미러링한다.
 */

const MEDIUM_LABELS = {
  webnovel: "웹소설",
  animation: "애니메이션",
  film: "영화",
  documentary: "다큐멘터리",
  drama: "드라마/OTT 시리즈",
  advertising: "광고 시리즈",
};

const FORMAT_LABELS = { short: "단편", medium: "중편", long: "장편" };

const FORMAT_KEYS = Object.keys(FORMAT_LABELS);
const DEFAULT_MEDIUM = "webnovel";
const DEFAULT_FORMAT = "medium";

/**
 * 매체 데이터.
 *  - directing.emotionBeats: [파트, 끌어낼 감정, 연출 기법] 3-튜플
 *  - directing.dimensions:   이 매체에서 '연출값'을 설계할 차원들
 *  - formats[key]: { unit(단위), count(개수), runtime(러닝타임), actModel(막 구조) }
 */
const MEDIA = {
  webnovel: {
    label: "웹소설",
    successEquation: "결핍 × 특권 × 회차 검증 × 즉시 보상 × 세계 확장",
    failurePatterns: [
      ["1화부터 설정 설명이 길다", "독자는 설정집이 아니라 사건을 원한다"],
      ["주인공이 관찰자에 머문다", "판을 바꾸는 행위자여야 한다"],
      ["보상이 추상적이다", "돈·레벨·지위·호감도·랭킹으로 보여야 한다"],
    ],
    directing: {
      emotionBeats: [
        ["1화 훅", "몰입", "첫 문장에 결핍·부당함을 사건으로 던진다"],
        ["첫 보상(5화)", "사이다", "무시하던 자를 통쾌하게 역전, 수치로 보상"],
        ["중반 반전", "충격", "깔아둔 떡밥을 비틀어 판을 키운다"],
        ["피날레", "카타르시스", "복선 일괄 회수 + 차기 시즌 여운"],
      ],
      dimensions: ["문체·호흡", "장면 묘사", "대사 톤", "절단(클리프행어)", "정보 공개 속도"],
    },
    formats: {
      short: { unit: "화", count: 25, runtime: "단편 시즌(1막 완결)", actModel: "기승전결 압축" },
      medium: { unit: "화", count: 75, runtime: "중편 연재", actModel: "기승전결 + 다중 아크" },
      long: { unit: "화", count: 200, runtime: "장편 연재", actModel: "멀티 시즌" },
    },
  },

  animation: {
    label: "애니메이션",
    successEquation: "캐릭터 비주얼 매력 × 세계관 후크 × 화별 클리프행어 × 작화·연출 임팩트 × 음악 동기화",
    failurePatterns: [
      ["캐릭터가 밋밋하다", "애니는 캐릭터 굿즈·팬덤이 수익의 축이다"],
      ["1화 후크가 약하다", "방영·OTT 첫 화 이탈이 시리즈 운명을 가른다"],
      ["작화 임팩트 컷이 없다", "'그 장면'이 없으면 회자되지 않는다"],
    ],
    directing: {
      emotionBeats: [
        ["오프닝(콜드 오픈)", "호기심", "세계관 한 컷 + 캐릭터 매력 한 컷으로 후크"],
        ["1화 클라이맥스", "고양", "작화 폭발 컷 + 삽입곡(주제가) 동기화"],
        ["관계 전환", "공감", "표정·눈빛 클로즈업 + 정적 연출(무음→음악)"],
        ["시즌/단막 절정", "카타르시스", "색·작화·음악을 한 점으로 모으는 합(合) 연출"],
      ],
      dimensions: ["작화·캐릭터 디자인", "색·미술(아트디렉션)", "음악·삽입곡", "카메라(레이아웃·콘티)", "연출 호흡(템포·정적)", "사운드 이펙트"],
    },
    formats: {
      short: { unit: "화", count: 1, runtime: "OVA/단편 1편(~24분)", actModel: "단막 기승전결" },
      medium: { unit: "화", count: 12, runtime: "TV 시리즈 1쿨", actModel: "시즌 단일 아크" },
      long: { unit: "화", count: 24, runtime: "2쿨/분할쿨 또는 극장판 연계", actModel: "멀티 아크" },
    },
  },

  film: {
    label: "영화",
    successEquation: "단일 강한 전제 × 시각적 훅 × 미드포인트 반전 × 감정 절정 × 여운의 라스트신",
    failurePatterns: [
      ["전제(로그라인)가 약하다", "한 줄로 안 팔리면 관객이 극장에 오지 않는다"],
      ["미드포인트가 없다", "2막이 늘어져 중반 이탈"],
      ["주제를 대사로 설명한다", "주제는 이미지·행동으로 박아야 한다"],
    ],
    directing: {
      emotionBeats: [
        ["오프닝 이미지", "호기심", "주제를 압축한 한 컷 + 톤 제시(색·렌즈)"],
        ["미드포인트", "충격·재정렬", "판을 뒤집는 정보, 카메라 무빙·편집 리듬 전환"],
        ["올 이즈 로스트", "상실·공감", "정적·롱테이크 + 음악 빠짐(침묵의 연출)"],
        ["클라이맥스", "카타르시스", "교차편집 가속 + 음악 절정 + 색의 대비 폭발"],
        ["파이널 이미지", "여운", "오프닝과 호응하는 수미상관 한 컷"],
      ],
      dimensions: ["미장센", "촬영(카메라·렌즈·앵글)", "조명·색", "편집 리듬", "사운드·음악", "연기 톤·블로킹"],
    },
    formats: {
      short: { unit: "씬", count: 12, runtime: "단편영화 10~20분", actModel: "3막 압축" },
      medium: { unit: "씬", count: 25, runtime: "중편 40~60분", actModel: "3막" },
      long: { unit: "씬", count: 40, runtime: "장편영화 90~120분", actModel: "3막 + 미드포인트" },
    },
  },

  documentary: {
    label: "다큐멘터리",
    successEquation: "선명한 논점 × 인물·현장 진정성 × 아카이브 신뢰 × 내러티브 아크 × 감정적 진실",
    failurePatterns: [
      ["논점이 흐릿하다", "'무엇에 대한 이야기인가'가 한 줄로 안 잡히면 산만해진다"],
      ["나열식 정보 전달", "사실의 나열이 아니라 인물의 여정으로 끌어야 한다"],
      ["추측을 사실처럼 단언", "출처·검증 없는 단정은 신뢰를 무너뜨린다"],
    ],
    directing: {
      emotionBeats: [
        ["오프닝 질문", "호기심", "관객의 통념을 흔드는 한 장면/한 질문으로 연다"],
        ["인물 몰입", "공감", "인터뷰 클로즈업 + 현장음, 침묵을 견디는 편집"],
        ["전환 사실(반전)", "각성", "아카이브·데이터 제시로 통념을 깨고 판을 재정의"],
        ["엔딩 성찰", "행동 촉구", "내레이션 절제 + 현장의 여백으로 관객에게 질문을 남김"],
      ],
      dimensions: ["인터뷰 설계", "아카이브·자료(출처)", "내레이션", "현장음·앰비언스", "구성 리듬", "음악"],
    },
    formats: {
      short: { unit: "시퀀스", count: 6, runtime: "단편 다큐 15~30분", actModel: "단일 논점" },
      medium: { unit: "시퀀스", count: 10, runtime: "중편 다큐 50~70분", actModel: "3부 구성" },
      long: { unit: "에피소드", count: 6, runtime: "시리즈 다큐 6부작", actModel: "부별 논점 + 종합" },
    },
  },

  drama: {
    label: "드라마/OTT 시리즈",
    successEquation: "중독성 화별 훅 × 캐릭터 욕망·관계 × 시즌 미스터리 × 감정 절정 × 회차 끝 클리프행어",
    failurePatterns: [
      ["화별 훅이 약하다", "OTT는 '다음 화 자동재생'을 못 누르면 진다"],
      ["캐릭터 욕망이 흐릿하다", "관계 드라마는 인물이 무엇을 원하는지가 엔진"],
      ["시즌 미스터리 부재", "회차를 관통하는 한 줄 질문이 없으면 몰아보기가 안 된다"],
    ],
    directing: {
      emotionBeats: [
        ["1화 콜드 오픈", "몰입", "시즌 질문을 던지는 강한 사건 + 인물 욕망 제시"],
        ["관계 전환", "긴장·설렘", "투샷·시선 처리 + OST 진입 타이밍"],
        ["미드시즌 반전", "충격", "판을 뒤집는 폭로, 편집·음악으로 회차 끝 절단"],
        ["시즌 피날레", "카타르시스", "감정 절정 + 다음 시즌 떡밥의 라스트신"],
      ],
      dimensions: ["연출(미장센)", "촬영·색", "편집 리듬", "음악·OST", "연기 디렉션", "엔딩(클리프행어) 연출"],
    },
    formats: {
      short: { unit: "화", count: 6, runtime: "미니시리즈 6부작", actModel: "단일 시즌 압축" },
      medium: { unit: "화", count: 12, runtime: "시즌제 드라마 12부작", actModel: "시즌1 아크" },
      long: { unit: "화", count: 16, runtime: "롱폼 OTT 16부작 + 시즌제", actModel: "멀티 시즌" },
    },
  },

  advertising: {
    label: "광고 시리즈",
    successEquation: "3초 후크 × 단일 브랜드 메시지 × 감정·유머 임팩트 × 기억 잔상 × 명확한 CTA",
    failurePatterns: [
      ["3초 안에 잡지 못한다", "스킵 환경에서 첫 3초가 전부다"],
      ["메시지가 여러 개다", "한 편엔 하나의 메시지만 남아야 기억된다"],
      ["브랜드 연결이 약하다", "감동은 났는데 무슨 브랜드인지 기억 안 나면 실패"],
    ],
    directing: {
      emotionBeats: [
        ["3초 후크", "주목", "예상 밖 이미지·소리·질문으로 시선을 강탈"],
        ["공감 빌드", "몰입", "타깃의 일상·결핍을 압축한 장면으로 끌어들임"],
        ["브랜드 연결", "납득", "제품이 결핍을 푸는 순간을 시각적으로 증명"],
        ["CTA", "행동", "한 줄 카피 + 사운드 로고로 기억 잔상과 행동 유도"],
      ],
      dimensions: ["3초 후크", "비주얼 임팩트", "카피·메시지", "음악·사운드 로고", "페이싱(컷 수)", "CTA 연출"],
    },
    formats: {
      short: { unit: "컷", count: 1, runtime: "15~30초 단편 스팟", actModel: "단일 후크-CTA" },
      medium: { unit: "편", count: 3, runtime: "30~60초 ×3편 시리즈", actModel: "시리즈 3부" },
      long: { unit: "편", count: 6, runtime: "브랜드 캠페인(다편)", actModel: "브랜드 서사 시리즈" },
    },
  },
};

const MEDIUM_KEYS = Object.keys(MEDIA);

/* --------------------------------- 조회 --------------------------------- */

function isMedium(medium) {
  return Boolean(medium && MEDIA[medium]);
}

/** 알 수 없는 값이면 기본 매체로 정규화. */
function resolveMedium(medium) {
  return isMedium(medium) ? medium : DEFAULT_MEDIUM;
}

/** 알 수 없는 값이면 기본 포맷으로 정규화. */
function resolveFormat(format) {
  return FORMAT_LABELS[format] ? format : DEFAULT_FORMAT;
}

function mediumLabel(medium) {
  return MEDIA[resolveMedium(medium)].label;
}

function formatLabel(format) {
  return FORMAT_LABELS[resolveFormat(format)];
}

function mediumSuccessEquation(medium) {
  return MEDIA[resolveMedium(medium)].successEquation;
}

/** 매체×포맷의 구조 타깃 { unit, count, runtime, actModel }. */
function mediumStructureTarget(medium, format = DEFAULT_FORMAT) {
  return MEDIA[resolveMedium(medium)].formats[resolveFormat(format)];
}

/* ------------------------------- 프롬프트 블록 ------------------------------- */

/** 연출 블록 — 파트별 감동 요소 + 연출값 차원. (프롬프트 주입용) */
function mediumDirectingBlock(medium) {
  const m = MEDIA[resolveMedium(medium)];
  const beats = m.directing.emotionBeats
    .map(([part, emotion, how]) => `- **${part}** → 끌어낼 감정: ${emotion} / 연출 기법: ${how}`)
    .join("\n");
  return [
    `# 연출 설계 지침 (${m.label})`,
    `- 연출값을 설계할 차원: ${m.directing.dimensions.join(" · ")}`,
    `- 파트별 감동 설계(이 매체의 감정 곡선):`,
    beats,
  ].join("\n");
}

/**
 * 매체 종합 블록 — 성공방정식 + 실패패턴 + 포맷 구조 타깃 + 연출.
 * 모든 매체 에이전트 프롬프트에 '구속 조건'으로 주입한다.
 */
function buildMediumBlock(medium, format = DEFAULT_FORMAT) {
  const m = MEDIA[resolveMedium(medium)];
  const t = mediumStructureTarget(medium, format);
  const fmtLabel = formatLabel(format);
  const fails = m.failurePatterns.map(([p, why]) => `- ${p} → ${why}`).join("\n");
  return [
    `# 매체 성공 방정식 (${m.label} · ${fmtLabel})`,
    `- 성공 방정식: ${m.successEquation}`,
    `- 피해야 할 실패 패턴:`,
    fails,
    ``,
    `# 포맷 구조 타깃 (${fmtLabel})`,
    `- 구조 단위: ${t.unit} · 목표 분량: ${t.count}${t.unit} · 러닝타임: ${t.runtime} · 막 구조: ${t.actModel}`,
    `- 위 ${t.count}개 ${t.unit}에 성공 방정식의 흐름이 한 바퀴 이상 돌도록 설계한다.`,
    ``,
    mediumDirectingBlock(medium),
  ].join("\n");
}

module.exports = {
  MEDIA,
  MEDIUM_LABELS,
  FORMAT_LABELS,
  MEDIUM_KEYS,
  FORMAT_KEYS,
  DEFAULT_MEDIUM,
  DEFAULT_FORMAT,
  isMedium,
  resolveMedium,
  resolveFormat,
  mediumLabel,
  formatLabel,
  mediumSuccessEquation,
  mediumStructureTarget,
  mediumDirectingBlock,
  buildMediumBlock,
};
