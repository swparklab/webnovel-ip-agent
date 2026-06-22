"use strict";

/**
 * 매체×아키타입 빠른 시작 템플릿 (Quick-Start Starters).
 *
 * 백지에서 시작하는 사용자가 원클릭으로 '바로 제작 들어가도 될' 수준의 일관된 IP 시드를
 * 받게 한다. 매체별 전문가 저작(매체당 3개 아키타입). 키 없이 즉시 동작(순수 데이터).
 *
 * 데이터: ./starters-data.json
 */

const { resolveMedium } = require("./medium");

let DATA = {};
try { DATA = require("./starters-data.json"); } catch { /* 데이터 없으면 빈 목록 */ }

function starterList(medium) { return DATA[resolveMedium(medium)] || []; }
function starter(medium, key) { return starterList(medium).find((s) => s.key === key) || null; }
/** 카드 렌더용 경량 메타(본문 필드 제외하지 않고 전체 반환 — 적용에 바로 씀). */
function starterMeta(medium) {
  return starterList(medium).map((s) => ({
    key: s.key, label: s.label, blurb: s.blurb,
    format: s.format || "", genre: s.genre || "", subgenre: s.subgenre || "",
    directorStyle: s.directorStyle || "", fields: s.fields || {},
  }));
}

module.exports = { starterList, starter, starterMeta };
