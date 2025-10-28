// ---- Utilities ----
const uid = () => Math.random().toString(36).slice(2, 9);
const domainFromUrl = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
};
const faviconFor = (url) => {
  const host = domainFromUrl(url);
  return host ? `https://icons.duckduckgo.com/ip3/${host}.ico` : '';
};

// ---- State ----
let state = {
  collections: [],
  activeId: ''
};

const els = {
  sidebar: document.getElementById('sidebar'),
  sidebarToggle: document.getElementById('sidebarToggle'),
  addCollection: document.getElementById('addCollection'),
  collectionsNav: document.getElementById('collectionsNav'),
  renameCollection: document.getElementById('renameCollection'),
  deleteCollection: document.getElementById('deleteCollection'),
  exportCsv: document.getElementById('exportCsv'),
  addWebsite2: document.getElementById('addWebsite2'),
  searchInput: document.getElementById('searchInput'),
  colTitle: document.getElementById('colTitle'),
  countFiltered: document.getElementById('countFiltered'),
  countTotal: document.getElementById('countTotal'),
  grid: document.getElementById('grid'),
  tplColBtn: document.getElementById('collectionBtnTpl'),
  tplCard: document.getElementById('cardTpl'),
};

// ---- Storage helpers ----
async function loadState() {
  const raw = await chrome.storage.local.get(['be_collections', 'be_active_id']);
  if (raw.be_collections) state.collections = raw.be_collections;
  if (raw.be_active_id) state.activeId = raw.be_active_id;
  if (!state.collections.length) {
    state.collections = [{
      id: 'getting-started',
      title: 'Getting Started',
      items: [
        { id: uid(), url: 'https://developer.mozilla.org/en-US/', title: 'MDN Web Docs', note: 'Gold-standard reference for web APIs.' },
        { id: uid(), url: 'https://react.dev', title: 'React Docs', note: 'New React docs with great guides.' },
        { id: uid(), url: 'https://tailwindcss.com/docs', title: 'TailwindCSS Docs', note: 'Utility-first styling reference.' },
      ]
    }];
    state.activeId = 'getting-started';
    await saveState();
  }
  if (!state.collections.find(c => c.id === state.activeId)) state.activeId = state.collections[0]?.id || '';
}
async function saveState() {
  await chrome.storage.local.set({ be_collections: state.collections, be_active_id: state.activeId });
}

// ---- Render ----
function render() {
  // sidebar
  els.collectionsNav.innerHTML = '';
  state.collections.forEach(c => {
    const btn = els.tplColBtn.content.firstElementChild.cloneNode(true);
    btn.querySelector('.title').textContent = c.title;
    btn.querySelector('.count').textContent = c.items.length;
    if (c.id === state.activeId) btn.classList.add('active');
    btn.addEventListener('click', () => { state.activeId = c.id; saveState().then(render); });
    els.collectionsNav.appendChild(btn);
  });

  const active = state.collections.find(c => c.id === state.activeId) || state.collections[0];
  if (!active) { els.colTitle.textContent = 'No collection'; els.grid.innerHTML = ''; return; }
  els.colTitle.textContent = active.title;

  // filter
  const q = (els.searchInput.value || '').toLowerCase();
  const items = active.items.filter(i =>
    i.title.toLowerCase().includes(q) ||
    i.url.toLowerCase().includes(q) ||
    (i.note || '').toLowerCase().includes(q)
  );
  els.countFiltered.textContent = items.length;
  els.countTotal.textContent = active.items.length;

  // grid
  els.grid.innerHTML = '';
  items.forEach(item => {
    const card = els.tplCard.content.firstElementChild.cloneNode(true);
    const fav = card.querySelector('.favicon');
    fav.src = faviconFor(item.url);
    fav.alt = '';
    const a = card.querySelector('.title');
    a.textContent = item.title || domainFromUrl(item.url) || 'Untitled';
    a.href = item.url;
    card.querySelector('.domain').textContent = domainFromUrl(item.url);
    card.querySelector('.note').textContent = item.note || '';

    card.querySelector('.edit').addEventListener('click', () => editWebsite(item.id));
    card.querySelector('.del').addEventListener('click', () => deleteWebsite(item.id));
    els.grid.appendChild(card);
  });
}

// ---- Actions ----
function addCollection() {
  const title = prompt('Collection title?');
  if (!title) return;
  const id = uid();
  state.collections.push({ id, title, items: [] });
  state.activeId = id;
  saveState().then(render);
}
function renameCollection() {
  const active = state.collections.find(c => c.id === state.activeId);
  if (!active) return;
  const title = prompt('Rename collection to:', active.title);
  if (title == null) return;
  active.title = title;
  saveState().then(render);
}
function deleteCollection() {
  const active = state.collections.find(c => c.id === state.activeId);
  if (!active) return;
  if (!confirm('Delete this collection?')) return;
  state.collections = state.collections.filter(c => c.id !== active.id);
  state.activeId = state.collections[0]?.id || '';
  saveState().then(render);
}
function addWebsite() {
  const active = state.collections.find(c => c.id === state.activeId);
  if (!active) { alert('Create a collection first.'); return; }
  const url = prompt('Paste website URL (https://...)');
  if (!url) return;
  const title = prompt('Title (optional):') || domainFromUrl(url) || 'Untitled';
  const note = prompt('Note (optional):') || '';
  active.items.push({ id: uid(), url, title, note });
  saveState().then(render);
}
function editWebsite(itemId) {
  const c = state.collections.find(c => c.id === state.activeId);
  if (!c) return;
  const it = c.items.find(i => i.id === itemId);
  if (!it) return;
  const title = prompt('Edit title:', it.title);
  if (title == null) return;
  const note = prompt('Edit note:', it.note || '');
  if (note == null) return;
  const url = prompt('Edit URL:', it.url);
  if (url == null) return;
  it.title = title; it.note = note; it.url = url;
  saveState().then(render);
}
function deleteWebsite(itemId) {
  const c = state.collections.find(c => c.id === state.activeId);
  if (!c) return;
  c.items = c.items.filter(i => i.id !== itemId);
  saveState().then(render);
}

function exportCsv() {
  // Build rows: collection, title, url, note
  const rows = [["collection", "title", "url", "note"]];
  state.collections.forEach(col => {
    col.items.forEach(it => {
      rows.push([col.title, it.title || "", it.url || "", it.note || ""]);
    });
  });

  // CSV encode
  const esc = (v) => {
    const s = (v ?? "").toString();
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map(r => r.map(esc).join(",")).join("\n");

  // Download
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const d = new Date();
  const ts = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
  a.href = url;
  a.download = `webvault_export_${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


// ---- Events ----
els.addCollection.addEventListener('click', addCollection);
els.renameCollection.addEventListener('click', renameCollection);
els.deleteCollection.addEventListener('click', deleteCollection);
els.exportCsv.addEventListener('click', exportCsv);
els.addWebsite2.addEventListener('click', addWebsite);
els.searchInput.addEventListener('input', render);

// ---- Init ----
loadState().then(render);
