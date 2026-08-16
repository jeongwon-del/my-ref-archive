// GET /api/auth/kakao            → 카카오 로그인 화면으로 보낸다 (시작)
// GET /api/auth/kakao?code=...   → 카카오가 되돌려보낸 요청. 로그인 쿠키를 발급하고 홈으로 보낸다 (마무리)
//
// 시작과 마무리가 같은 주소를 쓴다. code 파라미터가 붙어 있느냐로 구분한다 —
// Vercel Hobby 플랜은 배포당 서버리스 함수를 12개까지만 허용해서, 다른 라우트들처럼
// 파일 하나로 모았다.
//
// 이 화면은 브라우저 주소창이 통째로 움직이는 흐름이라, 프론트가 잡아낼 수 있는 fetch 가
// 아니다. 그래서 무슨 일이 있어도 500 을 띄우지 않고 항상 홈으로 되돌려보내며,
// 사연은 ?authError= 에 담아 보낸다.
//
// 필요한 환경변수: KAKAO_CLIENT_ID     (카카오 개발자센터의 REST API 키)
//                 KAKAO_REDIRECT_URI  (카카오 콘솔에 등록한 것과 글자 하나까지 같아야 한다)
//                 KAKAO_CLIENT_SECRET (선택 — 콘솔에서 켰을 때만 필요)
//
// 이메일은 일부러 받지 않는다. 카카오에서 이메일을 받으려면 사업자 심사를 거쳐야 해서,
// 심사 없이 쓸 수 있는 닉네임만으로 사람을 구분한다 (scope 파라미터를 붙이지 않는 이유).

import { randomUUID } from "node:crypto";
import { parseCookie, stringifySetCookie } from "cookie";
import { findOrCreateKakaoUser } from "../../lib/redis.js";
import { createSessionCookie } from "../../lib/auth.js";

const STATE_COOKIE = "kakao_oauth_state";
const STATE_MAX_AGE_SEC = 600; // 10분이면 로그인 한 번 하기에 넉넉하다

const STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
};

function redirectWithError(res, message) {
  return res.redirect(302, "/?authError=" + encodeURIComponent(message));
}

// 시작 단계: 무작위 state 를 쿠키에 심어두고 카카오 로그인 화면으로 보낸다.
// 돌아왔을 때 이 값이 그대로인지 확인해야 남이 대신 띄운 요청을 걸러낼 수 있다.
function startLogin(res) {
  const state = randomUUID();

  res.setHeader(
    "Set-Cookie",
    stringifySetCookie({
      name: STATE_COOKIE,
      value: state,
      maxAge: STATE_MAX_AGE_SEC,
      ...STATE_COOKIE_OPTIONS,
    })
  );

  const params = new URLSearchParams({
    client_id: process.env.KAKAO_CLIENT_ID,
    redirect_uri: process.env.KAKAO_REDIRECT_URI,
    response_type: "code",
    state,
  });

  return res.redirect(302, `https://kauth.kakao.com/oauth/authorize?${params}`);
}

async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.KAKAO_CLIENT_ID,
    redirect_uri: process.env.KAKAO_REDIRECT_URI,
    code,
  });
  if (process.env.KAKAO_CLIENT_SECRET) {
    body.set("client_secret", process.env.KAKAO_CLIENT_SECRET);
  }

  const response = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json();

  if (!response.ok || !data.access_token) {
    console.error("kakao token error:", data);
    return null;
  }
  return data.access_token;
}

async function fetchKakaoProfile(accessToken) {
  const response = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json();

  if (!response.ok || !data.id) {
    console.error("kakao profile error:", data);
    return null;
  }

  return {
    id: String(data.id),
    nickname:
      data.kakao_account?.profile?.nickname || data.properties?.nickname || "카카오 사용자",
  };
}

// 마무리 단계: 받아온 code 를 토큰으로, 토큰을 프로필로 바꿔 로그인 쿠키를 발급한다.
async function finishLogin(req, res) {
  const savedState = parseCookie(req.headers?.cookie || "")[STATE_COOKIE];
  if (!savedState || savedState !== req.query.state) {
    return redirectWithError(res, "로그인 요청이 만료됐어요. 다시 시도해주세요.");
  }

  const accessToken = await exchangeCodeForToken(req.query.code);
  if (!accessToken) {
    return redirectWithError(res, "카카오 로그인에 실패했어요. 잠시 후 다시 시도해주세요.");
  }

  const profile = await fetchKakaoProfile(accessToken);
  if (!profile) {
    return redirectWithError(res, "카카오 계정 정보를 가져오지 못했어요. 다시 시도해주세요.");
  }

  const user = await findOrCreateKakaoUser(profile.id, profile.nickname);

  res.setHeader("Set-Cookie", [
    createSessionCookie(user.id),
    // 한 번 쓴 state 는 바로 버린다.
    stringifySetCookie({
      name: STATE_COOKIE,
      value: "",
      maxAge: 0,
      ...STATE_COOKIE_OPTIONS,
    }),
  ]);

  return res.redirect(302, "/");
}

export default async function handler(req, res) {
  // 카카오 동의 화면에서 "취소" 를 누르면 code 대신 error 가 붙어서 돌아온다.
  if (req.query.error) {
    return redirectWithError(res, "카카오 로그인이 취소됐어요.");
  }

  if (!req.query.code) {
    return startLogin(res);
  }

  try {
    return await finishLogin(req, res);
  } catch (err) {
    console.error("kakao login error:", err);
    return redirectWithError(res, "로그인 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.");
  }
}
