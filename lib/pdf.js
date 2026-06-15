"use strict";

/**
 * 무의존성 PDF 텍스트 추출기 (Node 내장 zlib만 사용).
 *
 * 콘텐츠 스트림을 찾아 FlateDecode면 inflate한 뒤, 텍스트 표시 연산자의
 * 리터럴 문자열( (...)Tj / [...]TJ )을 모아 본문을 복원한다.
 * 텍스트 레이어가 있는 일반 PDF(영문 논문 등)에서 잘 동작한다.
 * 스캔(이미지) PDF나 특수 CID 폰트는 추출이 제한적이며, 그 경우 호출부가
 * 추출 글자 수로 판단해 사용자에게 안내한다.
 */

const zlib = require("zlib");

function decodePdfLiteral(s) {
  return s.replace(/\\(\d{1,3}|n|r|t|b|f|\(|\)|\\)/g, (m, g) => {
    if (/^\d{1,3}$/.test(g)) return String.fromCharCode(parseInt(g, 8) & 0xff);
    return { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" }[g] ?? g;
  });
}

// 콘텐츠 스트림 안의 (...) 리터럴 문자열을 모은다. TJ 배열의 큰 음수(글자 간격)는 공백으로 본다.
function extractStringsFromContent(content) {
  let out = "";
  const tokenRe = /\(((?:\\.|[^\\()])*)\)|(-?\d+(?:\.\d+)?)/g;
  let m;
  while ((m = tokenRe.exec(content)) !== null) {
    if (m[1] !== undefined) {
      out += decodePdfLiteral(m[1]);
    } else if (m[2] !== undefined && Number(m[2]) <= -120) {
      out += " ";
    }
  }
  return out;
}

function extractTextFromPdf(buf) {
  const latin = buf.toString("latin1");
  const re = /stream\r?\n/g;
  const parts = [];
  let m;
  while ((m = re.exec(latin)) !== null) {
    const start = m.index + m[0].length;
    const end = latin.indexOf("endstream", start);
    if (end === -1) break;
    const raw = buf.slice(start, end);
    let content = null;
    try {
      content = zlib.inflateSync(raw).toString("latin1");
    } catch {
      try { content = zlib.inflateRawSync(raw).toString("latin1"); } catch { content = null; }
    }
    if (content === null) {
      const s = raw.toString("latin1");
      if (/\bT[Jj]\b/.test(s)) content = s;
    }
    if (content && /\bT[Jj]\b/.test(content)) {
      parts.push(extractStringsFromContent(content));
    }
    re.lastIndex = end + 9;
  }
  let text = parts.join("\n");
  // 제어문자 제거(개행/탭 제외) + 공백 정리. \p{Cc} = Unicode control 카테고리.
  text = text
    .replace(/\r\n?/g, "\n")
    .replace(/[^\P{Cc}\n\t]/gu, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}

module.exports = { extractTextFromPdf };
