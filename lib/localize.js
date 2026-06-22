"use strict";

/**
 * 글로벌 현지화 (Localization) — 작품을 타깃 언어로 '번역'이 아니라 '문화 적응'.
 *
 * 단순 직역이 아니라 호칭·관용구·문화 레퍼런스·이름·단위·정서 코드를 타깃 시장에 맞게
 * 적응시키고, 제목 현지화 후보와 '왜 이렇게 바꿨는지' 노트, 되돌릴 위험(오역) 메모까지 낸다.
 * 키 없을 때를 위한 결정론 폴백(실제 번역은 키 연결 시)을 제공한다.
 */

const { resolveMedium, mediumLabel } = require("./medium");

const LANGS = {
  en: { label: "영어 (English)", market: "북미·글로벌 영어권", notes: "1인칭/3인칭 시점 자연스럽게, 한국식 호칭(오빠·선배)은 관계로 풀거나 이름 호칭으로, 관용구는 등가 표현으로." },
  ja: { label: "일본어 (日本語)", market: "일본", notes: "경어/반말 위계(敬語·タメ口), 1인칭(俺·僕·私) 캐릭터별 고정, 의성어·의태어 적극 활용, 라노벨 문체 관습 반영." },
  zh: { label: "중국어 간체 (简体)", market: "중화권", notes: "호칭·무협/선협 용어의 한자 등가, 사자성어 활용, 검열 민감 소재(정치·종교) 우회 표현 제안." },
  es: { label: "스페인어 (Español)", market: "라틴·스페인어권", notes: "tú/usted 위계, 성별 일치, 라틴 정서(가족·운명) 코드 반영, 관용구 현지화." },
};
function resolveLang(k) { return LANGS[k] ? k : "en"; }
function langLabel(k) { return (LANGS[resolveLang(k)] || LANGS.en).label; }

function buildLocalizePrompt({ input = {}, medium, target, text = "" }) {
  const m = resolveMedium(medium);
  const lang = resolveLang(target);
  const L = LANGS[lang];
  const system = `너는 ${mediumLabel(m)} IP를 ${L.label}(${L.market})으로 옮기는 베테랑 현지화(로컬라이제이션) 전문가다. 단순 직역이 아니라 '그 시장 독자가 처음부터 그 언어로 쓰인 듯' 느끼게 문화 적응(transcreation)한다.

[타깃 언어 관습] ${L.notes}

[원칙]
- 원작의 정서·톤·캐릭터 보이스는 보존하되, 호칭·관용구·문화 레퍼런스·이름 표기·단위·유머는 타깃 시장에 맞게 적응한다.
- 직역하면 어색하거나 오해를 부르는 부분은 등가 표현으로 바꾸고, 무엇을 왜 바꿨는지 노트로 남긴다.
- 고유명사(인물·지명·기술명)는 음역/의역 중 작품 톤에 맞게 선택하고 표기 규칙을 통일한다.
- 한국어로 설명(노트)하되, 현지화 본문/제목은 ${L.label}로.

[출력 구조 — Markdown]
## 🌐 현지화 제목 후보 (${L.label}) 3개
- (각 후보 + 뉘앙스 한 줄)
## 본문 현지화 (${L.label})
(입력 본문이 있으면 그 본문을, 없으면 로그라인·핵심 장면을 ${L.label}로 transcreation)
## 문화 적응 노트
| 원문 요소 | 현지화 | 이유 |
|---|---|---|
(호칭·관용구·문화코드·이름·단위 등 핵심 5~8행)
## 캐릭터 보이스 유지 체크
- 주요 인물의 말투/위계가 ${L.label}에서 어떻게 유지되는가.
## ⚠ 오역·되돌릴 위험 (back-translation 메모)
- 직역 시 의미가 깨지거나 문화적으로 민감한 지점과 그 처리.`;
  const user = `매체: ${mediumLabel(m)} → 타깃 언어: ${L.label}
작품: ${String(input.ipTitle || "무제").trim()}
로그라인: ${String(input.logline || "").trim() || "(미정)"}
주제: ${String(input.theme || "").trim() || "(미정)"}

${String(text || "").trim() ? `## 현지화할 본문 발췌\n${String(text).slice(0, 9000)}` : "## (본문 미제공 — 로그라인·작품 정보 기준으로 현지화 설계)"}

위 작품을 ${L.label}로 현지화(transcreation)하라.`;
  return { system, user };
}

function localLocalize({ input = {}, medium, target, text = "" }) {
  const m = resolveMedium(medium);
  const lang = resolveLang(target);
  const L = LANGS[lang];
  const title = String(input.ipTitle || "무제").trim();
  const hasText = Boolean(String(text || "").trim());
  return [
    `## 🌐 ${L.label} 현지화 설계 — 로컬 데모`,
    `> 실제 번역/transcreation은 API 키·구독 연결 시 생성됩니다. 아래는 현지화 전략 골격입니다.`,
    ``,
    `- 작품: ${title} · 타깃: ${L.label}(${L.market})`,
    `- 적용할 관습: ${L.notes}`,
    ``,
    `### 현지화 제목 방향`,
    `- 음역안 / 의역안 / 시장 친화안 3종을 ${L.label}로 제시(키 연결 시).`,
    ``,
    `### 문화 적응 체크 항목`,
    `| 요소 | 처리 방향 |`,
    `|---|---|`,
    `| 호칭(오빠·선배 등) | 관계/이름 호칭으로 등가 변환 |`,
    `| 관용구·유머 | 직역 금지, 등가 표현 |`,
    `| 고유명사 | 음역/의역 규칙 통일 |`,
    `| 단위·문화 레퍼런스 | 타깃 시장 기준으로 적응 |`,
    ``,
    hasText ? `> 제공된 본문(${String(text).replace(/\s/g, "").length}자) 기준으로 키 연결 시 본문 transcreation + back-translation 위험 메모가 생성됩니다.` : `> 본문을 함께 주면 본문 단위 현지화까지 생성됩니다.`,
  ].join("\n");
}

module.exports = { LANGS, resolveLang, langLabel, buildLocalizePrompt, localLocalize };
