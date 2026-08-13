// 마이페이지 — 로그인한 본인이 자기 비밀번호를 바꾸는 화면.
// 관리자 페이지(admin.js)처럼 메인 아카이브 화면(app.js)과는 분리되어 있다.

const MIN_PASSWORD_LENGTH = 8;

const statusEl = document.getElementById('mypageStatus');
const loginNotice = document.getElementById('loginNotice');
const accountCard = document.getElementById('accountCard');
const accountEmail = document.getElementById('accountEmail');
const passwordForm = document.getElementById('passwordForm');
const currentPassword = document.getElementById('currentPassword');
const newPassword = document.getElementById('newPassword');
const newPasswordConfirm = document.getElementById('newPasswordConfirm');
const submitBtn = document.getElementById('submitBtn');

function setStatus(text, type) {
  statusEl.textContent = text;
  statusEl.className = 'status' + (type ? ' ' + type : '');
}

passwordForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (newPassword.value.length < MIN_PASSWORD_LENGTH) {
    setStatus(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상으로 만들어주세요.`, 'error');
    return;
  }
  if (newPassword.value !== newPasswordConfirm.value) {
    setStatus('새 비밀번호와 확인이 서로 달라요.', 'error');
    return;
  }

  submitBtn.disabled = true;
  setStatus('변경 중...', '');

  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        currentPassword: currentPassword.value,
        newPassword: newPassword.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '변경에 실패했어요.');

    passwordForm.reset();
    setStatus('비밀번호를 변경했어요.', 'ok');
  } catch (err) {
    console.error(err);
    setStatus(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    console.error(err);
  }
  location.href = '/';
});

async function init() {
  let res;
  try {
    res = await fetch('/api/auth/me');
  } catch (err) {
    console.error(err);
    setStatus('서버에 연결하지 못했어요. 잠시 후 새로고침해주세요.', 'error');
    return;
  }

  if (res.status === 401) {
    loginNotice.hidden = false;
    setStatus('로그인이 필요해요.', 'error');
    return;
  }

  const data = await res.json();
  if (!res.ok) {
    setStatus(data.error || '계정 정보를 불러오지 못했어요.', 'error');
    return;
  }

  accountEmail.textContent = data.email;
  accountCard.hidden = false;
}

init();
