let categories = ['카피/문구', '비주얼/디자인', '브랜드 무드', '마케팅 아이디어', '기타'];
const CONTENT_TYPES = ['영상', '이미지', '글'];

let items = [];
let activeFilter = '전체';
let searchTerm = '';
let sortOrder = '최신순';
let aiSearchIds = null; // null이면 일반 키워드 필터, 배열이면 AI 검색 결과(관련도 순)
const expandedIds = new Set();

function sortItems(list) {
  const sorted = [...list];
  switch (sortOrder) {
    case '오래된순':
      return sorted.sort((a, b) => a.createdAt - b.createdAt);
    case '즐겨찾기 우선':
      return sorted.sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return b.createdAt - a.createdAt;
      });
    case '제목순':
      return sorted.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
    default:
      return sorted.sort((a, b) => b.createdAt - a.createdAt);
  }
}

async function loadItems() {
  const res = await fetch('/api/items');
  const data = await res.json();
  items = data.items || [];
}

// ---------- settings (archive name + categories) ----------
const archiveNameInput = document.getElementById('archiveNameInput');

function applyArchiveName(name) {
  archiveNameInput.value = name || '';
  document.title = name || 'My ref archive';
}

async function loadSettings() {
  const res = await fetch('/api/settings');
  const data = await res.json();
  applyArchiveName(data.name);
  if (Array.isArray(data.categories) && data.categories.length > 0) {
    categories = data.categories;
  }
}

async function saveCategories() {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ categories }),
  });
  const data = await res.json();
  categories = data.categories;
}

archiveNameInput.addEventListener('change', async () => {
  const name = archiveNameInput.value.trim();
  await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  applyArchiveName(name);
});

archiveNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') archiveNameInput.blur();
});

function formatDate(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

// ---------- filter tabs (+ 카테고리 추가/삭제) ----------
function renderTabs() {
  const tabsEl = document.getElementById('filterTabs');
  tabsEl.innerHTML = '';

  ['전체', '즐겨찾기'].forEach(name => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (name === '즐겨찾기' ? ' fav' : '') + (activeFilter === name ? ' active' : '');
    btn.textContent = name;
    btn.addEventListener('click', () => {
      activeFilter = name;
      renderTabs();
      renderList();
    });
    tabsEl.appendChild(btn);
  });

  categories.forEach(name => {
    const btn = document.createElement('button');
    btn.className = 'tab category-tab' + (activeFilter === name ? ' active' : '');
    btn.addEventListener('click', () => {
      activeFilter = name;
      renderTabs();
      renderList();
    });

    const label = document.createElement('span');
    label.textContent = name;
    btn.appendChild(label);

    const removeBtn = document.createElement('span');
    removeBtn.className = 'tab-remove';
    removeBtn.textContent = '×';
    removeBtn.title = '카테고리 삭제';
    removeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (categories.length <= 1) {
        alert('카테고리는 최소 1개 이상 있어야 해요.');
        return;
      }
      if (!confirm(`"${name}" 카테고리를 삭제할까요? 이미 이 카테고리로 저장된 레퍼런스는 남아있지만, 이 탭으로는 더 이상 필터링할 수 없어요.`)) return;
      categories = categories.filter(c => c !== name);
      await saveCategories();
      if (activeFilter === name) activeFilter = '전체';
      renderTabs();
      renderList();
    });
    btn.appendChild(removeBtn);

    tabsEl.appendChild(btn);
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'tab tab-add';
  addBtn.textContent = '+ 카테고리';
  addBtn.title = '카테고리 추가';
  addBtn.addEventListener('click', async () => {
    const name = prompt('추가할 카테고리 이름을 입력하세요 (예: 코드 스니펫)');
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    if (categories.includes(trimmed)) {
      alert('이미 있는 카테고리예요.');
      return;
    }
    if (categories.length >= 12) {
      alert('카테고리는 최대 12개까지 만들 수 있어요.');
      return;
    }
    categories = [...categories, trimmed];
    await saveCategories();
    renderTabs();
  });
  tabsEl.appendChild(addBtn);
}

const searchInput = document.getElementById('searchInput');
const searchStatus = document.getElementById('searchStatus');

searchInput.addEventListener('input', (e) => {
  searchTerm = e.target.value.trim().toLowerCase();
  aiSearchIds = null;
  searchStatus.textContent = '';
  renderList();
});

searchInput.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  const query = searchInput.value.trim();
  if (!query) return;

  searchStatus.textContent = 'AI가 관련 레퍼런스를 찾는 중...';
  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '검색에 실패했어요.');

    aiSearchIds = data.ids;
    searchStatus.textContent = aiSearchIds.length > 0
      ? `${aiSearchIds.length}개를 찾았어요.`
      : '관련된 레퍼런스를 찾지 못했어요.';
    renderList();
  } catch (err) {
    console.error(err);
    searchStatus.textContent = '검색 중 오류가 발생했어요: ' + err.message;
  }
});

document.getElementById('sortSelect').addEventListener('change', (e) => {
  sortOrder = e.target.value;
  renderList();
});

// ---------- list rendering ----------
function renderList() {
  const listEl = document.getElementById('list');
  const emptyMsg = document.getElementById('emptyMsg');
  const tableWrap = document.querySelector('.table-wrap');

  tableWrap.hidden = items.length === 0;
  emptyMsg.hidden = items.length > 0;

  if (items.length === 0) {
    listEl.innerHTML = '';
    return;
  }

  let filtered = sortItems(items);

  if (activeFilter === '즐겨찾기') {
    filtered = filtered.filter(i => i.favorite);
  } else if (activeFilter !== '전체') {
    filtered = filtered.filter(i => i.category === activeFilter);
  }

  if (aiSearchIds !== null) {
    const rank = new Map(aiSearchIds.map((id, idx) => [id, idx]));
    filtered = filtered.filter(i => rank.has(i.id)).sort((a, b) => rank.get(a.id) - rank.get(b.id));
  } else if (searchTerm) {
    filtered = filtered.filter(i =>
      i.title.toLowerCase().includes(searchTerm) ||
      i.summary.toLowerCase().includes(searchTerm)
    );
  }

  listEl.innerHTML = '';

  if (filtered.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.className = 'empty-msg';
    cell.textContent = '조건에 맞는 레퍼런스가 없어요.';
    row.appendChild(cell);
    listEl.appendChild(row);
    return;
  }

  filtered.forEach((item, index) => {
    listEl.appendChild(renderRow(item, index + 1));
    if (expandedIds.has(item.id)) {
      listEl.appendChild(renderDetailRow(item));
    }
  });
}

function renderRow(item, num) {
  const row = document.createElement('tr');
  const isExpanded = expandedIds.has(item.id);

  // 번호
  const numCell = document.createElement('td');
  numCell.className = 'col-num';
  numCell.textContent = String(num).padStart(2, '0');

  // 즐겨찾기
  const starCell = document.createElement('td');
  starCell.className = 'col-star';
  const starBtn = document.createElement('button');
  starBtn.className = 'star-btn' + (item.favorite ? ' active' : '');
  starBtn.title = '즐겨찾기';
  starBtn.addEventListener('click', () => toggleFavorite(item.id));
  starCell.appendChild(starBtn);

  // 날짜
  const dateCell = document.createElement('td');
  dateCell.className = 'col-date';
  dateCell.textContent = formatDate(item.createdAt);

  // 유형 (AI 분류, 직접 수정 가능)
  const typeCell = document.createElement('td');
  typeCell.className = 'col-type';
  const typeSelect = document.createElement('select');
  typeSelect.className = 'type-select';
  CONTENT_TYPES.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    if ((item.type || '글') === t) opt.selected = true;
    typeSelect.appendChild(opt);
  });
  typeSelect.addEventListener('change', () => updateField(item.id, 'type', typeSelect.value));
  typeCell.appendChild(typeSelect);

  // 카테고리 (AI 분류, 직접 수정 가능)
  const categoryCell = document.createElement('td');
  categoryCell.className = 'col-category';
  const categorySelect = document.createElement('select');
  categorySelect.className = 'category-select';
  categories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    if (item.category === c) opt.selected = true;
    categorySelect.appendChild(opt);
  });
  // 카테고리가 삭제된 뒤에도 예전 값을 잃지 않도록, 목록에 없는 값이면 임시로 보여준다.
  if (item.category && !categories.includes(item.category)) {
    const opt = document.createElement('option');
    opt.value = item.category;
    opt.textContent = item.category;
    opt.selected = true;
    categorySelect.appendChild(opt);
  }
  categorySelect.addEventListener('change', () => updateField(item.id, 'category', categorySelect.value));
  categoryCell.appendChild(categorySelect);

  // 제목 (수정 가능, 클릭하면 펼침/접힘)
  const titleCell = document.createElement('td');
  titleCell.className = 'col-title';

  const titleInner = document.createElement('div');
  titleInner.className = 'title-inner';

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'toggle-btn';
  toggleBtn.textContent = isExpanded ? '▾' : '▸';
  toggleBtn.title = isExpanded ? '접기' : '펼치기';
  toggleBtn.addEventListener('click', () => {
    if (expandedIds.has(item.id)) {
      expandedIds.delete(item.id);
    } else {
      expandedIds.add(item.id);
    }
    renderList();
  });

  const titleInput = document.createElement('input');
  titleInput.className = 'title-input';
  titleInput.value = item.title;
  titleInput.addEventListener('change', () => updateField(item.id, 'title', titleInput.value));

  titleInner.appendChild(toggleBtn);
  titleInner.appendChild(titleInput);
  titleCell.appendChild(titleInner);

  // 삭제
  const actionsCell = document.createElement('td');
  actionsCell.className = 'col-actions';
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.textContent = '삭제';
  deleteBtn.addEventListener('click', () => deleteItem(item.id));
  actionsCell.appendChild(deleteBtn);

  row.appendChild(numCell);
  row.appendChild(starCell);
  row.appendChild(dateCell);
  row.appendChild(typeCell);
  row.appendChild(categoryCell);
  row.appendChild(titleCell);
  row.appendChild(actionsCell);

  return row;
}

function renderDetailRow(item) {
  const row = document.createElement('tr');
  row.className = 'detail-row';

  const cell = document.createElement('td');
  cell.colSpan = 7;

  const detailTable = document.createElement('table');
  detailTable.className = 'detail-table';

  // 설명
  const summaryTextarea = document.createElement('textarea');
  summaryTextarea.className = 'summary-textarea';
  summaryTextarea.value = item.summary;
  detailTable.appendChild(detailRow('설명', summaryTextarea));

  // 링크
  const link = document.createElement('a');
  link.href = item.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = item.url;
  detailTable.appendChild(detailRow('링크', link));

  // AI Insight (전문가 관점, AI가 자동 생성 — 읽기 전용)
  const aiInsightBox = document.createElement('p');
  aiInsightBox.className = 'ai-insight-box';
  aiInsightBox.textContent = item.aiInsight || '(아직 생성된 AI 인사이트가 없어요)';
  detailTable.appendChild(detailRow('AI Insight', aiInsightBox));

  // My Insight (직접 작성하는 인사이트)
  const myInsightTextarea = document.createElement('textarea');
  myInsightTextarea.className = 'my-insight-textarea';
  myInsightTextarea.placeholder = '이 레퍼런스에 대한 내 생각을 남겨보세요';
  myInsightTextarea.value = item.myInsight || '';
  detailTable.appendChild(detailRow('My Insight', myInsightTextarea));

  // 저장 버튼
  const saveRow = document.createElement('tr');
  const saveLabelCell = document.createElement('th');
  const saveCell = document.createElement('td');
  const detailSaveBtn = document.createElement('button');
  detailSaveBtn.className = 'detail-save-btn';
  detailSaveBtn.textContent = '저장';
  const detailStatus = document.createElement('span');
  detailStatus.className = 'detail-save-status';
  detailSaveBtn.addEventListener('click', async () => {
    detailSaveBtn.disabled = true;
    detailStatus.textContent = '저장 중...';
    try {
      await updateField(item.id, 'summary', summaryTextarea.value);
      await updateField(item.id, 'myInsight', myInsightTextarea.value);
      detailStatus.textContent = '저장했어요!';
    } catch (err) {
      detailStatus.textContent = '저장 실패: ' + err.message;
    } finally {
      detailSaveBtn.disabled = false;
    }
  });
  saveCell.appendChild(detailSaveBtn);
  saveCell.appendChild(detailStatus);
  saveRow.appendChild(saveLabelCell);
  saveRow.appendChild(saveCell);
  detailTable.appendChild(saveRow);

  cell.appendChild(detailTable);
  row.appendChild(cell);
  return row;
}

function detailRow(label, valueEl) {
  const tr = document.createElement('tr');
  const th = document.createElement('th');
  th.textContent = label;
  const td = document.createElement('td');
  td.appendChild(valueEl);
  tr.appendChild(th);
  tr.appendChild(td);
  return tr;
}

async function updateField(id, field, value) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  item[field] = value;
  await fetch(`/api/items?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ [field]: value }),
  });
}

async function toggleFavorite(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  const favorite = !item.favorite;
  item.favorite = favorite;
  renderList();
  await fetch(`/api/items?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ favorite }),
  });
}

async function deleteItem(id) {
  if (!confirm('이 레퍼런스를 삭제할까요?')) return;
  items = items.filter(i => i.id !== id);
  expandedIds.delete(id);
  renderList();
  await fetch(`/api/items?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ---------- save flow ----------
const urlInput = document.getElementById('urlInput');
const saveBtn = document.getElementById('saveBtn');
const saveStatus = document.getElementById('saveStatus');

saveBtn.addEventListener('click', handleSave);
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSave();
});

function setStatus(text, type) {
  saveStatus.textContent = text;
  saveStatus.className = 'status' + (type ? ' ' + type : '');
}

async function handleSave() {
  const url = urlInput.value.trim();
  if (!url) return;

  try {
    new URL(url);
  } catch {
    setStatus('올바른 URL 형식이 아니에요.', 'error');
    return;
  }

  saveBtn.disabled = true;
  setStatus('링크 내용을 분석하고 AI가 정리하는 중이에요...', '');

  try {
    const res = await fetch('/api/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '저장에 실패했어요.');

    items.push(data.item);
    renderList();
    urlInput.value = '';
    setStatus('저장했어요!', 'ok');
  } catch (err) {
    console.error(err);
    setStatus('저장 중 오류가 발생했어요: ' + err.message, 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

// ---------- init ----------
async function init() {
  try {
    await loadSettings();
  } catch (err) {
    console.error(err);
  }
  renderTabs();
  setStatus('불러오는 중...', '');
  try {
    await loadItems();
    setStatus('', '');
  } catch (err) {
    console.error(err);
    setStatus('목록을 불러오지 못했어요: ' + err.message, 'error');
  }
  renderList();
}

init();
