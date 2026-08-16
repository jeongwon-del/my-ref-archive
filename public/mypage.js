// 마이페이지 — 로그인한 본인이 저장 현황을 보고, 데이터를 내보내고,
// 비밀번호를 바꾸거나 탈퇴하는 화면.
// 관리자 페이지(admin.js)처럼 메인 아카이브 화면(app.js)과는 분리되어 있다.

const MIN_PASSWORD_LENGTH = 8;

const statusEl = document.getElementById('mypageStatus');
const loginNotice = document.getElementById('loginNotice');
const statsCard = document.getElementById('statsCard');
const statsSummary = document.getElementById('statsSummary');
const categoryStats = document.getElementById('categoryStats');
const exportCard = document.getElementById('exportCard');
const dangerCard = document.getElementById('dangerCard');
const accountCard = document.getElementById('accountCard');
const accountEmail = document.getElementById('accountEmail');
const passwordSection = document.getElementById('passwordSection');
const passwordForm = document.getElementById('passwordForm');
const currentPassword = document.getElementById('currentPassword');
const newPassword = document.getElementById('newPassword');
const newPasswordConfirm = document.getElementById('newPasswordConfirm');
const submitBtn = document.getElementById('submitBtn');

// 'email' 또는 'kakao' — 비밀번호가 있는 계정인지에 따라 화면과 탈퇴 절차가 달라진다.
let accountProvider = 'email';

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

// 카테고리 목록은 사람마다 다르니 실제 저장된 값에서 뽑아 개수를 센다.
function renderStats(items) {
  const favoriteCount = items.filter(item => item.favorite).length;
  statsSummary.textContent = `총 ${items.length}개 저장 · 즐겨찾기 ${favoriteCount}개`;

  const counts = new Map();
  items.forEach(item => {
    const category = item.category || '분류 없음';
    counts.set(category, (counts.get(category) || 0) + 1);
  });

  categoryStats.innerHTML = '';

  if (counts.size === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint-text';
    empty.textContent = '아직 저장한 레퍼런스가 없어요.';
    categoryStats.appendChild(empty);
    return;
  }

  [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([category, count]) => {
      const row = document.createElement('div');
      row.className = 'stat-row';

      const name = document.createElement('span');
      name.textContent = category;

      const value = document.createElement('span');
      value.className = 'stat-count';
      value.textContent = `${count}개`;

      row.appendChild(name);
      row.appendChild(value);
      categoryStats.appendChild(row);
    });
}

// 세션 쿠키가 자동으로 실려가고, 서버가 Content-Disposition 을 붙여주니
// 그냥 주소로 이동하면 브라우저가 알아서 파일로 저장한다.
document.getElementById('exportJsonBtn').addEventListener('click', () => {
  location.href = '/api/export?format=json';
});

document.getElementById('exportCsvBtn').addEventListener('click', () => {
  location.href = '/api/export?format=csv';
});

document.getElementById('deleteAccountBtn').addEventListener('click', async () => {
  if (!confirm('정말 탈퇴할까요? 계정과 저장한 레퍼런스가 모두 영구히 삭제되고, 되돌릴 수 없어요.')) return;

  // 카카오 계정은 확인할 비밀번호가 없어서 위 확인창까지가 전부다.
  let body = {};
  if (accountProvider !== 'kakao') {
    const password = prompt('확인을 위해 현재 비밀번호를 입력하세요.');
    if (!password) return;
    body = { password };
  }

  setStatus('탈퇴 처리 중...', '');

  try {
    const res = await fetch('/api/auth/delete-account', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '탈퇴에 실패했어요.');

    location.href = '/';
  } catch (err) {
    console.error(err);
    setStatus(err.message, 'error');
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

  accountProvider = data.provider || 'email';
  accountEmail.textContent = data.label || data.email;
  if (accountProvider === 'kakao') passwordSection.hidden = true;
  accountCard.hidden = false;
  exportCard.hidden = false;
  dangerCard.hidden = false;

  // 통계는 있으면 좋은 정보라서, 못 불러와도 나머지 화면은 그대로 쓸 수 있게 둔다.
  try {
    const itemsRes = await fetch('/api/items');
    const itemsData = await itemsRes.json();
    if (!itemsRes.ok) throw new Error(itemsData.error || '목록을 불러오지 못했어요.');

    renderStats(itemsData.items || []);
    statsCard.hidden = false;
  } catch (err) {
    console.error(err);
    setStatus('저장 현황을 불러오지 못했어요.', 'error');
  }
}

init();
