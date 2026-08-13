// CSV 내보내기 공통 규칙 — 내보내기 라우트가 여러 개라서 한곳에 모아둔다.
// (api/export.js = 본인 데이터 / api/admin/export.js = 전체 사용자 백업)
// 여기만 고치면 모든 내보내기에 똑같이 적용된다.

// 서버는 보통 UTC로 도는데, 메인 화면(app.js)의 날짜는 방문자 브라우저(한국 시간)에서 계산된다.
// 여기서도 Asia/Seoul로 고정해야 새벽 0~9시에 저장한 항목이 하루 전 날짜로 밀리지 않는다.
export function formatDateKST(ts) {
  if (!ts) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ts));
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// 요약·제목은 AI 가 외부 웹페이지를 읽고 만든 값이라 믿을 수 없는 입력이다.
// =, +, -, @ 로 시작하는 값은 엑셀이 "수식" 으로 실행해버리므로 앞에 ' 를 붙여 글자로 고정한다.
export function escapeCsvField(value) {
  let text = value === null || value === undefined ? "" : String(value);

  if (/^[=+\-@]/.test(text)) text = "'" + text;

  if (/[",\r\n]/.test(text)) {
    text = '"' + text.replace(/"/g, '""') + '"';
  }
  return text;
}

// header 는 열 이름 배열, rows 는 "값 배열" 의 배열. 값 이스케이프는 여기서 책임진다.
export function buildCsv(header, rows) {
  const lines = [header.join(",")];
  rows.forEach((row) => lines.push(row.map(escapeCsvField).join(",")));

  // 맨 앞의 BOM 이 없으면 윈도우 엑셀이 한글을 깨진 글자로 읽는다.
  return "﻿" + lines.join("\r\n") + "\r\n";
}
