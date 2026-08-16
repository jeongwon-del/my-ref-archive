// 관리자 페이지 — ADMIN_EMAILS 에 등록된 계정으로 로그인했을 때만 목록이 보인다.
// 메인 아카이브 화면(app.js)과는 완전히 분리되어 있다.

const MIN_PASSWORD_LENGTH = 8;

const statusEl = document.getElementById('adminStatus');
const summaryEl = document.getElementById('adminSummary');
const searchInput = document.getElementById('userSearch');
const tableWrap = document.querySelector('.table-wrap');
const listEl = document.getElementById('userList');
const backupCard = document.getElementById('backupCard');

const authScreen = document.getElementById('authScreen');
const adminScreen = document.getElementById('adminScreen');
const authForm = document.getElementById('authForm');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authSubmit = document.getElementById('authSubmit');
const authError = document.getElementById('authError');

let users = [];

function setStatus(text, type) {
  statusEl.textContent = text;
  statusEl.className = 'status' + (type ? ' ' + type : '');
}

function formatDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

// 전체 목록이든 검색으로 걸러낸 일부든 여기로 들어온다.
function renderList(list) {
  listEl.innerHTML = '';

  if (list.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.className = 'empty-msg';
    cell.textContent = '일치하는 가입자가 없어요.';
    row.appendChild(cell);
    listEl.appendChild(row);
    return;
  }

  list.forEach(user => {
    const row = document.createElement('tr');

    const emailCell = document.createElement('td');
    emailCell.className = 'col-email';
    emailCell.textContent = user.label || user.email;

    const joinedCell = document.createElement('td');
    joinedCell.className = 'col-joined';
    joinedCell.textContent = formatDate(user.createdAt);

    const countCell = document.createElement('td');
    countCell.className = 'col-count';
    countCell.textContent = `${user.itemCount}개`;

    const manageCell = document.createElement('td');
    manageCell.className = 'col-manage';

    // 카카오 계정은 비밀번호가 없어서 재설정 버튼은 안 달고, 삭제만 지원한다.
    if (user.provider !== 'kakao') {
      const resetBtn = document.createElement('button');
      resetBtn.className = 'reset-btn';
      resetBtn.textContent = '비밀번호 재설정';
      resetBtn.addEventListener('click', () => resetPassword(user.email));
      manageCell.appendChild(resetBtn);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '삭제';
    deleteBtn.addEventListener('click', () => deleteUser(user));
    manageCell.appendChild(deleteBtn);

    row.appendChild(emailCell);
    row.appendChild(joinedCell);
    row.appendChild(countCell);
    row.appendChild(manageCell);
    listEl.appendChild(row);
  });
}

// 검색은 서버에 다시 묻지 않고, 이미 받아둔 users 배열에서 화면에 보이는 이름만 걸러낸다.
function applyFilter() {
  const term = searchInput.value.trim().toLowerCase();
  renderList(
    term
      ? users.filter(user => (user.label || user.email || '').toLowerCase().includes(term))
      : users
  );
}

// users 가 바뀔 때마다(처음 로드, 삭제 후) 요약·표시 여부·표를 한 번에 다시 맞춘다.
function refresh() {
  const totalItems = users.reduce((sum, user) => sum + (user.itemCount || 0), 0);

  summaryEl.textContent = users.length > 0
    ? `가입자 ${users.length}명 · 저장된 레퍼런스 총 ${totalItems}개`
    : '아직 가입한 사람이 없어요.';
  summaryEl.hidden = false;

  searchInput.hidden = users.length === 0;
  tableWrap.hidden = users.length === 0;

  applyFilter();
}

searchInput.addEventListener('input', applyFilter);

// 세션 쿠키가 자동으로 실려가고, 서버가 Content-Disposition 을 붙여주니
// 그냥 주소로 이동하면 브라우저가 알아서 파일로 저장한다.
document.getElementById('backupJsonBtn').addEventListener('click', () => {
  location.href = '/api/admin/export?format=json';
});

document.getElementById('backupCsvBtn').addEventListener('click', () => {
  location.href = '/api/admin/export?format=csv';
});

async function deleteUser(user) {
  const label = user.label || user.email;
  if (!confirm(`${label} 계정을 삭제할까요? 이 사람이 저장한 레퍼런스도 모두 함께 사라지고, 되돌릴 수 없어요.`)) return;

  const query = user.provider === 'kakao'
    ? `kakaoId=${encodeURIComponent(user.kakaoId)}`
    : `email=${encodeURIComponent(user.email)}`;

  try {
    const res = await fetch(`/api/admin/users?${query}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '삭제에 실패했어요.');

    users = users.filter(u => u.id !== user.id);
    refresh();
    setStatus(`${label} 계정을 삭제했어요.`, 'ok');
  } catch (err) {
    console.error(err);
    setStatus(err.message, 'error');
  }
}

async function resetPassword(email) {
  const newPassword = prompt(`${email} 계정의 새 비밀번호를 입력하세요 (${MIN_PASSWORD_LENGTH}자 이상)`);
  if (!newPassword) return;
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    setStatus(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상으로 만들어주세요.`, 'error');
    return;
  }

  try {
    const res = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '변경에 실패했어요.');

    setStatus(`${email} 비밀번호를 바꿨어요. 이 앱은 메일을 보내지 못하니 새 비밀번호를 직접 알려주세요.`, 'ok');
  } catch (err) {
    console.error(err);
    setStatus(err.message, 'error');
  }
}

// 로그인 안 됐거나(401), 로그인은 했지만 관리자가 아니면(403) 이 화면부터 보여준다.
// 세션 쿠키를 이 페이지랑 메인 아카이브가 같이 쓰다 보니, 카카오 계정처럼 관리자가 아닌
// 계정으로 로그인돼 있는 채로 여기 들어올 수도 있어서 403 도 로그인 화면으로 보낸다.
function showLogin(message) {
  authScreen.hidden = false;
  adminScreen.hidden = true;
  authError.textContent = message || '';
}

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = authEmail.value.trim();
  const password = authPassword.value;
  if (!email || !password) return;

  authSubmit.disabled = true;
  authError.textContent = '로그인 중...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '로그인에 실패했어요.');

    authPassword.value = '';
    authError.textContent = '';
    await init();
  } catch (err) {
    console.error(err);
    authError.textContent = err.message;
  } finally {
    authSubmit.disabled = false;
  }
});

async function init() {
  setStatus('불러오는 중...', '');

  let res;
  try {
    res = await fetch('/api/admin/users');
  } catch (err) {
    console.error(err);
    setStatus('서버에 연결하지 못했어요. 잠시 후 새로고침해주세요.', 'error');
    return;
  }

  if (res.status === 401) {
    showLogin('');
    return;
  }
  if (res.status === 403) {
    showLogin('이 계정은 관리자가 아니에요. 관리자 이메일로 로그인해주세요.');
    return;
  }

  const data = await res.json();
  if (!res.ok) {
    setStatus(data.error || '목록을 불러오지 못했어요.', 'error');
    return;
  }

  authScreen.hidden = true;
  adminScreen.hidden = false;
  users = data.users || [];
  backupCard.hidden = false;
  refresh();
  // 가입자 수는 위 요약 줄이 계속 보여주니, 상태 줄은 비워두고 안내·오류 전용으로 남긴다.
  setStatus('', '');
}

init();
