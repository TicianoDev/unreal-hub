/* Moodboard: a free canvas per project with images, notes, colors and links.
   Items are absolutely positioned inside a layer that is panned / zoomed with one CSS transform. */
const TINTS = ['yellow', 'pink', 'blue', 'green', 'plain'];
const ytId = (u) => (String(u).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/) || [])[1] || '';
let BD = null; // the mounted board: { key, el, layer, data, sel, editing, mode, saveT }

function boardItemHtml(it) {
  const st = `left:${it.x}px;top:${it.y}px;width:${it.w}px;height:${it.h}px;z-index:${it.z || 1}`;
  let inner = '';
  if (it.type === 'image') inner = `<img src="${esc(it.url || '')}" alt="" draggable="false" decoding="async"/>`;
  else if (it.type === 'note') inner = `<div class="bnote" spellcheck="false">${esc(it.text || '')}</div>`;
  else if (it.type === 'color') inner = `<div class="bswatch" style="background:${esc(it.color)}"></div><div class="bcap">${esc(String(it.color).toUpperCase())}</div>`;
  else if (it.type === 'link') {
    const yt = ytId(it.url);
    let host = ''; try { host = new URL(it.url).hostname.replace(/^www\./, ''); } catch {}
    inner = yt
      ? `<div class="blthumb"><img src="https://i.ytimg.com/vi/${yt}/hqdefault.jpg" alt="" draggable="false"/><span class="blplay">${icon('play', 18)}</span></div><div class="bcap">${icon('external', 12)} ${esc(it.title || host)}</div>`
      : `<div class="blcard">${icon('globe', 26)}<b>${esc(it.title || host || it.url)}</b><small>${esc(it.url)}</small></div>`;
  }
  const tools = `<span class="btools2">${it.type !== 'link' ? `<button data-bact="pin" title="${t('ov.pinD')}">${icon('pin', 13)}</button>` : ''}${it.type === 'note' ? `<button data-bact="tint" title="${t('bd.tint')}">${icon('palette', 13)}</button>` : ''}${it.type === 'link' || it.type === 'image' ? `<button data-bact="open" title="${t('bd.open')}">${icon('external', 13)}</button>` : ''}<button data-bact="del" title="${t('bd.delete')}">${icon('x', 13)}</button></span>`;
  return `<div class="bi bi-${it.type} ${it.tint ? 'tint-' + it.tint : ''} ${BD && BD.sel === it.id ? 'sel' : ''}" data-id="${esc(it.id)}" style="${st}">${inner}${tools}<span class="brs" data-bact="resize"></span></div>`;
}

function boardHtml() {
  return `<div class="board" id="board" tabindex="0">
    <div class="bgrid" id="bgrid"></div>
    <div class="blayer" id="blayer"></div>
    <div class="bempty" id="bempty"><div>${icon('palette', 34)}<b>${t('bd.empty')}</b><span>${t('bd.emptySub')}</span></div></div>
    <div class="bbar">
      <button class="btn sm" data-bt="image" title="${t('bd.addImageD')}">${icon('image', 15)} ${t('bd.image')}</button>
      <button class="btn sm" data-bt="note" title="${t('bd.addNoteD')}">${icon('note', 15)} ${t('bd.note')}</button>
      <label class="btn sm" title="${t('bd.addColorD')}">${icon('palette', 15)} ${t('bd.color')}<input type="color" id="bColor" value="#6a4fd6"/></label>
      <button class="btn sm" data-bt="link" title="${t('bd.addLinkD')}">${icon('shortcut', 15)} ${t('bd.link')}</button>
      <span class="bsep"></span><span id="bOv"></span>
    </div>
    <div class="bzoom"><button class="btn sm icon ghost" data-bt="out" title="${t('bd.zoomOut')}">${icon('minimize', 13)}</button><span id="bZoom">100%</span><button class="btn sm icon ghost" data-bt="in" title="${t('bd.zoomIn')}">${icon('plus', 13)}</button><button class="btn sm icon ghost" data-bt="fit" title="${t('bd.fit')}">${icon('maximize', 13)}</button></div>
    <div class="bhint">${t('bd.hint')}</div>
  </div>`;
}

async function mountBoard(key) {
  const host = $('#boardHost');
  if (!host) return;
  host.innerHTML = boardHtml();
  const el = $('#board', host);
  BD = { key, el, layer: $('#blayer', el), grid: $('#bgrid', el), data: S.board[key] || null, sel: null, editing: null, mode: null };
  if (!BD.data) {
    const r = await api.boardGet(key);
    if (!BD || BD.key !== key) return;
    BD.data = S.board[key] = r.ok ? r.data : { items: [], view: { x: 0, y: 0, z: 1 } };
  }
  boardPaint();
  boardBind();
  const ov = await api.overlayInfo(key);
  if (BD && BD.key === key && ov.ok) boardOverlayBar(ov.data);
}
// Overlay controls on the board bar: show the pinned references over the editor, and auto-show with the editor.
function boardOverlayBar(info) {
  const el = BD && $('#bOv', BD.el); if (!el) return;
  BD.ov = info;
  const hk = info.hotkey ? ' (' + info.hotkey.replace('Super', 'Win').replace('CommandOrControl', 'Ctrl') + ')' : '';
  el.innerHTML = `<button class="btn sm ${info.open ? 'pri' : ''}" data-bt="overlay" title="${t('ov.toggleD')}${hk}">${icon('pin', 15)} ${t(info.open ? 'ov.hide' : 'ov.show')}${info.pins ? ` <span class="count">${info.pins}</span>` : ''}</button>
    <button class="btn sm ${info.auto ? 'on' : ''}" data-bt="ovauto" title="${t('ov.autoD')}"><span class="cb ${info.auto ? 'on' : ''}">${icon('check', 11)}</span> ${t('ov.auto')}</button>`;
  $('[data-bt=overlay]', el).onclick = async () => { if (!info.pins) return toast(t('ov.noPins'), t('ov.noPinsD')); const r = await api.overlayToggle(BD.key); if (r.ok) boardOverlayBar(r.data); };
  $('[data-bt=ovauto]', el).onclick = async () => { const r = await api.overlaySetAuto(BD.key, !info.auto); if (r.ok) boardOverlayBar(r.data); };
}
function boardPaint() {
  if (!BD) return;
  BD.layer.innerHTML = BD.data.items.map(boardItemHtml).join('');
  $('#bempty', BD.el).style.display = BD.data.items.length ? 'none' : '';
  boardView();
}
function boardView() {
  const v = BD.data.view;
  BD.layer.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
  BD.grid.style.backgroundSize = `${28 * v.z}px ${28 * v.z}px`;
  BD.grid.style.backgroundPosition = `${v.x}px ${v.y}px`;
  const z = $('#bZoom', BD.el); if (z) z.textContent = Math.round(v.z * 100) + '%';
}
function boardSave() {
  clearTimeout(BD.saveT);
  const key = BD.key, data = BD.data;
  BD.saveT = setTimeout(() => api.boardSave(key, { items: data.items, view: data.view }), 400);
}
const boardItem = (id) => BD.data.items.find((i) => i.id === id);
const topZ = () => BD.data.items.reduce((m, i) => Math.max(m, i.z || 0), 0);
// center of what is on screen, in board coordinates
function boardCenter() {
  const r = BD.el.getBoundingClientRect(), v = BD.data.view;
  return { x: (r.width / 2 - v.x) / v.z, y: (r.height / 2 - v.y) / v.z };
}
function boardAdd(items, at) {
  const c = at || boardCenter();
  // cascade new items so they do not land exactly on top of each other
  let z = topZ(), off = (BD.data.items.length % 8) * 26;
  for (const it of items) {
    if (it.type === 'image' && it.w > 420) { it.h = Math.round((it.h / it.w) * 420); it.w = 420; }
    it.x = Math.round(c.x - it.w / 2 + off); it.y = Math.round(c.y - it.h / 2 + off); it.z = ++z; off += 24;
    BD.data.items.push(it);
  }
  if (items.length) BD.sel = items[items.length - 1].id;
  boardPaint(); boardSave();
}
const newBid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function boardAddNote(text = '', at) { boardAdd([{ id: newBid(), type: 'note', text, tint: 'yellow', w: 240, h: 180 }], at); }
function boardAddLink(url, at) {
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const yt = ytId(url);
  boardAdd([{ id: newBid(), type: 'link', url, title: '', w: yt ? 320 : 280, h: yt ? 214 : 120 }], at);
}
async function boardAddImages(promise) {
  const r = await promise;
  if (!BD) return;
  if (!r.ok) return showError(r.error);
  const list = Array.isArray(r.data) ? r.data : r.data ? [r.data] : [];
  if (list.length) boardAdd(list);
}
function boardFit() {
  const items = BD.data.items, r = BD.el.getBoundingClientRect();
  if (!items.length) { BD.data.view = { x: 0, y: 0, z: 1 }; return boardView(); }
  const x1 = Math.min(...items.map((i) => i.x)), y1 = Math.min(...items.map((i) => i.y));
  const x2 = Math.max(...items.map((i) => i.x + i.w)), y2 = Math.max(...items.map((i) => i.y + i.h));
  const z = Math.max(0.2, Math.min(1.5, Math.min((r.width - 120) / (x2 - x1 || 1), (r.height - 160) / (y2 - y1 || 1))));
  BD.data.view = { z, x: r.width / 2 - ((x1 + x2) / 2) * z, y: r.height / 2 - ((y1 + y2) / 2) * z + 20 };
  boardView(); boardSave();
}
function boardZoom(f, cx, cy) {
  const v = BD.data.view, r = BD.el.getBoundingClientRect();
  if (cx === undefined) { cx = r.width / 2; cy = r.height / 2; }
  const z = Math.max(0.2, Math.min(3, v.z * f));
  v.x = cx - (cx - v.x) * (z / v.z); v.y = cy - (cy - v.y) * (z / v.z); v.z = z;
  boardView(); boardSave();
}
function boardSelect(id) {
  BD.sel = id;
  $$('.bi', BD.layer).forEach((n) => n.classList.toggle('sel', n.dataset.id === id));
}
function boardStopEditing() {
  if (!BD.editing) return;
  const n = $(`.bi[data-id="${CSS.escape(BD.editing)}"] .bnote`, BD.layer), it = boardItem(BD.editing);
  if (n && it) { it.text = n.innerText.replace(/\n$/, ''); n.contentEditable = 'false'; }
  BD.editing = null; boardSave();
}
function boardDelete(id) {
  BD.data.items = BD.data.items.filter((i) => i.id !== id);
  if (BD.sel === id) BD.sel = null;
  boardPaint(); boardSave();
}
function boardOpen(it) {
  if (it.type === 'link') call('openExternal', it.url);
  else if (it.type === 'image' && it.file) call('openPath', it.file);
}

function boardBind() {
  const el = BD.el;
  // toolbar
  $$('.bbar > [data-bt], .bzoom [data-bt]', el).forEach((b) => (b.onclick = () => {
    const a = b.dataset.bt;
    if (a === 'image') boardAddImages(api.boardPick(BD.key));
    else if (a === 'note') { boardAddNote(); boardEdit(BD.sel); }
    else if (a === 'link') boardLinkModal();
    else if (a === 'in') boardZoom(1.2);
    else if (a === 'out') boardZoom(1 / 1.2);
    else if (a === 'fit') boardFit();
  }));
  $('#bColor', el).onchange = (e) => boardAdd([{ id: newBid(), type: 'color', color: e.target.value, w: 150, h: 170 }]);

  // pointer: move / resize items, pan the background
  el.onpointerdown = (e) => {
    if (e.button !== 0 || e.target.closest('.bbar, .bzoom')) return;
    const node = e.target.closest('.bi');
    const act = e.target.closest('[data-bact]');
    if (node && BD.editing === node.dataset.id && !act) return; // typing in a note
    boardStopEditing();
    if (!node) { boardSelect(null); BD.mode = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: BD.data.view.x, vy: BD.data.view.y }; el.setPointerCapture(e.pointerId); el.classList.add('panning'); return; }
    const it = boardItem(node.dataset.id); if (!it) return;
    if (act && act.dataset.bact === 'del') { boardDelete(it.id); return; }
    if (act && act.dataset.bact === 'open') { boardOpen(it); return; }
    if (act && act.dataset.bact === 'pin') { boardStopEditing(); api.overlayPin(BD.key, it).then((r) => { if (!r.ok) return showError(r.error); if (BD) boardOverlayBar(r.data); toast(t('ov.pinned'), t('ov.pinnedD', { k: (r.data.hotkey || '').replace('Super', 'Win').replace('CommandOrControl', 'Ctrl') }), 'ok'); }); return; }
    if (act && act.dataset.bact === 'tint') { it.tint = TINTS[(TINTS.indexOf(it.tint) + 1) % TINTS.length]; boardPaint(); boardSave(); return; }
    if ((it.z || 0) < topZ()) { it.z = topZ() + 1; node.style.zIndex = it.z; }
    boardSelect(it.id);
    BD.mode = { kind: act && act.dataset.bact === 'resize' ? 'resize' : 'move', it, node, sx: e.clientX, sy: e.clientY, x: it.x, y: it.y, w: it.w, h: it.h, moved: false };
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  el.onpointermove = (e) => {
    const m = BD.mode; if (!m) return;
    const z = BD.data.view.z, dx = e.clientX - m.sx, dy = e.clientY - m.sy;
    if (m.kind === 'pan') { BD.data.view.x = m.vx + dx; BD.data.view.y = m.vy + dy; boardView(); return; }
    if (Math.abs(dx) + Math.abs(dy) > 2) m.moved = true;
    if (m.kind === 'move') { m.it.x = Math.round(m.x + dx / z); m.it.y = Math.round(m.y + dy / z); m.node.style.left = m.it.x + 'px'; m.node.style.top = m.it.y + 'px'; }
    else {
      let w = Math.max(80, m.w + dx / z), h = Math.max(60, m.h + dy / z);
      if (m.it.type === 'image' && !e.shiftKey) h = w * (m.h / m.w); // keep the picture's shape (Shift frees it)
      m.it.w = Math.round(w); m.it.h = Math.round(h);
      m.node.style.width = m.it.w + 'px'; m.node.style.height = m.it.h + 'px';
    }
  };
  el.onpointerup = () => {
    const m = BD.mode; BD.mode = null; el.classList.remove('panning');
    if (m && (m.kind === 'pan' || m.moved || m.kind === 'resize')) boardSave();
  };
  el.ondblclick = (e) => {
    const node = e.target.closest('.bi');
    if (!node) {
      if (e.target.closest('.bbar, .bzoom')) return;
      const r = el.getBoundingClientRect(), v = BD.data.view;
      boardAddNote('', { x: (e.clientX - r.left - v.x) / v.z, y: (e.clientY - r.top - v.y) / v.z });
      return boardEdit(BD.sel);
    }
    const it = boardItem(node.dataset.id);
    if (it && it.type === 'note') boardEdit(it.id); else if (it) boardOpen(it);
  };
  el.onwheel = (e) => {
    e.preventDefault();
    const r = el.getBoundingClientRect();
    boardZoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  };
  el.onkeydown = (e) => {
    if (BD.editing) { if (e.key === 'Escape') { boardStopEditing(); el.focus(); } return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && BD.sel) { e.preventDefault(); boardDelete(BD.sel); }
    else if (e.key === 'Escape') boardSelect(null);
  };
  // drop images or links from the PC / browser
  el.ondragover = (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('drop'); };
  el.ondragleave = () => el.classList.remove('drop');
  el.ondrop = (e) => {
    e.preventDefault(); e.stopPropagation(); el.classList.remove('drop');
    const files = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
    if (files.length) return boardAddImages(api.boardAddFiles(BD.key, files));
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (url && /^https?:\/\//i.test(url.trim())) boardAddLink(url.trim().split(/\s/)[0]);
  };
}
function boardEdit(id) {
  const n = id && $(`.bi[data-id="${CSS.escape(id)}"] .bnote`, BD.layer);
  if (!n) return;
  BD.editing = id;
  n.contentEditable = 'true';
  n.focus();
  const sel = getSelection(); sel.selectAllChildren(n); sel.collapseToEnd();
  n.onblur = () => { if (BD && BD.editing === id) boardStopEditing(); };
}
function boardLinkModal() {
  openModal(`<h3>${icon('shortcut', 18)} ${t('bd.addLink')}</h3><p class="d">${t('bd.addLinkD')}</p><div class="mbody"><input class="inp" id="mUrl" placeholder="https://www.youtube.com/watch?v=…"/></div>
    <div class="mfoot"><button class="btn ghost" id="mNo">${t('btn.cancel')}</button><button class="btn pri" id="mOk">${t('bd.add')}</button></div>`, (m) => {
    const ok = () => { const u = $('#mUrl', m).value.trim(); closeModal(); if (u) boardAddLink(u); };
    $('#mNo', m).onclick = closeModal; $('#mOk', m).onclick = ok;
    $('#mUrl', m).onkeydown = (e) => { if (e.key === 'Enter') ok(); };
  });
}
// Ctrl+V on the board: an image from the clipboard, a link, or text as a note
document.addEventListener('paste', (e) => {
  if (!BD || !document.body.contains(BD.el) || BD.editing || $('#modal').classList.contains('on')) return;
  if (e.target.closest && e.target.closest('input, textarea, [contenteditable="true"]')) return;
  const dt = e.clipboardData;
  if ([...dt.items].some((i) => i.type.startsWith('image/'))) { e.preventDefault(); return boardAddImages(api.boardPaste(BD.key)); }
  const txt = (dt.getData('text/plain') || '').trim();
  if (!txt) return;
  e.preventDefault();
  if (/^https?:\/\/\S+$/i.test(txt)) boardAddLink(txt); else boardAddNote(txt);
});
function unmountBoard() {
  if (BD && BD.data) { boardStopEditing(); if (BD.saveT) { clearTimeout(BD.saveT); api.boardSave(BD.key, { items: BD.data.items, view: BD.data.view }); } }
  BD = null;
}
