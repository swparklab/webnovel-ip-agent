"use strict";

/**
 * AI 글쓰기 도구상자 (Writing Toolbox).
 *
 * 경쟁 소설 AI(Sudowrite·Novelcrafter 등)의 시그니처인 '라인 단위' 보조 도구.
 * 파이프라인이 '작품 구조'를 만든다면, 도구상자는 작가가 문장 앞에서 막혔을 때
 * 즉석에서 돕는다: 브레인스토밍 · 묘사 강화 · 다시쓰기 · 확장 · 압축 · 이름 짓기.
 *
 * 단발 호출(/api/tool). 짧은 산출물이라 SSE를 쓰지 않는다.
 */

const { genreLabel } = require("./agents");
const { mediumLabel, isMedium } = require("./medium");

function ctxLine(ctx = {}) {
  const bits = [];
  if (ctx.medium && isMedium(ctx.medium) && ctx.medium !== "webnovel") bits.push(`매체: ${mediumLabel(ctx.medium)}`);
  if (ctx.genre) bits.push(`장르: ${genreLabel(ctx.genre)}`);
  if (ctx.tone) bits.push(`톤: ${ctx.tone}`);
  if (ctx.protagonist) bits.push(`주인공: ${ctx.protagonist}`);
  return bits.length ? `[작품 맥락] ${bits.join(" · ")}\n` : "";
}

// 다시쓰기 모드별 지시.
const REWRITE_MODES = {
  vivid: "더 생생하고 감각적으로(보여주기 위주, 클리셰 제거)",
  tense: "더 긴장감 있고 박진감 있게(짧은 호흡·절단감 강화)",
  concise: "군더더기를 덜어 더 간결하고 또렷하게",
  emotional: "인물의 내면·감정을 더 깊게 드러나게",
  formal: "문어체·정제된 문체로",
  casual: "구어체·가벼운 문체로",
};

// 브레인스토밍 종류.
const BRAINSTORM_KINDS = {
  next: "다음에 벌어질 수 있는 전개",
  twist: "예상을 뒤집는 반전",
  title: "작품 제목 후보",
  name: "인물 이름 후보",
  power: "능력·설정 아이디어",
  conflict: "갈등·사건 아이디어",
  free: "아이디어",
};

const TOOLS = {
  brainstorm: { label: "브레인스토밍", needsText: true, kinds: BRAINSTORM_KINDS },
  describe: { label: "묘사 강화", needsText: true },
  rewrite: { label: "다시쓰기", needsText: true, modes: REWRITE_MODES },
  expand: { label: "확장", needsText: true },
  shrink: { label: "압축", needsText: true },
  names: { label: "이름 짓기", needsText: false },
};

// 매체 제작 도구팩 — 영상/광고 현장에서 바로 쓰는 단발 연출 자료. (media tools modal에서 노출)
const MEDIA_TOOLS = {
  logline: { label: "로그라인 다듬기", needsText: false },
  tagline: { label: "태그라인·카피", needsText: false },
  charactersheet: { label: "캐릭터 시트", needsText: false },
  cuesheet: { label: "음악·사운드 큐시트", needsText: false },
  shotlist: { label: "샷리스트·콘티", needsText: false },
};

function buildToolPrompt({ tool, text, mode, ctx = {} }) {
  const t = String(text || "").slice(0, 6000);
  const c = ctxLine(ctx);
  const tail = "\n\n[규칙] 한국어. 인사말·메타 발언 없이 결과물만 출력한다.";

  switch (tool) {
    case "brainstorm": {
      const kind = BRAINSTORM_KINDS[mode] || BRAINSTORM_KINDS.free;
      return {
        system: `너는 웹소설 작가의 브레인스토밍 파트너다. 주제에 대해 서로 겹치지 않는 신선한 '${kind}' 10개를 제안한다. 진부한 클리셰는 피하고, 장르 정서에 맞게.${tail}`,
        user: `${c}주제: ${t}\n\n위 주제로 '${kind}' 10개를 번호 목록으로. 각 항목은 한 줄(필요하면 괄호로 짧은 부연).`,
      };
    }
    case "describe":
      return {
        system: `너는 묘사 전문 작가다. 주어진 대상/장면을 오감(시각·청각·후각·촉각·분위기)으로 생생하게, 클리셰 없이 묘사한다. 설명이 아니라 '바로 원고에 붙일 수 있는 본문체'로 쓴다.${tail}`,
        user: `${c}묘사할 대상/장면: ${t}\n\n위를 200~400자의 생생한 묘사 단락으로 써라.`,
      };
    case "rewrite": {
      const how = REWRITE_MODES[mode] || REWRITE_MODES.vivid;
      return {
        system: `너는 문장을 다듬는 작가다. 주어진 문단을 '${how}' 방향으로 다시 쓴다. 사건·의미·정보는 유지하되 표현을 바꾼다. 결과 문단만 출력한다.${tail}`,
        user: `${c}원문:\n${t}\n\n위 문단을 '${how}' 방향으로 다시 써라.`,
      };
    }
    case "expand":
      return {
        system: `너는 장면을 확장하는 작가다. 주어진 문단을 1.5~2배 분량으로 확장한다. 감각 디테일·인물 내면·동작을 더하되 늘어지지 않게, 같은 흐름을 유지한다. 확장된 문단만 출력한다.${tail}`,
        user: `${c}원문:\n${t}\n\n위 문단을 자연스럽게 확장해 다시 써라.`,
      };
    case "shrink":
      return {
        system: `너는 문장을 압축하는 편집자다. 주어진 문단을 핵심만 남겨 약 절반 분량으로 줄인다. 긴장감과 필수 정보는 유지하고 군더더기·중복을 제거한다. 압축된 문단만 출력한다.${tail}`,
        user: `${c}원문:\n${t}\n\n위 문단을 절반 분량으로 압축해 다시 써라.`,
      };
    case "names":
      return {
        system: `너는 작명가다. 작품의 장르·정서에 어울리는 인물 이름 후보를 만든다. 각 이름에 한 줄 콘셉트(역할·이미지)를 붙인다.${tail}`,
        user: `${c}요청: ${t || "주요 인물 이름 후보"}\n\n어울리는 이름 후보 10개를 '이름 — 콘셉트' 형식 번호 목록으로.`,
      };
    case "logline":
      return {
        system: `너는 영상·콘텐츠 기획자다. 강하게 '팔리는' 로그라인을 만든다. 누가/무엇을 잃고/어떤 금지된 선택을 하는가가 한 문장에 담겨 다음이 궁금하게.${tail}`,
        user: `${c}소재/현재 로그라인: ${t || "(작품 맥락 기반)"}\n\n서로 결이 다른 로그라인 후보 6개를 번호 목록으로. 각 한 문장.`,
      };
    case "tagline":
      return {
        system: `너는 카피라이터다. 포스터·예고편·광고에 쓸 짧고 강한 태그라인/카피를 만든다. 기억에 남고 한 줄로 각인되게.${tail}`,
        user: `${c}대상: ${t || "(작품 맥락 기반)"}\n\n태그라인/카피 후보 10개를 번호 목록으로. 각 한 줄(짧게).`,
      };
    case "charactersheet":
      return {
        system: `너는 캐릭터 디자이너 겸 캐스팅 디렉터다. 주요 인물의 '캐릭터 시트'를 만든다: 외형·실루엣·색·성격·욕망·관계·말투, 그리고 캐스팅/성우 방향과 굿즈화 포인트.${tail}`,
        user: `${c}인물 정보: ${t || "(작품 맥락의 주요 인물)"}\n\n주요 인물 2~3명의 캐릭터 시트를 인물별로: 외형/실루엣·색, 성격·욕망, 관계, 말투, 캐스팅·성우 방향, 굿즈 포인트.`,
      };
    case "cuesheet":
      return {
        system: `너는 음악감독이다. 장면/파트별 음악·사운드 '큐시트'를 만든다. 각 큐에 분위기·악기·삽입곡 성격·사운드 이펙트·진입/퇴장 타이밍을 지정한다.${tail}`,
        user: `${c}장면/구성: ${t || "(작품 맥락의 주요 파트)"}\n\n큐시트를 표로: | 큐# | 파트/장면 | 분위기 | 음악(악기·템포) | SE | 진입·퇴장 |. 6~10개 큐.`,
      };
    case "shotlist":
      return {
        system: `너는 촬영감독·콘티 작가다. 핵심 장면의 '샷리스트'를 만든다. 각 샷에 사이즈(LS/MS/CU)·앵글·무빙·렌즈·조명/색·연출 의도를 지정한다.${tail}`,
        user: `${c}장면: ${t || "(작품 맥락의 핵심 1장면)"}\n\n샷리스트를 표로: | 샷# | 사이즈 | 앵글·무빙 | 렌즈 | 조명·색 | 연출 의도 |. 8~12개 샷.`,
      };
    default:
      return {
        system: `너는 웹소설 작가의 보조다.${tail}`,
        user: `${c}${t}`,
      };
  }
}

/** 키 없을 때의 결정론적 폴백(미리보기 수준). */
function localTool({ tool, text, mode }) {
  const t = String(text || "").trim();
  const note = "\n\n> (로컬 폴백 미리보기입니다. 키/구독 연결 시 실제 AI 결과가 생성됩니다.)";
  switch (tool) {
    case "brainstorm": {
      const kind = BRAINSTORM_KINDS[mode] || BRAINSTORM_KINDS.free;
      const seeds = ["뒤집기", "대가 치르기", "숨은 적", "예상 밖 동맹", "과거의 귀환", "선택의 함정", "정체 폭로", "더 큰 판", "내부 배신", "금지된 수단"];
      return `## '${kind}' 아이디어 10\n` + seeds.map((s, i) => `${i + 1}. ${t ? `${t} — ` : ""}${s}`).join("\n") + note;
    }
    case "describe":
      return `${t || "그 장면"}이(가) 눈앞에 펼쳐졌다. 빛과 그림자가 엇갈리고, 멀리서 들려오는 소리가 공기를 흔들었다. 차가운 감촉과 옅은 냄새가 감각의 끝에 닿았다.${note}`;
    case "expand":
      return `${t}\n\n그 순간의 공기까지 또렷해졌다. 작은 움직임 하나가 모든 것을 바꿀 듯 팽팽했다.${note}`;
    case "shrink":
      return `${t.split(/[.!?。]/).slice(0, 2).join(". ").trim()}.${note}`;
    case "names":
      return `## 이름 후보\n1. 서리 — 차가운 결의의 주인공\n2. 단 — 짧고 강한 인상\n3. 유하 — 부드럽지만 단단한 조력자${note}`;
    case "logline":
      return `## 로그라인 후보\n1. ${t || "한 인물"}이(가) 가장 소중한 것을 잃고, 돌이킬 수 없는 선택 앞에 선다.\n2. 평범한 하루가 한 줄의 통보로 무너진다.${note}`;
    case "tagline":
      return `## 태그라인 후보\n1. 끝이 정해진 이야기, 단 하나의 변수.\n2. 당신이 아는 결말은 틀렸다.${note}`;
    case "charactersheet":
      return `## 캐릭터 시트 (로컬 데모)\n- 외형/실루엣·색: …\n- 성격·욕망: …\n- 관계 / 말투: …\n- 캐스팅·성우 방향 / 굿즈 포인트: …${note}`;
    case "cuesheet":
      return `## 음악 큐시트 (로컬 데모)\n| 큐# | 파트 | 분위기 | 음악 | SE | 진입·퇴장 |\n|---|---|---|---|---|---|\n| 1 | 오프닝 | 긴장 | 저음 현 | 앰비언스 | 페이드인 |${note}`;
    case "shotlist":
      return `## 샷리스트 (로컬 데모)\n| 샷# | 사이즈 | 앵글·무빙 | 렌즈 | 조명·색 | 의도 |\n|---|---|---|---|---|---|\n| 1 | LS | 부감·고정 | 광각 | 차가운 톤 | 세계 제시 |${note}`;
    case "rewrite":
    default:
      return `${t}${note}`;
  }
}

module.exports = { TOOLS, MEDIA_TOOLS, REWRITE_MODES, BRAINSTORM_KINDS, buildToolPrompt, localTool };
