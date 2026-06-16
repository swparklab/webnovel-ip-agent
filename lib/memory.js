"use strict";

/**
 * 연재 메모리 (Story Memory / 롤링 캐논).
 *
 * 문제: 연속 회차 집필은 N화를 쓸 때 '직전 1개 화'만 맥락으로 받는다.
 *      20화를 쓸 때 1~18화에서 무슨 일이 있었는지 모델이 모르므로,
 *      인물 상태 드리프트·떡밥 미회수·설정 모순·전개 반복이 생긴다.
 *
 * 해결: 회차가 생성될 때마다 그 회차를 구조화 요약(메모리)으로 압축하고,
 *      누적 메모리를 '지금까지의 이야기' 블록으로 다음 회차 프롬프트에 주입한다.
 *
 * 이 모듈은 (1) 요약 생성 프롬프트, (2) 응답 파싱, (3) 결정론적 폴백,
 * (4) 누적 메모리 → 롤링 컨텍스트 블록 합성을 제공한다. LLM 호출은 server.js가 한다.
 */

const { buildInputBlock } = require("./agents");

/** 한 회차 원고 → 구조화 요약(JSON)을 만드는 프롬프트. */
function buildSynopsisPrompt({ input, n, chapterText, total = 25 }) {
  const system = `너는 연재 웹소설의 '연속성 관리자(Story Bible Keeper)'다.
방금 완성된 한 회차를 읽고, 다음 회차를 쓸 작가가 이전 내용을 잊지 않도록 '핵심만' 구조화해 기록한다.
판단·평가·감상은 쓰지 않는다. 오직 '무슨 일이 일어났고 무엇이 확정됐는가'만 사실 위주로 압축한다.

[출력 형식 — 매우 중요]
- 오직 JSON 객체 하나만 출력한다. 코드펜스·설명·인사말 금지.
- 모든 값은 한국어. 각 배열 항목은 한 줄(간결한 구).
- 키는 정확히 아래와 같다.

{
  "title": "이 회차의 제목(없으면 한 줄 요약)",
  "synopsis": "이 회차에서 일어난 일 2~3문장 요약",
  "events": ["이 회차의 핵심 사건 2~4개"],
  "characters": [{"name": "등장/언급된 주요 인물", "state": "이 회차 끝 시점의 상태·위치·관계·각오 변화"}],
  "threadsOpened": ["이 회차에서 새로 깔린 떡밥·복선·미해결 질문(없으면 빈 배열)"],
  "threadsResolved": ["이 회차에서 회수·해소된 떡밥·복선(없으면 빈 배열)"],
  "canon": ["앞으로 바뀌면 안 되는 확정 사실 — 능력 한계·세계 규칙·설정·관계·사망·소유·비밀 공개 등. 특히 이 회차에서 새로 '확정/명시된 세계관 규칙이나 능력의 한계'는 빠짐없이 적는다. 없으면 빈 배열"]
}`;

  const user = `${buildInputBlock(input)}

[지금 요약할 회차] 총 ${total}화 시즌 중 ${n}화.

## ${n}화 원고
${String(chapterText || "").slice(0, 9000)}

위 ${n}화를 연속성 기록(JSON)으로 압축하라.`;

  return { system, user };
}

/** LLM 응답에서 첫 JSON 객체를 견고하게 추출해 메모리 객체로 정규화한다. */
function parseMemory(text) {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const raw = text.slice(start, end + 1);
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
  const obj = tryParse(raw) || tryParse(raw.replace(/,(\s*[}\]])/g, "$1"));
  if (!obj || typeof obj !== "object") return null;

  const strArr = (v, cap = 8) => Array.isArray(v)
    ? v.map((x) => String(x || "").trim()).filter(Boolean).slice(0, cap)
    : [];
  const chars = Array.isArray(obj.characters)
    ? obj.characters
        .map((c) => ({
          name: String(c?.name || "").trim(),
          state: String(c?.state || "").trim(),
        }))
        .filter((c) => c.name)
        .slice(0, 10)
    : [];

  return {
    title: String(obj.title || "").trim(),
    synopsis: String(obj.synopsis || "").trim(),
    events: strArr(obj.events, 6),
    characters: chars,
    threadsOpened: strArr(obj.threadsOpened, 8),
    threadsResolved: strArr(obj.threadsResolved, 8),
    canon: strArr(obj.canon, 10),
  };
}

/** 키/구독 없을 때(또는 파싱 실패 시)의 결정론적 폴백. 원고 표면에서 뽑아낸다. */
function localMemory(input, n, chapterText) {
  const text = String(chapterText || "").trim();
  const titleMatch = text.match(/^#{1,3}\s*\d+\s*화[.\s]*(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim().slice(0, 40) : `${n}화`;
  // 제목·예고 줄을 걷어내고 본문 첫머리를 요약 대용으로.
  const body = text
    .replace(/^#{1,3}.*$/gm, "")
    .replace(/^>.*$/gm, "")
    .replace(/\n{2,}/g, " ")
    .trim();
  const synopsis = body.slice(0, 160).trim() + (body.length > 160 ? "…" : "");
  const hero = String(input?.protagonist || "주인공").split(/[,，(]/)[0].trim() || "주인공";
  return {
    title,
    synopsis: synopsis || `${n}화 진행.`,
    events: [],
    characters: [{ name: hero, state: `${n}화까지 진행` }],
    threadsOpened: [],
    threadsResolved: [],
    canon: [],
    _local: true,
  };
}

/**
 * 누적 메모리({n: memory}) → 다음 회차 프롬프트에 주입할 '지금까지의 이야기' 블록.
 * 길이를 엄격히 제한한다(프롬프트 폭주 방지). 회수 안 된 떡밥과 최신 인물 상태를 집계한다.
 *
 * @param {Object<number, object>} memories
 * @param {object} [opts]
 * @param {number} [opts.upTo]      이 회차 '미만'까지만 반영(현재 쓰는 화 제외).
 * @param {number} [opts.maxChars]  블록 총 길이 상한.
 * @returns {string} 마크다운 블록(없으면 "").
 */
function composeStorySoFar(memories, opts = {}) {
  const { upTo = Infinity, maxChars = 2800 } = opts;
  if (!memories || typeof memories !== "object") return "";
  const nums = Object.keys(memories)
    .map(Number)
    .filter((k) => !Number.isNaN(k) && k < upTo)
    .sort((a, b) => a - b);
  if (!nums.length) return "";

  // 회차 줄거리: 너무 길면 앞 2화 + 최근 10화만(중간은 생략 표시).
  const lineFor = (k) => {
    const m = memories[k] || {};
    const t = m.title ? ` «${m.title}»` : "";
    return `- ${k}화${t}: ${m.synopsis || "(요약 없음)"}`;
  };
  let storyLines;
  if (nums.length <= 12) {
    storyLines = nums.map(lineFor);
  } else {
    const head = nums.slice(0, 2).map(lineFor);
    const tail = nums.slice(-10).map(lineFor);
    storyLines = [...head, `- …(중략: ${nums[2]}~${nums[nums.length - 11]}화)…`, ...tail];
  }

  // 미회수 떡밥: 깐 것에서 회수된 것(부분 문자열 매칭)을 제거.
  const opened = [];
  const resolved = [];
  nums.forEach((k) => {
    (memories[k].threadsOpened || []).forEach((t) => opened.push(t));
    (memories[k].threadsResolved || []).forEach((t) => resolved.push(t));
  });
  const norm = (s) => String(s).replace(/\s+/g, "").toLowerCase();
  const resolvedNorm = resolved.map(norm);
  const seenOpen = new Set();
  const openThreads = [];
  opened.forEach((t) => {
    const key = norm(t);
    if (!key || seenOpen.has(key)) return;
    seenOpen.add(key);
    const isResolved = resolvedNorm.some((r) => r.includes(key) || key.includes(r));
    if (!isResolved) openThreads.push(t);
  });

  // 인물 현재 상태: 가장 최근 회차의 서술로 덮어쓴다.
  const charState = new Map();
  nums.forEach((k) => {
    (memories[k].characters || []).forEach((c) => {
      if (c.name && c.state) charState.set(c.name, c.state);
    });
  });

  // 확정 설정(canon)은 storySoFar에서 다루지 않는다 — composeCanonLock이 항상
  // 풀웨이트로 주입하므로(후반부 드리프트 방지), 여기서는 줄거리·떡밥·인물만.
  const sections = [
    `# 지금까지의 이야기 (1~${nums[nums.length - 1]}화 연속성 — 아래와 모순되는 전개·설정 금지)`,
    `## 회차 줄거리`,
    storyLines.join("\n"),
  ];
  if (openThreads.length) {
    sections.push(
      `## 아직 회수되지 않은 떡밥·복선 (적절한 시점에 반드시 이어가거나 회수할 것)`,
      openThreads.slice(0, 12).map((t) => `- ${t}`).join("\n"),
    );
  }
  if (charState.size) {
    sections.push(
      `## 인물 현재 상태 (최신 기준 — 이름·관계·상태를 유지)`,
      [...charState.entries()].slice(0, 12).map(([name, st]) => `- ${name}: ${st}`).join("\n"),
    );
  }

  let block = sections.join("\n");
  if (block.length > maxChars) block = `${block.slice(0, maxChars)}\n…(이하 생략)`;
  return block;
}

/**
 * 세계관 캐논 락 (Canon Lock) — 후반부 드리프트 방지.
 *
 * 초반에 고정한 세계관·규칙과, 회차마다 누적된 확정 설정(canon)을 한데 모아
 * '절대 약화되지 않는' 고정 규칙 원장으로 만든다. storySoFar(줄거리 요약)와 달리
 * 길이에 밀려 잘리지 않도록 canon 항목을 우선 보존하고, 매 회차 프롬프트 맨 앞에
 * 풀웨이트로 주입한다. → 1화든 50화든 동일한 강제력.
 *
 * @param {Object<number,object>} memories  누적 회차 메모리(canon 포함)
 * @param {object} input                    작품 입력(세계 규칙·힘 체계·세력·이전사 등)
 * @param {object} [opts] {upTo, maxChars}
 * @returns {string} 마크다운 블록(없으면 "").
 */
function composeCanonLock(memories, input = {}, opts = {}) {
  const { upTo = Infinity, maxChars = 2400 } = opts;
  const norm = (s) => String(s).replace(/\s+/g, "").toLowerCase();

  // (1) 작가가 초반에 고정한 세계관 규칙 — 최우선 불변.
  const fixed = [
    ["세계 규칙(금기·보상·비용)", input.worldRule],
    ["힘·능력 체계(성장 등급)", input.powerSystem],
    ["핵심 세력·진영", input.factions],
    ["세계 이전사·연표", input.worldHistory],
  ].filter(([, v]) => String(v ?? "").trim())
    .map(([k, v]) => `- [${k}] ${String(v).trim()}`);

  // (2) 회차마다 누적된 확정 설정(canon) — 중복 제거.
  const seen = new Set();
  const canon = [];
  if (memories && typeof memories === "object") {
    Object.keys(memories)
      .map(Number)
      .filter((k) => !Number.isNaN(k) && k < upTo)
      .sort((a, b) => a - b)
      .forEach((k) => {
        (memories[k].canon || []).forEach((c) => {
          const key = norm(c);
          if (key && !seen.has(key)) { seen.add(key); canon.push(c); }
        });
      });
  }

  if (!fixed.length && !canon.length) return "";

  const sections = [
    `# 세계관 고정 규칙 (CANON LOCK) — 최우선·절대 준수`,
    `이 규칙들은 1화든 마지막 화든 '동일한 강제력'을 가진다. 회차가 진행됐다는 이유로 절대 느슨해지거나 바뀌지 않는다. 아래와 모순되는 설정·전개·능력·관계는 금지한다.`,
  ];
  if (fixed.length) sections.push(`## 초기 확정 세계관·규칙`, fixed.join("\n"));
  if (canon.length) {
    // canon은 잘리지 않도록 우선 보존(최대 30개).
    sections.push(`## 누적 확정 설정 (각 회차에서 확정된 불변 사실)`, canon.slice(0, 30).map((c) => `- ${c}`).join("\n"));
  }
  let block = sections.join("\n");
  if (block.length > maxChars) block = `${block.slice(0, maxChars)}\n…(이하 생략 — 위 규칙은 모두 유효)`;
  return block;
}

module.exports = { buildSynopsisPrompt, parseMemory, localMemory, composeStorySoFar, composeCanonLock };
