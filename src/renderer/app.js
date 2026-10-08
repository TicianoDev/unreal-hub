
const S = {
  engines: [], projects: [], settings: {}, scanFolders: [], history: [], lastScan: 0, hidden: 0, version: '', platform: 'win32',
  view: 'home', back: 'library', selected: null,
  coll: localStorage.getItem('coll') || 'all', day: null, search: '',
  sort: localStorage.getItem('sort') || 'activity',
  closed: JSON.parse(localStorage.getItem('closed') || '{}'),
  cal: new Date(), ptab: 'overview', analysis: {}, details: {}, cleanSel: {},
  tasks: [], activeTask: null, running: [], sessions: [], gallery: {}, scan: { on: false, dir: '', found: 0 }, maximized: false
};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const P = (k) => S.projects.find((p) => p.key === k);
const locale = () => (LANG === 'es' ? 'es-ES' : 'en-US');
const MOD = () => (S.platform === 'darwin' ? '⌘' : 'Ctrl');

const ACCENTS = {
  ink: ['#1b1f3b', '#e9edf6'], blue: ['#2f62d6', '#6b97ff'], violet: ['#6a4fd6', '#a58cff'],
  emerald: ['#13845a', '#3fcf93'], orange: ['#d65f24', '#ff8f57'], rose: ['#cf3767', '#ff6f9a'], slate: ['#475569', '#cbd5e1']
};
const PCOLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'];

async function call(fn, ...args) {
  const r = await api[fn](...args);
  if (!r.ok) { showError(r.error); return undefined; }
  return r.data;
}
function showError(code = '') {
  const m = String(code);
  if (m.startsWith('NO_ENGINE')) return toast(t('t.noEngine'), t('t.noEngineSub', { v: m.split(':')[1] || '?' }), 'bad');
  const map = { NO_SLN: ['t.noSln', 't.noSlnSub'], BP_ONLY: ['t.bpOnly'], BAD_NAME: ['t.badName', 'm.dupHint'], EXISTS: ['t.exists'], NO_EDITOR: ['t.noEditor'] };
  if (map[m]) return toast(t(map[m][0]), map[m][1] ? t(map[m][1]) : '', 'bad');
  toast(t('t.error'), m, 'bad');
}
function fmtSize(b) {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), u.length - 1);
  return (b / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0) + ' ' + u[i];
}
function ago(ms) {
  if (!ms) return t('p.never');
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return t('time.now');
  if (s < 3600) return t('time.min', { n: Math.floor(s / 60) });
  if (s < 86400) return t('time.hour', { n: Math.floor(s / 3600) });
  if (s < 172800) return t('time.yesterday');
  if (s < 86400 * 30) return t('time.days', { n: Math.floor(s / 86400) });
  return new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
}
const fmtDate = (ms) => (ms ? new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const words = (n) => n.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-]+/g, ' ').trim();
function hue(str) { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
const pname = (p) => p.alias || p.name;
function thumb(p, label = true) {
  if (p.thumb) return `<img src="${p.thumb}" alt="" draggable="false" loading="lazy"/>`;
  const h = hue(p.name);
  return `<div class="ph" style="background:linear-gradient(135deg,hsl(${h} 42% 52%),hsl(${(h + 50) % 360} 48% 26%))">${label ? esc(words(pname(p))) : esc(p.name.slice(0, 2).toUpperCase())}<span class="wm">${icon('ue', 110)}</span></div>`;
}
function engineOf(p) {
  if (p.engineKey) { const e = S.engines.find((x) => x.key === p.engineKey); if (e) return e; }
  const a = (p.association || '').toLowerCase();
  if (!a) return S.engines[0] || null;
  return S.engines.find((e) => e.association.toLowerCase() === a) || S.engines.find((e) => (e.version || '').startsWith(a + '.')) || null;
}
const isGuid = (a) => /^\{?[0-9a-f-]{20,}\}?$/i.test(a || '');
function engLabel(p) {
  const e = engineOf(p);
  if (e) return 'UE ' + e.version.split('.').slice(0, 2).join('.');
  if (isGuid(p.association)) return t('p.source');
  return 'UE ' + (p.association || '?');
}
const assocLabel = (a) => (isGuid(a) ? t('p.source') : 'UE ' + (a || '?'));
const isRunning = (p) => S.running.includes(p.key);
function fmtDur(ms) { const m = Math.round((ms || 0) / 60000); if (m < 60) return m + ' min'; const h = Math.floor(m / 60); return h + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : ''); }
const totalLaunches = (p) => S.history.filter((h) => h.key === p.key).length || p.launchCount;

const mql = matchMedia('(prefers-color-scheme: dark)');
function isDark() { const th = S.settings.theme || 'system'; return th === 'dark' || (th === 'system' && mql.matches); }
function applyTheme() {
  const root = document.documentElement, dark = isDark();
  root.dataset.theme = dark ? 'dark' : 'light';
  const a = ACCENTS[S.settings.accent] || ACCENTS.ink;
  root.style.setProperty('--ink', a[dark ? 1 : 0]);
  root.style.setProperty('--ink-t', dark ? '#0f131a' : '#ffffff');
  root.classList.toggle('no-anim', S.settings.animations === false);
  LANG = S.settings.language === 'es' ? 'es' : 'en';
  root.lang = LANG;
}
mql.addEventListener('change', () => { applyTheme(); render(); });

function toast(title, msg = '', kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = `<span class="ti">${icon(kind === 'bad' ? 'alert' : kind === 'ok' ? 'check' : 'play', 16)}</span><div><b>${esc(title)}</b>${msg ? `<small>${esc(msg)}</small>` : ''}</div>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, kind === 'bad' ? 6500 : 3600);
}

function applyData(d) {
  if (!d) return;
  for (const k of ['engines', 'projects', 'settings', 'scanFolders', 'history', 'lastScan', 'platform', 'version', 'hidden', 'sessions', 'running']) if (d[k] !== undefined) S[k] = d[k];
  if (S.view === 'project' && !P(S.selected)) S.view = 'library';
  applyTheme();
  render();
}
function collMatch(p, c) {
  if (c === 'all') return true;
  if (c === 'fav') return p.favorite;
  if (c === 'recent') return p.lastLaunched && Date.now() - p.lastLaunched < 30 * 86400000;
  if (c === 'cpp') return p.isCpp;
  if (c === 'bp') return !p.isCpp;
  if (c === 'git') return !!p.git;
  if (c.startsWith('eng:')) return p.association === c.slice(4);
  if (c.startsWith('tag:')) return p.tags.includes(c.slice(4));
  return true;
}
function filtered() {
  const q = S.search.trim().toLowerCase();
  const dayKeys = S.day ? new Set(S.history.filter((h) => dayKey(new Date(h.t)) === S.day).map((h) => h.key)) : null;
  return S.projects.filter((p) => {
    if (!collMatch(p, S.coll)) return false;
    if (dayKeys && !dayKeys.has(p.key)) return false;
    if (q && ![p.name, p.alias, p.association, p.description, ...p.tags, ...p.plugins, p.dir].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
}
function sorted(l) {
  const act = (p) => Math.max(p.lastLaunched, p.modified);
  const by = {
    activity: (a, b) => act(b) - act(a),
    name: (a, b) => pname(a).localeCompare(pname(b)),
    modified: (a, b) => b.modified - a.modified,
    launches: (a, b) => b.launchCount - a.launchCount,
    engine: (a, b) => (b.association || '').localeCompare(a.association || '', undefined, { numeric: true }),
    size: (a, b) => (b.size || 0) - (a.size || 0),
    created: (a, b) => b.created - a.created
  };
  const out = [...l].sort(by[S.sort] || by.activity);
  if (S.coll === 'recent') out.sort((a, b) => b.lastLaunched - a.lastLaunched);
  return out;
}

function render() { renderRail(); renderTop(); renderView(); }
function setView(v, opts = {}) {
  if (v === 'project') { if (S.view !== 'project') S.back = S.view; } else S.back = v;
  S.view = v;
  if (opts.key) S.selected = opts.key;
  closeMenu();
  render();
}
function renderRail() {
  const running = S.tasks.filter((x) => x.status === 'running').length;
  const cur = S.view === 'project' ? 'library' : S.view;
  $('#rail').innerHTML = `
    <div class="logo">${icon('ue', 26)}</div>
    ${[['home', 'home'], ['library', 'library'], ['engines', 'cpu'], ['tasks', 'terminal']].map(([v, i]) => `<button class="r ${cur === v ? 'on' : ''}" data-act="go" data-v="${v}">${icon(i, 21)}${v === 'tasks' && running ? '<span class="dot spin"></span>' : ''}<span class="tip">${t('nav.' + v)}</span></button>`).join('')}
    <div class="sp"></div>
    <button class="r" data-act="theme">${icon(isDark() ? 'sun' : 'moon', 20)}<span class="tip">${t('k.theme')}</span></button>
    <button class="r" data-act="lang" style="font-weight:700;font-size:12px">${LANG.toUpperCase()}<span class="tip">${t('set.language')}</span></button>
    <button class="r ${cur === 'settings' ? 'on' : ''}" data-act="go" data-v="settings">${icon('settings', 21)}<span class="tip">${t('nav.settings')}</span></button>`;
}
function renderTop() {
  const p = S.view === 'project' ? P(S.selected) : null;
  const crumb = p
    ? `<button class="back" data-act="back">${icon('chevronLeft', 18)}</button><span>${t('nav.' + (S.back || 'library'))}</span>${icon('chevron', 14)}<b>${esc(pname(p))}</b>`
    : `<span>${t('crumb.hub')}</span> <b>${t('nav.' + S.view)}</b><span class="ic">${icon('ue', 16)}</span>`;
  const sc = S.scan;
  const scanHtml = sc.on
    ? `<div class="scanchip on"><span class="spinner"></span><span class="lbl">${t('scan.running', { d: esc(sc.dir || '…') })}</span><span class="count">${sc.found}</span><button class="x" data-act="cancelScan">${icon('x', 13)}</button></div>`
    : `<div class="scanchip">${icon('check', 14)}<span class="lbl">${S.lastScan ? t('scan.idle', { t: ago(S.lastScan).toLowerCase() }) : t('scan.never')}</span></div>`;
  $('#top').innerHTML = `
    <div class="crumb">${crumb}</div><div class="grow"></div>${scanHtml}
    <div class="search-pill" data-act="palette">${icon('search', 15)}<span>${t('pal.placeholder')}</span><kbd>${MOD()} K</kbd></div>
    <button class="tbtn" data-act="scan" title="${t('btn.scan')}">${icon('refresh', 17)}</button>
    <div class="winctl"><button data-act="win" data-w="min">${icon('minimize', 15)}</button><button data-act="win" data-w="max">${icon(S.maximized ? 'restore' : 'maximize', 13)}</button><button data-act="win" data-w="close" class="x">${icon('x', 15)}</button></div>`;
}
function renderView() {
  const fn = { home: viewHome, library: viewLibrary, project: viewProject, engines: viewEngines, tasks: viewTasks, settings: viewSettings }[S.view];
  $('#view').innerHTML = fn ? fn() : '';
  afterRender();
}

function clockSvg(d) {
  const h = d.getHours() % 12, m = d.getMinutes(), s = d.getSeconds();
  const rad = (a) => (a * Math.PI) / 180;
  let ticks = '';
  for (let i = 0; i < 60; i++) {
    const big = i % 5 === 0, a = rad(i * 6), r1 = big ? 41 : 43.5;
    ticks += `<line x1="${50 + r1 * Math.sin(a)}" y1="${50 - r1 * Math.cos(a)}" x2="${50 + 46 * Math.sin(a)}" y2="${50 - 46 * Math.cos(a)}" stroke="currentColor" stroke-opacity="${big ? .7 : .16}" stroke-width="${big ? 1.4 : .8}" stroke-linecap="round"/>`;
  }
  const hand = (a, len, w, col = 'currentColor') => `<line x1="50" y1="50" x2="${50 + len * Math.sin(rad(a))}" y2="${50 - len * Math.cos(rad(a))}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
  return `<svg width="108" height="108" viewBox="0 0 100 100" style="color:var(--text)">${ticks}${hand((h + m / 60) * 30, 24, 3)}${hand((m + s / 60) * 6, 36, 2.2)}${hand(s * 6, 40, .9, 'var(--info)')}<circle cx="50" cy="50" r="3.2" fill="currentColor"/></svg>`;
}
function clockText(d) {
  const tm = d.toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit', hour12: !S.settings.use24h });
  const dt = d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'long' });
  return { tm, dt: dt.charAt(0).toUpperCase() + dt.slice(1) };
}
function clockCard(extra = '') {
  const d = new Date(), ct = clockText(d);
  return `<div class="card clock" style="${extra}"><div id="clockFace">${clockSvg(d)}</div><div><div class="tm" id="clockTm">${ct.tm}</div><div class="dt" id="clockDt">${ct.dt}</div></div></div>`;
}
function launchesByDay() { const m = {}; for (const h of S.history) { const k = dayKey(new Date(h.t)); m[k] = (m[k] || 0) + 1; } return m; }
function calendar() {
  const y = S.cal.getFullYear(), mo = S.cal.getMonth();
  const first = new Date(y, mo, 1);
  const start = new Date(y, mo, 1 - ((first.getDay() + 6) % 7));
  const counts = launchesByDay(), today = dayKey(new Date());
  const title = first.toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (i >= 35 && d.getMonth() !== mo) break;
    const k = dayKey(d), n = counts[k] || 0;
    cells += `<button class="d ${d.getMonth() !== mo ? 'o' : ''} ${k === today ? 'today' : ''} ${n ? 'has' : ''} ${n > 2 ? 'l2' : ''} ${S.day === k ? 'sel' : ''}" data-act="day" data-d="${k}" title="${n ? t('cal.launches', { n }) : ''}">${d.getDate()}</button>`;
  }
  return `<div class="calhead"><span>${title.charAt(0).toUpperCase() + title.slice(1)}</span><div class="nav"><button data-act="calPrev">${icon('chevronLeft', 16)}</button><button data-act="calNext">${icon('chevron', 16)}</button></div></div>
    <div class="card cal"><div class="g">${t('days.short').split(',').map((w) => `<div class="wd">${w}</div>`).join('')}${cells}</div></div>`;
}
function projectCard(p, i = 0) {
  const e = engineOf(p), k = esc(p.key);
  return `<div class="pc" data-act="open" data-key="${k}" data-dbl="launch" style="animation-delay:${Math.min(i, 16) * 22}ms">
    <div class="th">${thumb(p)}
      <div class="badges"><span class="b">${icon('ue', 12)} ${esc(engLabel(p))}${isRunning(p) ? `<span class="live"></span>` : ''}</span>${p.favorite ? `<span class="b fav">${icon('starFill', 13)}</span>` : ''}</div>
      <div class="ov"><button class="playbtn" data-act="launch" data-key="${k}">${icon('play', 14)} ${t('btn.launch')}</button><button class="ovbtn" data-act="menu" data-key="${k}">${icon('dotsH', 18)}</button></div>
    </div>
    <div class="meta">
      <div class="nm">${p.color ? `<span class="cdot" style="background:${p.color}"></span>` : ''}${esc(pname(p))}</div>
      <div class="sub"><span>${p.isCpp ? 'C++' : 'Blueprint'}</span><span class="sep"></span><span>${ago(p.lastLaunched || p.modified)}</span>${!e ? `<span class="sep"></span><span class="eng miss">${t('p.notInstalled')}</span>` : ''}</div>
    </div></div>`;
}
function projectRow(p, i = 0) {
  const k = esc(p.key);
  return `<div class="row" data-act="open" data-key="${k}" data-dbl="launch" style="animation-delay:${Math.min(i, 16) * 18}ms">
    <span class="grip">${icon('grip', 16)}</span><div class="mini">${thumb(p, false)}</div>
    <div class="nm">${p.favorite ? `<span style="color:#e0a200;display:inline-block;vertical-align:-2px;margin-right:6px">${icon('starFill', 13)}</span>` : ''}${esc(pname(p))}<small>${esc(p.dir)}</small></div>
    <span class="tile-chip">${icon('ue', 13)} ${esc(engLabel(p))}</span>
    <span class="col">${p.isCpp ? 'C++' : 'Blueprint'}</span><span class="col">${ago(p.lastLaunched || p.modified)}</span>
    <div class="acts"><button class="btn sm icon ghost" data-act="folder" data-key="${k}">${icon('folder', 16)}</button><button class="btn sm icon ghost" data-act="menu" data-key="${k}">${icon('dotsH', 16)}</button></div>
    <button class="btn sm pri" data-act="launch" data-key="${k}">${icon('play', 13)} ${t('btn.launch')}</button></div>`;
}
function emptyState() {
  return `<div class="empty"><div><div class="ill">${icon('ue', 40)}</div><b>${t('lib.empty')}</b>${t('lib.emptySub')}
    <div class="acts"><button class="btn" data-act="add">${icon('plus', 16)} ${t('btn.add')}</button><button class="btn pri" data-act="scan">${icon('scan', 16)} ${t('btn.scan')}</button></div></div></div>`;
}

function viewHome() {
  const hr = new Date().getHours();
  const greet = t(hr < 12 ? 'greet.morning' : hr < 19 ? 'greet.afternoon' : 'greet.evening');
  const cpp = S.projects.filter((p) => p.isCpp).length;
  const week = S.history.filter((h) => h.t > Date.now() - 7 * 86400000).length;
  const analyzed = S.projects.filter((p) => p.size);
  const disk = analyzed.reduce((a, p) => a + p.size, 0);
  const weekTime = S.sessions.filter((x) => x.end > Date.now() - 7 * 86400000).reduce((s, x) => s + (x.end - x.start), 0);
  const allTime = S.projects.reduce((s, p) => s + (p.playTime || 0), 0);
  const counts = launchesByDay();
  let streak = 0; for (let d = new Date(); counts[dayKey(d)]; d.setDate(d.getDate() - 1)) streak++;
  const recent = [...S.projects].sort((a, b) => Math.max(b.lastLaunched, b.modified) - Math.max(a.lastLaunched, a.modified)).slice(0, 3);
  const end = new Date(), start = new Date(); start.setDate(end.getDate() - 139); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  let total = 0; const cells = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const n = counts[dayKey(d)] || 0; total += n;
    cells.push(`<i class="${n === 0 ? '' : n === 1 ? 'l1' : n <= 3 ? 'l2' : n <= 6 ? 'l3' : 'l4'}" title="${d.toLocaleDateString(locale())}: ${t('cal.launches', { n })}"></i>`);
  }
  const stat = (ic, v, l, s2) => `<div class="card stat"><div class="si">${icon(ic, 20)}</div><div><div class="v">${v}</div><div class="l">${l}</div>${s2 ? `<div class="s2">${s2}</div>` : ''}</div></div>`;
  return `<div class="home">
    <div class="panel hero"><div><h1>${greet}</h1><p>${t('home.sub')}</p></div>
      <div style="display:flex;gap:8px"><button class="btn" data-act="add">${icon('plus', 16)} ${t('btn.add')}</button><button class="btn pri" data-act="scan">${icon('scan', 16)} ${S.scan.on ? t('btn.scanning') : t('btn.scan')}</button></div></div>
    <div class="stats">
      ${stat('library', S.projects.length, t('stat.projects'), t('stat.cpp', { n: cpp, m: S.projects.length - cpp }))}
      ${stat('cpu', S.engines.length, t('stat.engines'), S.engines[0] ? t('stat.latest', { v: S.engines[0].version }) : t('stat.none'))}
      ${stat('zap', week, t('stat.week'), streak ? t('stat.streak', { n: streak }) : '')}
      ${stat('clock', fmtDur(weekTime), t('stat.time'), t('stat.timeSub', { t: fmtDur(allTime) }))}
      ${stat('drive', disk ? fmtSize(disk) : '—', t('stat.disk'), `${t('stat.diskSub', { n: analyzed.length })} · <a style="color:var(--info);cursor:pointer" data-act="analyzeAll">${t('btn.analyzeAll')}</a>`)}
    </div>
    <div class="hgrid">
      <div style="display:flex;flex-direction:column;gap:14px;min-width:0">
        <div class="panel"><h2>${t('home.jump')}<span style="flex:1"></span><button class="btn sm ghost" data-act="go" data-v="library">${t('home.viewAll')} ${icon('chevron', 14)}</button></h2>
          ${recent.length ? `<div class="jump">${recent.map(projectCard).join('')}</div>` : emptyState()}</div>
        <div class="panel"><h2>${t('home.activity')}<span class="sub">${t('home.activitySub', { n: total })}</span></h2><div class="heat">${cells.join('')}</div></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px;min-width:0">
        <div class="panel">${clockCard('margin-top:0')}${calendar()}</div>
        <div class="panel"><h2>${t('home.enginesTitle')}</h2><div class="elist">${S.engines.slice(0, 4).map((e) => `
          <div class="erow"><div class="grow"><span class="v">UE ${esc(e.version)}</span><small>${t('src.' + e.source)}</small></div><button class="btn sm" data-act="engLaunch" data-k="${esc(e.key)}">${icon('play', 12)}</button></div>`).join('') || `<div style="color:var(--muted);font-size:13px">${t('eng.empty')}</div>`}</div></div>
        <div class="panel"><h2>${t('home.tips')}</h2><div class="tips">
          <div>${icon('keyboard', 15)}<span>${t('tip.1', { k: MOD() + ' K' })}</span></div><div>${icon('upload', 15)}<span>${t('tip.2')}</span></div>
          <div>${icon('dotsH', 15)}<span>${t('tip.3')}</span></div><div>${icon('shortcut', 15)}<span>${t('tip.4')}</span></div><div>${icon('history', 15)}<span>${t('tip.5')}</span></div></div>
          <div class="made">${t('home.made')}</div></div>
      </div></div></div>`;
}

function viewLibrary() {
  const engs = {}, tags = {};
  for (const p of S.projects) { engs[p.association] = (engs[p.association] || 0) + 1; for (const tg of p.tags) tags[tg] = (tags[tg] || 0) + 1; }
  const nitem = (c, ic, label, n) => `<button class="nitem ${S.coll === c ? 'on' : ''}" data-act="coll" data-c="${esc(c)}">${icon(ic, 19)}<span class="lbl">${esc(label)}</span>${n ? `<span class="count">${n}</span>` : ''}<span class="chev">${icon('chevron', 15)}</span></button>`;
  return `
  <aside class="panel side">
    <h2>${t('lib.title')}</h2>
    <div class="nlist">${[['all', 'layers'], ['fav', 'star'], ['recent', 'history'], ['cpp', 'code'], ['bp', 'sparkle'], ['git', 'git']].map(([c, ic]) => nitem(c, ic, t('col.' + c), S.projects.filter((p) => collMatch(p, c)).length)).join('')}</div>
    ${Object.keys(engs).length ? `<div class="sec">${t('lib.byEngine')}</div><div class="nlist">${Object.entries(engs).sort((a, b) => b[0].localeCompare(a[0], undefined, { numeric: true })).map(([a, n]) => nitem('eng:' + a, 'cpu', assocLabel(a), n)).join('')}</div>` : ''}
    <div class="sec">${t('lib.tags')}</div>
    ${Object.keys(tags).length ? `<div class="tagcloud">${Object.entries(tags).map(([tg, n]) => `<span class="chip btnlike ${S.coll === 'tag:' + tg ? 'on' : ''}" data-act="coll" data-c="tag:${esc(tg)}">${icon('tag', 12)} ${esc(tg)} <b style="opacity:.6">${n}</b></span>`).join('')}</div>` : `<div style="color:var(--dim);font-size:13px;padding:0 6px">${t('lib.noTags')}</div>`}
    ${clockCard()}${calendar()}
  </aside>
  <section class="panel main">
    <h2>${t('lib.projects')} <span class="count" id="libCount">0</span><span style="flex:1"></span>
      <button class="btn sm" data-act="newProject">${icon('sparkle', 15)} ${t('btn.newProject')}</button>
      <button class="btn sm" data-act="add">${icon('plus', 15)} ${t('btn.add')}</button>
      <button class="btn sm pri" data-act="scan">${S.scan.on ? '<span class="spinner"></span>' : icon('scan', 15)} ${S.scan.on ? t('btn.scanning') : t('btn.scan')}</button></h2>
    <div class="libbar">
      <label class="field">${icon('search', 18)}<input id="search" placeholder="${t('lib.search')}" value="${esc(S.search)}" spellcheck="false"/><kbd>${MOD()} F</kbd></label>
      <select class="sel" id="sort" style="width:190px;height:46px;border-radius:14px">${['activity', 'name', 'modified', 'created', 'launches', 'engine', 'size'].map((s) => `<option value="${s}" ${S.sort === s ? 'selected' : ''}>${t('sort.' + s)}</option>`).join('')}</select>
      <div class="seg icons"><button class="${S.settings.viewMode !== 'list' ? 'on' : ''}" data-act="mode" data-m="grid">${icon('grid', 16)}</button><button class="${S.settings.viewMode === 'list' ? 'on' : ''}" data-act="mode" data-m="list">${icon('list', 16)}</button></div>
    </div>
    <div class="scroll" id="libContent"></div>
  </section>`;
}
function renderLibContent() {
  const el = $('#libContent'); if (!el) return;
  const list = sorted(filtered());
  $('#libCount').textContent = list.length;
  const chips = [];
  if (S.coll !== 'all') chips.push(`<span class="chip on">${esc(S.coll.startsWith('tag:') ? S.coll.slice(4) : S.coll.startsWith('eng:') ? assocLabel(S.coll.slice(4)) : t('col.' + S.coll))}<span class="x" data-act="coll" data-c="all">${icon('x', 12)}</span></span>`);
  if (S.day) chips.push(`<span class="chip on">${icon('calendar', 12)} ${t('lib.openedOn', { d: new Date(S.day + 'T12:00').toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) })}<span class="x" data-act="day" data-d="${S.day}">${icon('x', 12)}</span></span>`);
  const head = chips.length ? `<div class="filters">${chips.join('')}</div>` : '';
  if (!S.projects.length) { el.innerHTML = emptyState(); return; }
  if (!list.length) { el.innerHTML = head + `<div class="empty"><div><div class="ill">${icon('search', 34)}</div><b>${t('lib.noMatch')}</b><div class="acts"><button class="btn" data-act="clearFilters">${t('lib.clear')}</button></div></div></div>`; return; }
  const grid = S.settings.viewMode !== 'list';
  const pinned = list.filter((p) => p.pinned), rest = list.filter((p) => !p.pinned);
  let i = 0;
  const body = (items) => grid ? `<div class="grid ${S.settings.cardSize || 'm'}">${items.map((p) => projectCard(p, i++)).join('')}</div>` : `<div class="rows">${items.map((p) => projectRow(p, i++)).join('')}</div>`;
  const group = (id, label, items) => !items.length ? '' : `<button class="grp ${S.closed[id] ? 'closed' : ''}" data-act="grp" data-g="${id}"><span class="chev">${icon('chevronDown', 16)}</span>${label} <span class="count">${items.length}</span></button>${S.closed[id] ? '' : body(items)}`;
  el.innerHTML = head + (pinned.length ? group('pinned', t('lib.pinned'), pinned) + group('rest', t('lib.others'), rest) : body(rest));
}

function viewProject() {
  const p = P(S.selected); if (!p) return '';
  const e = engineOf(p), k = esc(p.key);
  const navs = [['folder', 'act.folder', 'folder'], ['ide', 'act.ide', 'code'], ['shortcut', 'act.shortcut', 'shortcut'], ['backup', 'act.backup', 'archive'], ['cleanTab', 'act.clean', 'broom'], ['terminal', 'act.terminal', 'terminal'], ['logs', 'act.logs', 'log']];
  return `
  <aside class="panel side pside">
    <div class="heroimg">${thumb(p)}<button class="btn sm edit" data-act="thumb" data-key="${k}">${icon('image', 14)} ${t('act.thumb')}</button></div>
    <div class="pname">${p.color ? `<span style="width:10px;height:10px;border-radius:4px;background:${p.color}"></span>` : ''}<span style="flex:1">${esc(pname(p))}</span><button class="${p.favorite ? 'on' : ''}" data-act="fav" data-key="${k}">${icon(p.favorite ? 'starFill' : 'star', 20)}</button></div>
    <div class="pchips">
      <span class="chip ${e ? '' : 'bad'}">${icon('ue', 12)} ${esc(engLabel(p))}${e ? '' : ' · ' + t('p.notInstalled')}</span>
      <span class="chip">${p.isCpp ? icon('code', 12) + ' C++' : icon('sparkle', 12) + ' Blueprint'}</span>
      ${p.git ? `<span class="chip info">${icon('git', 12)} ${esc(p.git.branch)}</span>` : ''}
      ${isRunning(p) ? `<span class="chip good"><span class="live" style="margin:0"></span> ${t('p.running')}</span>` : ''}
    </div>
    <div class="launchrow">
      ${isRunning(p) ? `<button class="btn pri" data-act="stop" data-key="${k}" style="background:var(--bad);color:#fff">${icon('x', 15)} ${t('act.stop')}</button>` : `<button class="btn pri" data-act="launch" data-key="${k}">${icon('play', 15)} ${t('act.launch')}</button>`}
      <button class="btn icon" data-act="game" data-key="${k}" title="${t('act.game')}">${icon('gamepad', 19)}</button>
      <button class="btn icon" data-act="menu" data-key="${k}">${icon('dotsH', 19)}</button>
    </div>
    <div class="nlist" style="margin-top:10px">${navs.map(([a, l, ic]) => `<button class="nitem" data-act="${a}" data-key="${k}">${icon(ic, 19)}<span class="lbl">${t(l)}</span><span class="chev" style="opacity:1">${icon('chevron', 15)}</span></button>`).join('')}</div>
    ${clockCard()}
  </aside>
  <section class="panel main">
    <div class="tabs">${[['overview', 'info'], ['gallery', 'image'], ['storage', 'drive'], ['build', 'hammer'], ['notes', 'note']].map(([x, ic]) => `<button class="${S.ptab === x ? 'on' : ''}" data-act="ptab" data-t="${x}">${icon(ic, 15)} ${t('tab.' + x)}</button>`).join('')}</div>
    <div class="scroll" id="ptab">${projectTab(p)}</div>
  </section>`;
}
function projectTab(p) {
  const k = esc(p.key);
  if (S.ptab === 'storage') return tabStorage(p);
  if (S.ptab === 'gallery') {
    const g = S.gallery[p.key];
    if (!g) return `<div class="empty"><div><div class="ill"><span class="spinner" style="width:26px;height:26px;border-width:3px"></span></div></div></div>`;
    if (!g.length) return `<div class="empty"><div><div class="ill">${icon('image', 36)}</div><b>${t('gal.empty')}</b>${t('gal.emptySub')}</div></div>`;
    return `<div class="gal">${g.map((x, i) => `<div class="gi" style="animation-delay:${Math.min(i, 20) * 20}ms"><img src="${x.url}" data-act="galOpen" data-i="${i}"/><div class="gbar"><small>${esc(fmtDate(x.t))}</small><button class="btn sm" data-act="galCover" data-i="${i}">${icon('image', 13)} ${t('gal.cover')}</button></div></div>`).join('')}</div>`;
  }
  if (S.ptab === 'build') {
    const card = (act, ic, l, d, dis) => `<button class="acard" data-act="${act}" data-key="${k}" ${dis ? 'disabled' : ''}><span class="ai">${icon(ic, 20)}</span><span class="grow"><b>${t(l)}</b><small>${dis ? t('b.bpOnly') : d}</small></span>${icon('chevron', 16)}</button>`;
    return `<div class="agrid">
      ${card('generate', 'fileCode', 'act.generate', t('b.generate.d'), !p.isCpp)}${card('build', 'hammer', 'act.build', t('b.build.d'), !p.isCpp)}
      ${card('package', 'box', 'act.package', t('b.package.d'))}${card('backup', 'archive', 'act.backup', t('b.backup.d'))}
      ${card('duplicate', 'duplicate', 'act.duplicate', t('b.duplicate.d'))}${card('switch', 'cpu', 'act.switch', t('m.switchD'))}
      ${card('redirectors', 'refresh', 'act.redirectors', t('b.redirectors.d'))}${card('blueprints', 'sparkle', 'act.blueprints', t('b.blueprints.d'))}
      ${card('shortcut', 'shortcut', 'act.shortcut', t('tip.4'))}${card('shortcutGame', 'gamepad', 'act.shortcutGame', t('act.game'))}
      ${card('terminal', 'terminal', 'act.terminal', t('b.terminal.d'))}${card('logs', 'log', 'act.logs', '')}</div>`;
  }
  if (S.ptab === 'notes') {
    return `<div class="block" style="margin-top:0"><h4>${icon('tag', 14)} ${t('notes.tags')}</h4>
      <div class="tagin">${p.tags.map((tg) => `<span class="tile-chip">${esc(tg)} <span style="cursor:pointer;opacity:.6" data-act="removeTag" data-tag="${esc(tg)}">${icon('x', 12)}</span></span>`).join('')}<input id="tagIn" placeholder="${t('notes.addTag')}"/></div></div>
      <div class="block"><h4>${icon('note', 14)} ${t('notes.notes')} <span class="saved" id="savedFlag">${t('notes.saved')}</span></h4>
      <textarea class="inp" id="notes" placeholder="${t('notes.placeholder')}">${esc(p.notes)}</textarea></div>`;
  }
  const d = S.details[p.key], e = engineOf(p);
  const kv = (ic, l, v) => `<div class="card"><div class="k">${icon(ic, 13)} ${l}</div><div class="v">${v}</div></div>`;
  return `
    <div class="kv">
      ${kv('history', t('p.lastOpened'), ago(p.lastLaunched))}${kv('zap', t('p.launches'), totalLaunches(p))}${kv('edit', t('p.modified'), ago(p.modified))}
      ${kv('calendar', t('p.created'), fmtDate(p.created))}${kv('clock', t('p.time'), fmtDur(p.playTime))}${kv('git', t('p.branch'), p.git ? esc(p.git.branch) : '—')}${kv('code', t('p.type'), p.isCpp ? 'C++' : 'Blueprint')}
      ${kv('drive', t('p.size'), p.size ? fmtSize(p.size) : `<a style="color:var(--info);cursor:pointer" data-act="cleanTab" data-key="${k}">${t('btn.analyze')}</a>`)}
      ${kv('cpu', t('p.engine'), e ? 'UE ' + esc(e.version) : `<span style="color:var(--bad)">${esc(engLabel(p))}</span>`)}
      ${kv('image', t('ov.content'), d ? fmtSize(d.content) : '…')}${kv('layers', t('ov.maps'), d ? d.maps : '…')}${kv('box', t('ov.assets'), d ? d.assets.toLocaleString(locale()) : '…')}
    </div>
    <div class="block"><h4>${icon('folder', 14)} ${t('p.path')}</h4>
      <div class="pathbox"><span title="${esc(p.file)}">${esc(p.file)}</span><button class="btn sm icon ghost" data-act="copyPath" data-key="${k}">${icon('copy', 15)}</button><button class="btn sm icon ghost" data-act="folder" data-key="${k}">${icon('external', 15)}</button></div></div>
    ${p.description ? `<div class="block"><h4>${t('ov.description')}</h4><div style="color:var(--text-2)">${esc(p.description)}</div></div>` : ''}
    <div class="block"><h4>${icon('settings', 14)} ${t('set.title')}</h4>
      <div class="formgrid">
        <div><label>${t('ov.engineChoice')}</label><select class="sel" id="pEngine"><option value="">${t('ov.engineAuto', { v: esc(engLabel({ ...p, engineKey: '' })) })}</option>${S.engines.map((x) => `<option value="${esc(x.key)}" ${p.engineKey === x.key ? 'selected' : ''}>UE ${esc(x.version)} · ${t('src.' + x.source)}</option>`).join('')}</select></div>
        <div><label>${t('ov.args')}</label><input class="inp" id="pArgs" placeholder="${t('ov.argsHint')}" value="${esc(p.args)}"/></div>
        <div><label>${t('ov.alias')}</label><input class="inp" id="pAlias" placeholder="${esc(p.name)}" value="${esc(p.alias)}"/></div>
        <div><label>${t('ov.color')}</label><div class="colors"><button class="none ${!p.color ? 'on' : ''}" data-act="color" data-v="">${icon('x', 12)}</button>${PCOLORS.map((c) => `<button style="background:${c}" class="${p.color === c ? 'on' : ''}" data-act="color" data-v="${c}"></button>`).join('')}</div></div>
      </div></div>
    <div class="block"><h4>${icon('layers', 14)} ${t('ov.plugins')} <span class="count">${p.plugins.length}</span></h4><div class="chips">${p.plugins.map((x) => `<span class="chip">${esc(x)}</span>`).join('') || `<span style="color:var(--dim)">${t('ov.none')}</span>`}</div></div>
    ${d && d.localPlugins.length ? `<div class="block"><h4>${icon('box', 14)} ${t('ov.localPlugins')}</h4><div class="chips">${d.localPlugins.map((x) => `<span class="chip info" title="${esc(x.desc)}">${esc(x.name)}${x.version ? ' · ' + esc(x.version) : ''}</span>`).join('')}</div></div>` : ''}
    ${p.modules.length ? `<div class="block"><h4>${icon('code', 14)} ${t('ov.modules')}</h4><div class="chips">${p.modules.map((m) => `<span class="chip">${esc(m.name)} <span style="opacity:.6">${esc(m.type)}</span></span>`).join('')}</div></div>` : ''}
    <div class="block"><h4>${icon('monitor', 14)} ${t('ov.platforms')}</h4><div class="chips">${(p.targetPlatforms.length ? p.targetPlatforms : [t('ov.all')]).map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div></div>`;
}
function tabStorage(p) {
  const a = S.analysis[p.key], k = esc(p.key);
  if (!a) return `<div class="empty"><div><div class="ill">${icon('drive', 36)}</div><b>${t('act.clean')}</b>${t('st.hint')}<div class="acts"><button class="btn pri" data-act="analyze" data-key="${k}">${icon('scan', 16)} ${t('btn.analyze')}</button></div></div></div>`;
  if (a.loading) return `<div class="empty"><div><div class="ill"><span class="spinner" style="width:26px;height:26px;border-width:3px"></span></div><b>${t('st.analyzing')}</b></div></div>`;
  const sel = S.cleanSel[p.key] || {};
  const reclaim = a.targets.reduce((s, x) => s + x.size, 0);
  const selSize = a.targets.filter((x) => sel[x.id]).reduce((s, x) => s + x.size, 0);
  const pct = (v) => (a.total ? Math.max(0.5, (v / a.total) * 100) : 0);
  return `
    <div class="kv">
      <div class="card"><div class="k">${icon('drive', 13)} ${t('st.total')}</div><div class="v" style="font-size:20px">${fmtSize(a.total)}</div></div>
      <div class="card"><div class="k">${icon('image', 13)} ${t('st.content')}</div><div class="v" style="font-size:20px">${fmtSize(a.content)}</div></div>
      <div class="card"><div class="k">${icon('broom', 13)} ${t('st.reclaim')}</div><div class="v" style="font-size:20px;color:var(--good)">${fmtSize(reclaim)}</div></div>
    </div>
    <div class="storbar"><i style="width:${pct(a.content)}%;background:var(--ink)"></i><i style="width:${pct(reclaim)}%;background:var(--good)"></i></div>
    <div class="block"><div class="tlist" style="gap:8px">${a.targets.map((x) => `
      <div class="citem" data-act="cbx" data-id="${x.id}"><span class="cb ${sel[x.id] ? 'on' : ''}">${icon('check', 13)}</span><span class="grow"><b>${t('clean.' + x.id)}</b><small>${t('clean.' + x.id + '.d')}</small></span><span class="sz">${fmtSize(x.size)}</span></div>`).join('')}</div></div>
    <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
      <button class="btn ghost" data-act="analyze" data-key="${k}">${icon('refresh', 15)} ${t('btn.analyze')}</button>
      <button class="btn pri" data-act="clean" data-key="${k}" ${selSize ? '' : 'disabled'}>${icon('broom', 15)} ${t('btn.clean')} · ${fmtSize(selSize)}</button>
    </div>`;
}

function viewEngines() {
  const used = (e) => S.projects.filter((p) => engineOf(p) === e).length;
  return `<section class="panel main">
    <h2>${t('eng.title')} <span class="sub">${t('eng.sub', { n: S.engines.length })}</span><span style="flex:1"></span>
      <button class="btn sm" data-act="epic">${icon('external', 15)} ${t('eng.epic')}</button>
      <button class="btn sm pri" data-act="engAdd">${icon('folderPlus', 15)} ${t('eng.add')}</button></h2>
    <div class="scroll">${S.engines.length ? `<div class="egrid">${S.engines.map((e, i) => `
      <div class="card ecard" style="animation-delay:${i * 40}ms">
        <div class="top2"><div class="badge">${icon('ue', 30)}</div><div style="flex:1;min-width:0"><div class="ver">Unreal Engine ${esc(e.version)}</div><span class="chip ${e.source === 'source' ? 'warn' : e.source === 'manual' ? 'info' : 'good'}">${t('src.' + e.source)}</span></div></div>
        <div class="pathbox"><span title="${esc(e.root)}">${esc(e.root)}</span></div>
        <div class="stats2"><span>${t('eng.used', { n: `<b>${used(e)}</b>` })}</span><span><b>${e.size ? fmtSize(e.size) : '—'}</b></span></div>
        <div class="acts">
          <button class="btn sm pri" data-act="engLaunch" data-k="${esc(e.key)}">${icon('play', 13)} ${t('eng.open')}</button>
          <button class="btn sm" data-act="engFolder" data-k="${esc(e.key)}" data-root="${esc(e.root)}">${icon('folder', 15)}</button>
          <button class="btn sm" data-act="engSize" data-k="${esc(e.key)}">${icon('drive', 15)} ${t('eng.size')}</button>
          ${e.source === 'manual' ? `<button class="btn sm danger" data-act="engRemove" data-k="${esc(e.key)}">${icon('trash', 15)}</button>` : ''}
        </div></div>`).join('')}</div>`
      : `<div class="empty"><div><div class="ill">${icon('cpu', 36)}</div><b>${t('eng.empty')}</b>${t('eng.emptySub')}<div class="acts"><button class="btn" data-act="epic">${t('eng.epic')}</button><button class="btn pri" data-act="engAdd">${t('eng.add')}</button></div></div></div>`}</div></section>`;
}

function viewTasks() {
  const list = [...S.tasks].sort((a, b) => b.id - a.id);
  if (!S.tasks.find((x) => x.id === S.activeTask) && list[0]) S.activeTask = list[0].id;
  const cur = S.tasks.find((x) => x.id === S.activeTask);
  return `
  <aside class="panel side"><h2>${t('tasks.title')}<span style="flex:1"></span>${list.length ? `<button class="btn sm ghost" data-act="tasksClear">${t('tasks.clear')}</button>` : ''}</h2>
    <div class="tlist">${list.map((x) => `<button class="titem ${x.id === S.activeTask ? 'on' : ''}" data-act="task" data-id="${x.id}"><span class="sdot ${x.status}"></span><span class="grow"><b>${esc(t('task.' + x.title))}</b><small>${esc(x.project)} · ${t('status.' + x.status)}</small></span></button>`).join('') || `<div style="color:var(--muted);font-size:13px;padding:6px">${t('tasks.empty')}</div>`}</div>
  </aside>
  <section class="panel main">
    ${cur ? `<h2><span class="sdot ${cur.status}"></span>${esc(t('task.' + cur.title))} <span class="sub">${esc(cur.project)} · ${t('status.' + cur.status)}</span><span style="flex:1"></span>
      <button class="btn sm" data-act="taskCopy">${icon('copy', 14)} ${t('tasks.copy')}</button>
      ${cur.status === 'running' ? `<button class="btn sm danger" data-act="taskStop">${icon('x', 14)} ${t('tasks.stop')}</button>` : ''}</h2><div class="term" id="term"></div>`
    : `<div class="empty"><div><div class="ill">${icon('terminal', 36)}</div><b>${t('tasks.empty')}</b>${t('tasks.emptySub')}</div></div>`}
  </section>`;
}
const colorLog = (s) => esc(s).split('\n').map((l) => /error|failed|fatal/i.test(l) ? `<span class="e">${l}</span>` : /warning/i.test(l) ? `<span class="w">${l}</span>` : /success|succeeded|complete/i.test(l) ? `<span class="ok">${l}</span>` : l).join('\n');
function fillTerm() { const el = $('#term'), cur = S.tasks.find((x) => x.id === S.activeTask); if (el && cur) { el.innerHTML = colorLog(cur.log || ''); el.scrollTop = el.scrollHeight; } }

function viewSettings() {
  const s = S.settings;
  const row = (title, desc, ctrl) => `<div class="srow"><div class="grow"><b>${title}</b>${desc ? `<small>${desc}</small>` : ''}</div>${ctrl}</div>`;
  const tog = (k) => `<button class="toggle ${s[k] ? 'on' : ''}" data-act="tog" data-k="${k}"></button>`;
  const seg = (k, opts) => `<div class="seg">${opts.map(([v, l, ic]) => `<button class="${String(s[k]) === String(v) ? 'on' : ''}" data-act="set" data-k="${k}" data-v="${v}">${ic ? icon(ic, 14) : ''}${l}</button>`).join('')}</div>`;
  const dir = (k) => `<div style="display:flex;gap:6px;align-items:center"><span class="tile-chip" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s[k] || t('set.ask'))}</span><button class="btn sm" data-act="pickDir" data-k="${k}">${t('btn.browse')}</button>${s[k] ? `<button class="btn sm icon ghost" data-act="clearDir" data-k="${k}">${icon('x', 14)}</button>` : ''}</div>`;
  return `
  <aside class="panel side"><h2>${t('set.title')}</h2>
    <div class="nlist">${[['general', 'settings'], ['appearance', 'palette'], ['scanning', 'scan'], ['launch', 'play'], ['data', 'database'], ['about', 'info']].map(([k, ic], i) => `<button class="nitem ${i === 0 ? 'on' : ''}" data-act="secGo" data-s="${k}">${icon(ic, 19)}<span class="lbl">${t('set.' + k)}</span><span class="chev">${icon('chevron', 15)}</span></button>`).join('')}</div>
    ${clockCard()}
  </aside>
  <section class="panel main"><div class="scroll" id="setScroll">
    <h3 id="sec-general">${t('set.general')}</h3>
    <div class="card sgroup">
      ${row(t('set.language'), t('set.language.d'), seg('language', [['en', 'English'], ['es', 'Español']]))}
      ${row(t('set.startup'), t('set.startup.d'), tog('openAtLogin'))}
      ${row(t('set.scanStartup'), t('set.scanStartup.d'), tog('scanOnStartup'))}
      ${row(t('set.startMin'), t('set.startMin.d'), tog('startMinimized'))}
      ${row(t('set.tray'), t('set.tray.d'), tog('closeToTray'))}
      ${row(t('set.notify'), t('set.notify.d'), tog('notifications'))}
    </div>
    <h3 id="sec-appearance">${t('set.appearance')}</h3>
    <div class="card sgroup">
      ${row(t('set.theme'), t('set.theme.d'), seg('theme', [['light', t('theme.light'), 'sun'], ['dark', t('theme.dark'), 'moon'], ['system', t('theme.system'), 'monitor']]))}
      ${row(t('set.accent'), t('set.accent.d'), `<div class="swatches">${Object.entries(ACCENTS).map(([k, c]) => `<button class="${(s.accent in ACCENTS ? s.accent : 'ink') === k ? 'on' : ''}" style="background:${c[isDark() ? 1 : 0]}" data-act="accent" data-v="${k}"></button>`).join('')}</div>`)}
      ${row(t('set.cardSize'), '', seg('cardSize', [['s', t('size.s')], ['m', t('size.m')], ['l', t('size.l')]]))}
      ${row(t('set.animations'), t('set.animations.d'), tog('animations'))}
      ${row(t('set.clock24'), '', tog('use24h'))}
    </div>
    <h3 id="sec-scanning">${t('set.scanning')}</h3>
    <div class="card sgroup">
      ${row(t('set.drives'), t('set.drives.d'), tog('scanDrives'))}
      ${row(t('set.depth'), t('set.depth.d'), `<div class="range"><input type="range" min="2" max="10" value="${s.scanDepth}" id="depth"/><span class="count" id="depthV">${s.scanDepth}</span></div>`)}
      <div class="srow" style="flex-wrap:wrap"><div class="grow"><b>${t('set.folders')}</b><small>${t('set.folders.d')}</small></div><button class="btn sm" data-act="folderAdd">${icon('folderPlus', 15)} ${t('btn.addFolder')}</button>
        <div class="flist">${S.scanFolders.map((f) => `<div class="fitem">${icon('folder', 15)}<span>${esc(f)}</span><button class="btn sm icon ghost" data-act="folderRemove" data-p="${esc(f)}">${icon('x', 14)}</button></div>`).join('') || `<small style="color:var(--dim)">${t('set.noFolders')}</small>`}</div></div>
      ${row(t('btn.scan'), S.lastScan ? t('scan.idle', { t: ago(S.lastScan).toLowerCase() }) : t('scan.never'), `<button class="btn sm pri" data-act="scan">${icon('scan', 15)} ${t('btn.scan')}</button>`)}
    </div>
    <h3 id="sec-launch">${t('set.launch')}</h3>
    <div class="card sgroup">
      ${row(t('set.args'), t('set.args.d'), `<input class="inp" id="defArgs" style="width:280px" placeholder="-log" value="${esc(s.defaultArgs)}"/>`)}
      ${row(t('set.minimize'), t('set.minimize.d'), tog('minimizeOnLaunch'))}
      ${row(t('set.shortcutTarget'), t('set.shortcutTarget.d'), seg('shortcutTarget', [['editor', t('st.editor')], ['uproject', t('st.uproject')]]))}
      ${row(t('set.packageDir'), '', dir('packageDir'))}
      ${row(t('set.backupDir'), '', dir('backupDir'))}
    </div>
    <h3 id="sec-data">${t('set.data')}</h3>
    <div class="card sgroup">
      ${row(t('set.export') + ' / ' + t('set.import'), t('set.data.d'), `<div style="display:flex;gap:6px"><button class="btn sm" data-act="export">${icon('download', 15)} ${t('set.export')}</button><button class="btn sm" data-act="import">${icon('upload', 15)} ${t('set.import')}</button></div>`)}
      ${row(t('set.hidden', { n: S.hidden }), '', `<button class="btn sm" data-act="restoreHidden" ${S.hidden ? '' : 'disabled'}>${icon('eyeOff', 15)} ${t('set.restoreHidden')}</button>`)}
    </div>
    <h3 id="sec-about">${t('set.about')}</h3>
    <div class="card sgroup">
      <div class="srow"><div style="width:52px;height:52px;border-radius:16px;background:var(--ink);color:var(--ink-t);display:grid;place-items:center">${icon('ue', 30)}</div><div class="grow"><b>Unreal Hub ${esc(S.version)}</b><small>${t('set.about.d')}</small></div></div>
      <div class="credits">
        <div><small>${t('cred.by')}</small><b>jsTici & Zorac</b></div>
        <div><small>${t('cred.version')}</small><b>${esc(S.version)}</b></div>
      </div>
      <div class="srow" style="display:block"><b>${t('set.shortcuts')}</b>
        <div class="keys" style="padding:10px 0 0">
          <span>${t('k.palette')}</span><span><kbd>${MOD()}</kbd> <kbd>K</kbd></span>
          <span>${t('k.search')}</span><span><kbd>${MOD()}</kbd> <kbd>F</kbd></span>
          <span>${t('k.views')}</span><span><kbd>${MOD()}</kbd> <kbd>1</kbd>–<kbd>5</kbd></span>
          <span>${t('k.refresh')}</span><span><kbd>F5</kbd></span>
          <span>${t('k.theme')}</span><span><kbd>${MOD()}</kbd> <kbd>Shift</kbd> <kbd>L</kbd></span>
          <span>${t('k.launch')}</span><span><kbd>${MOD()}</kbd> <kbd>Enter</kbd></span>
        </div></div>
    </div>
  </div></section>`;
}

function afterRender() {
  if (S.view === 'library') {
    renderLibContent();
    $('#search').oninput = (e) => { S.search = e.target.value; renderLibContent(); };
    $('#sort').onchange = (e) => { S.sort = e.target.value; localStorage.setItem('sort', S.sort); renderLibContent(); };
  }
  if (S.view === 'tasks') fillTerm();
  if (S.view === 'project') bindProject();
  if (S.view === 'settings') {
    const d = $('#depth');
    d.oninput = () => { $('#depthV').textContent = d.value; };
    d.onchange = () => saveSettings({ scanDepth: Number(d.value) }, false);
    $('#defArgs').onchange = (e) => saveSettings({ defaultArgs: e.target.value }, false);
    const sc = $('#setScroll');
    sc.onscroll = () => {
      let cur = 'general';
      for (const h of $$('h3[id^=sec-]', sc)) if (h.offsetTop - sc.offsetTop - 40 <= sc.scrollTop) cur = h.id.slice(4);
      $$('[data-act=secGo]').forEach((b) => b.classList.toggle('on', b.dataset.s === cur));
    };
  }
}
function rerenderTab(p) { $('#ptab').innerHTML = projectTab(p); bindProject(); }
function bindProject() {
  const p = P(S.selected); if (!p) return;
  if (S.ptab === 'overview' && S.details[p.key] === undefined) {
    S.details[p.key] = null;
    api.details(p.key).then((r) => { if (r.ok) { S.details[p.key] = r.data; if (S.view === 'project' && S.selected === p.key && S.ptab === 'overview') rerenderTab(p); } });
  }
  if (S.ptab === 'gallery' && S.gallery[p.key] === undefined) {
    S.gallery[p.key] = null;
    api.screenshots(p.key).then((r) => { S.gallery[p.key] = r.ok ? r.data : []; if (S.view === 'project' && S.selected === p.key && S.ptab === 'gallery') rerenderTab(p); });
  }
  const eng = $('#pEngine');
  if (eng) eng.onchange = async () => { await call('setMeta', p.key, { engineKey: eng.value }); p.engineKey = eng.value; render(); };
  const args = $('#pArgs');
  if (args) args.onchange = () => { p.args = args.value; call('setMeta', p.key, { args: p.args }); };
  const alias = $('#pAlias');
  if (alias) alias.onchange = () => { p.alias = alias.value.trim(); call('setMeta', p.key, { alias: p.alias }); render(); };
  const tagIn = $('#tagIn');
  if (tagIn) tagIn.onkeydown = async (e) => {
    if (e.key === 'Enter' && tagIn.value.trim()) {
      const tg = tagIn.value.trim();
      if (!p.tags.includes(tg)) { p.tags = [...p.tags, tg]; await call('setMeta', p.key, { tags: p.tags }); }
      rerenderTab(p); $('#tagIn').focus();
    } else if (e.key === 'Backspace' && !tagIn.value && p.tags.length) {
      p.tags = p.tags.slice(0, -1); await call('setMeta', p.key, { tags: p.tags }); rerenderTab(p); $('#tagIn').focus();
    }
  };
  const notes = $('#notes');
  if (notes) { let tm; notes.oninput = () => { clearTimeout(tm); tm = setTimeout(async () => { p.notes = notes.value; await call('setMeta', p.key, { notes: p.notes }); const f = $('#savedFlag'); if (f) { f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 1400); } }, 450); }; }
}

function openModal(html, bind) {
  $('#modal').innerHTML = html;
  $('#modal').classList.add('on'); $('#veil').classList.add('on');
  if (bind) bind($('#modal'));
  const f = $('#modal input, #modal select'); if (f) setTimeout(() => f.focus(), 60);
}
function closeModal() { $('#modal').classList.remove('on'); $('#veil').classList.remove('on'); }
function confirmBox(title, desc, okLabel, danger) {
  return new Promise((res) => {
    openModal(`<h3>${icon(danger ? 'alert' : 'info', 20)} ${title}</h3><p class="d">${desc}</p><div class="mfoot"><button class="btn ghost" id="mNo">${t('btn.cancel')}</button><button class="btn pri" id="mOk" ${danger ? 'style="background:var(--bad);color:#fff"' : ''}>${okLabel || t('btn.confirm')}</button></div>`, (m) => {
      $('#mNo', m).onclick = () => { closeModal(); res(false); };
      $('#mOk', m).onclick = () => { closeModal(); res(true); };
    });
  });
}
function engineOptions(p) {
  const cur = engineOf(p);
  return S.engines.map((e) => `<option value="${esc(e.key)}" ${cur === e ? 'selected' : ''}>UE ${esc(e.version)} · ${t('src.' + e.source)}</option>`).join('');
}

let palIdx = 0, palItems = [];
function openPalette() {
  $('#palette').innerHTML = `<div class="pin">${icon('search', 19)}<input id="palIn" placeholder="${t('pal.placeholder')}" spellcheck="false"/><kbd>Esc</kbd></div><div class="res" id="palRes"></div>`;
  $('#palette').classList.add('on'); $('#veil').classList.add('on');
  const inp = $('#palIn');
  inp.oninput = () => { palIdx = 0; renderPalette(inp.value); };
  inp.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { palIdx = Math.min(palIdx + 1, palItems.length - 1); paintPal(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { palIdx = Math.max(palIdx - 1, 0); paintPal(); e.preventDefault(); }
    else if (e.key === 'Enter') { const it = palItems[palIdx]; if (it) { closePalette(); it.run(e.shiftKey); } }
  };
  renderPalette('');
  setTimeout(() => inp.focus(), 30);
}
function closePalette() { $('#palette').classList.remove('on'); if (!$('#modal').classList.contains('on')) $('#veil').classList.remove('on'); }
function renderPalette(q) {
  q = q.trim().toLowerCase();
  const cmds = [
    { i: isDark() ? 'sun' : 'moon', l: t('cmd.toggleTheme'), run: () => A.theme() },
    { i: 'globe', l: t('cmd.lang'), run: () => A.lang() },
    { i: 'scan', l: t('cmd.scan'), run: () => A.scan() },
    { i: 'plus', l: t('cmd.add'), run: () => A.add() },
    { i: 'folderPlus', l: t('cmd.addEngine'), run: () => A.engAdd() },
    ...['home', 'library', 'engines', 'tasks', 'settings'].map((v) => ({ i: 'chevron', l: t('cmd.go', { v: t('nav.' + v) }), run: () => setView(v) }))
  ].filter((c) => !q || c.l.toLowerCase().includes(q));
  const projs = sorted(S.projects).filter((p) => !q || [p.name, p.alias, ...p.tags].join(' ').toLowerCase().includes(q)).slice(0, q ? 8 : 5)
    .map((p) => ({ p, run: (shift) => (shift ? setView('project', { key: p.key }) : launch(p.key)) }));
  palItems = [...projs, ...cmds];
  let i = 0;
  const html = (projs.length ? `<div class="ph2">${t('pal.projects')}</div>` + projs.map((it) => `<div class="pi" data-i="${i++}"><span class="mini">${thumb(it.p, false)}</span><span class="grow">${esc(pname(it.p))} <small>· ${esc(engLabel(it.p))}</small></span><kbd>↵</kbd></div>`).join('') : '')
    + (cmds.length ? `<div class="ph2">${t('pal.commands')}</div>` + cmds.map((c) => `<div class="pi" data-i="${i++}">${icon(c.i, 17)}<span class="grow">${esc(c.l)}</span></div>`).join('') : '');
  $('#palRes').innerHTML = html || `<div class="none">${t('pal.empty')}</div>`;
  $$('#palRes .pi').forEach((el) => { el.onclick = () => { closePalette(); palItems[+el.dataset.i].run(false); }; el.onmousemove = () => { if (palIdx !== +el.dataset.i) { palIdx = +el.dataset.i; paintPal(); } }; });
  paintPal();
}
function paintPal() { $$('#palRes .pi').forEach((el) => el.classList.toggle('on', +el.dataset.i === palIdx)); const on = $('#palRes .pi.on'); if (on) on.scrollIntoView({ block: 'nearest' }); }

function openMenu(items, x, y) {
  const m = $('#menu');
  m.innerHTML = items.map((it, i) => it === '-' ? '<hr/>' : `<button data-mi="${i}" class="${it.danger ? 'danger' : ''}">${icon(it.i, 16)}<span>${esc(it.l)}</span></button>`).join('');
  m.classList.add('on');
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 12)) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 12)) + 'px';
  $$('button', m).forEach((b) => { b.onclick = (e) => { e.stopPropagation(); closeMenu(); items[+b.dataset.mi].fn(); }; });
}
function closeMenu() { $('#menu').classList.remove('on'); }
function projectMenu(p, x, y) {
  const o = { dataset: { key: p.key } };
  openMenu([
    { i: 'play', l: t('act.launch'), fn: () => launch(p.key) },
    { i: 'gamepad', l: t('act.game'), fn: () => launch(p.key, { mode: 'game' }) },
    { i: 'zap', l: t('act.launchWith'), fn: () => A.launchWith(o) },
    '-',
    { i: p.favorite ? 'star' : 'starFill', l: t(p.favorite ? 'act.unfav' : 'act.fav'), fn: () => A.fav(o) },
    { i: 'pin', l: t(p.pinned ? 'act.unpin' : 'act.pin'), fn: () => A.pin(o) },
    { i: 'info', l: t('act.details'), fn: () => A.open(o) },
    '-',
    { i: 'folder', l: t('act.folder'), fn: () => call('showItem', p.file) },
    { i: 'code', l: t('act.ide'), fn: () => A.ide(o) },
    { i: 'shortcut', l: t('act.shortcut'), fn: () => A.shortcut(o) },
    { i: 'image', l: t('act.thumb'), fn: () => A.thumb(o) },
    ...(p.customThumb ? [{ i: 'refresh', l: t('act.thumbReset'), fn: () => A.thumbReset(o) }] : []),
    { i: 'copy', l: t('act.copyPath'), fn: () => A.copyPath(o) },
    '-',
    { i: 'eyeOff', l: t('act.hide'), fn: () => A.hide(o) },
    { i: 'trash', l: t('act.trash'), danger: true, fn: () => A.trash(o) }
  ], x, y);
}

async function launch(key, opts = {}) {
  const p = P(key); if (!p) return;
  const r = await call('launch', key, opts);
  if (r) {
    toast(t('t.launched', { n: pname(p) }), t('t.launchedSub', { v: r.engine }), 'ok');
    p.lastLaunched = Date.now(); p.launchCount++;
    if (r.history) S.history = r.history;
    render();
  }
}
async function saveSettings(patch, rerender = true) {
  const s = await call('setSettings', patch);
  if (s) { S.settings = s; applyTheme(); if (rerender) render(); }
}
const kOf = (el) => el.dataset.key || S.selected;
const runTask = async (fn, ...a) => { const id = await call(fn, ...a); if (id) { S.activeTask = id; setView('tasks'); } };

const A = {
  go: (el) => setView(el.dataset.v),
  back: () => setView(S.back || 'library'),
  open: (el) => { S.ptab = 'overview'; setView('project', { key: el.dataset.key }); },
  launch: (el) => launch(kOf(el)),
  game: (el) => launch(kOf(el), { mode: 'game' }),
  menu: (el) => { const r = el.getBoundingClientRect(); projectMenu(P(kOf(el)), r.left, r.bottom + 6); },
  launchWith: (el) => {
    const p = P(kOf(el));
    openModal(`<h3>${icon('play', 18)} ${t('m.launchTitle', { n: esc(pname(p)) })}</h3>
      <div class="mbody">
        <div class="mrow"><label>${t('m.mode')}</label><div class="seg" id="mMode"><button class="on" data-m="editor">${icon('monitor', 14)} ${t('m.editor')}</button><button data-m="game">${icon('gamepad', 14)} ${t('m.game')}</button></div></div>
        <div class="mrow"><label>${t('m.engine')}</label><select class="sel" id="mEng">${engineOptions(p)}</select></div>
        <div class="mrow"><label>${t('m.args')}</label><input class="inp" id="mArgs" value="${esc(p.args || S.settings.defaultArgs || '')}" placeholder="${t('ov.argsHint')}"/></div>
      </div><div class="mfoot"><button class="btn ghost" id="mNo">${t('btn.cancel')}</button><button class="btn pri" id="mOk">${icon('play', 14)} ${t('btn.launch')}</button></div>`, (m) => {
      let mode = 'editor';
      $$('#mMode button', m).forEach((b) => (b.onclick = () => { mode = b.dataset.m; $$('#mMode button', m).forEach((x) => x.classList.toggle('on', x === b)); }));
      $('#mNo', m).onclick = closeModal;
      $('#mOk', m).onclick = () => { closeModal(); launch(p.key, { mode, engineKey: $('#mEng', m).value, args: $('#mArgs', m).value }); };
    });
  },
  fav: async (el) => { const p = P(kOf(el)); p.favorite = !p.favorite; await call('setMeta', p.key, { favorite: p.favorite }); render(); },
  pin: async (el) => { const p = P(kOf(el)); p.pinned = !p.pinned; await call('setMeta', p.key, { pinned: p.pinned }); render(); },
  folder: (el) => call('openFolder', P(kOf(el)).dir),
  logs: (el) => call('openFolder', P(kOf(el)).dir + '/Saved/Logs'),
  ide: (el) => call('openIDE', kOf(el)),
  copyPath: async (el) => { if ((await call('copy', P(kOf(el)).file)) !== undefined) toast(t('t.copied'), '', 'ok'); },
  shortcut: async (el, mode) => { const f = await call('shortcut', kOf(el), { mode: typeof mode === 'string' ? mode : undefined }); if (f) toast(t('t.shortcut'), f, 'ok'); },
  shortcutGame: (el) => A.shortcut(el, 'game'),
  thumb: async (el) => { const r = await call('pickThumb', kOf(el)); if (r) { Object.assign(P(r.key), r); render(); } },
  thumbReset: async (el) => { const r = await call('resetThumb', kOf(el)); if (r) { Object.assign(P(r.key), r); render(); } },
  backup: (el) => runTask('backup', kOf(el)),
  generate: (el) => runTask('generateFiles', kOf(el)),
  build: (el) => runTask('build', kOf(el)),
  package: (el) => {
    const p = P(kOf(el));
    openModal(`<h3>${icon('box', 18)} ${t('m.packageTitle', { n: esc(pname(p)) })}</h3><div class="mbody">
      <div class="formgrid"><div><label>${t('m.platform')}</label><select class="sel" id="mPlat">${['Win64', 'Linux', 'Android', 'Mac', 'IOS'].map((x) => `<option>${x}</option>`).join('')}</select></div>
      <div><label>${t('m.config')}</label><select class="sel" id="mCfg">${['Shipping', 'Development', 'DebugGame'].map((x) => `<option>${x}</option>`).join('')}</select></div></div>
      <div class="mrow"><label>${t('m.engine')}</label><select class="sel" id="mEng">${engineOptions(p)}</select></div>
      <div class="mrow"><label>${t('m.output')}</label><div style="display:flex;gap:8px"><input class="inp" id="mOut" value="${esc(S.settings.packageDir || '')}" placeholder="${t('set.ask')}"/><button class="btn" id="mPick">${t('btn.browse')}</button></div></div>
      ${[['mAll', 'm.allMaps', true], ['mCmp', 'm.compressed', true], ['mIo', 'm.iostore', false]].map(([id, l, on]) => `<label class="crow"><span class="cb ${on ? 'on' : ''}" id="${id}">${icon('check', 13)}</span>${t(l)}</label>`).join('')}
      </div><div class="mfoot"><button class="btn ghost" id="mNo">${t('btn.cancel')}</button><button class="btn pri" id="mOk">${icon('box', 14)} ${t('btn.start')}</button></div>`, (m) => {
      $$('.crow', m).forEach((c) => (c.onclick = (e) => { e.preventDefault(); $('.cb', c).classList.toggle('on'); }));
      $('#mPick', m).onclick = async () => { const d = await call('pickFolder'); if (d) $('#mOut', m).value = d; };
      $('#mNo', m).onclick = closeModal;
      $('#mOk', m).onclick = () => {
        const opts = { platform: $('#mPlat', m).value, config: $('#mCfg', m).value, outDir: $('#mOut', m).value, allMaps: $('#mAll', m).classList.contains('on'), compressed: $('#mCmp', m).classList.contains('on'), iostore: $('#mIo', m).classList.contains('on') };
        const ek = $('#mEng', m).value;
        closeModal();
        runTask('package', p.key, ek, opts);
      };
    });
  },
  duplicate: (el) => {
    const p = P(kOf(el));
    openModal(`<h3>${icon('duplicate', 18)} ${t('m.dupTitle', { n: esc(pname(p)) })}</h3><div class="mbody"><div class="mrow"><label>${t('m.dupName')}</label><input class="inp" id="mName" value="${esc(p.name.slice(0, 16))}Copy" maxlength="20"/><small style="color:var(--muted);display:block;margin-top:6px">${t('m.dupHint')}</small></div>${p.isCpp ? `<p class="d">${t('m.dupCpp')}</p>` : ''}</div>
      <div class="mfoot"><button class="btn ghost" id="mNo">${t('btn.cancel')}</button><button class="btn pri" id="mOk">${t('btn.create')}</button></div>`, (m) => {
      $('#mNo', m).onclick = closeModal;
      $('#mOk', m).onclick = async () => {
        const btn = $('#mOk', m); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
        const r = await call('duplicate', p.key, $('#mName', m).value);
        closeModal();
        if (r) { toast(t('t.duplicated'), r.file, 'ok'); applyData(await call('refresh')); }
      };
    });
  },
  switch: (el) => {
    const p = P(kOf(el));
    openModal(`<h3>${icon('cpu', 18)} ${t('m.switchTitle')}</h3><p class="d">${t('m.switchD')}</p><div class="mbody"><select class="sel" id="mEng">${engineOptions(p)}</select></div>
      <div class="mfoot"><button class="btn ghost" id="mNo">${t('btn.cancel')}</button><button class="btn pri" id="mOk">${t('btn.save')}</button></div>`, (m) => {
      $('#mNo', m).onclick = closeModal;
      $('#mOk', m).onclick = async () => { const r = await call('setEngine', p.key, $('#mEng', m).value); closeModal(); if (r) { p.association = r.association; p.engineKey = ''; render(); } };
    });
  },
  hide: async (el) => {
    const p = P(kOf(el));
    if (!(await confirmBox(t('m.hideTitle'), t('m.hideD'), t('act.hide')))) return;
    if ((await call('hide', p.key)) !== undefined) { S.projects = S.projects.filter((x) => x !== p); S.hidden++; if (S.view === 'project') S.view = S.back || 'library'; render(); toast(t('t.removed'), pname(p)); }
  },
  trash: async (el) => {
    const p = P(kOf(el));
    if (!(await confirmBox(t('m.trashTitle'), t('m.trashD', { p: `<b>${esc(p.dir)}</b>` }), t('act.trash').replace('…', ''), true))) return;
    if ((await call('trash', p.key)) !== undefined) { S.projects = S.projects.filter((x) => x !== p); if (S.view === 'project') S.view = S.back || 'library'; render(); toast(t('t.trashed'), pname(p), 'ok'); }
  },
  cleanTab: (el) => { const k = kOf(el); S.ptab = 'storage'; if (S.view !== 'project') setView('project', { key: k }); else render(); if (!S.analysis[k]) A.analyze({ dataset: { key: k } }); },
  ptab: (el) => { S.ptab = el.dataset.t; render(); },
  analyze: async (el) => {
    const k = kOf(el);
    S.analysis[k] = { loading: true }; if (S.view === 'project') render();
    const r = await call('analyze', k);
    if (r) { S.analysis[k] = r; S.cleanSel[k] = Object.fromEntries(r.targets.filter((x) => x.def && x.size).map((x) => [x.id, true])); if (P(k)) P(k).size = r.total; } else delete S.analysis[k];
    if (S.view === 'project') render();
  },
  cbx: (el) => { const k = S.selected; const s = (S.cleanSel[k] ||= {}); s[el.dataset.id] = !s[el.dataset.id]; rerenderTab(P(k)); },
  clean: async (el) => {
    const k = kOf(el); const ids = Object.keys(S.cleanSel[k] || {}).filter((x) => S.cleanSel[k][x]);
    S.analysis[k] = { loading: true }; render();
    const r = await call('clean', k, ids);
    if (r) toast(t('st.freed', { s: fmtSize(r.freed) }), pname(P(k)), 'ok');
    A.analyze({ dataset: { key: k } });
  },
  removeTag: async (el) => { const p = P(S.selected); p.tags = p.tags.filter((x) => x !== el.dataset.tag); await call('setMeta', p.key, { tags: p.tags }); rerenderTab(p); },
  color: async (el) => { const p = P(S.selected); p.color = el.dataset.v; await call('setMeta', p.key, { color: p.color }); render(); },

  coll: (el) => { S.coll = el.dataset.c; localStorage.setItem('coll', S.coll); if (S.view !== 'library') setView('library'); else render(); },
  day: (el) => { S.day = S.day === el.dataset.d ? null : el.dataset.d; if (S.view !== 'library') setView('library'); else render(); },
  calPrev: () => { S.cal = new Date(S.cal.getFullYear(), S.cal.getMonth() - 1, 1); render(); },
  calNext: () => { S.cal = new Date(S.cal.getFullYear(), S.cal.getMonth() + 1, 1); render(); },
  grp: (el) => { S.closed[el.dataset.g] = !S.closed[el.dataset.g]; localStorage.setItem('closed', JSON.stringify(S.closed)); renderLibContent(); },
  mode: (el) => saveSettings({ viewMode: el.dataset.m }),
  clearFilters: () => { S.coll = 'all'; S.day = null; S.search = ''; render(); },
  scan: () => { if (!S.scan.on) { S.scan = { on: true, dir: '', found: 0 }; render(); api.scan(); } },
  cancelScan: () => api.cancelScan(),
  add: async () => { const r = await call('addProject'); if (r) { applyData(r); toast(t('t.added', { n: r.added }), '', 'ok'); } },

  engLaunch: (el) => call('launchEngine', el.dataset.k),
  engFolder: (el) => call('openFolder', el.dataset.root),
  engSize: async (el) => { el.innerHTML = '<span class="spinner"></span>'; const s = await call('engineSize', el.dataset.k); const e = S.engines.find((x) => x.key === el.dataset.k); if (e && s) e.size = s; render(); },
  engRemove: async (el) => { const r = await call('removeEngine', el.dataset.k); if (r) { S.engines = r; render(); } },
  engAdd: async () => { const r = await call('addEngine'); if (r) { S.engines = r; render(); } },
  epic: () => call('epicLauncher'),

  task: (el) => { S.activeTask = +el.dataset.id; render(); },
  taskStop: () => call('cancelTask', S.activeTask),
  taskCopy: async () => { const x = S.tasks.find((y) => y.id === S.activeTask); if (x) { await call('copy', x.log); toast(t('t.copied'), '', 'ok'); } },
  tasksClear: async () => { await call('clearTasks'); S.tasks = S.tasks.filter((x) => x.status === 'running'); S.activeTask = null; render(); },

  set: (el) => saveSettings({ [el.dataset.k]: el.dataset.v }),
  tog: (el) => saveSettings({ [el.dataset.k]: !S.settings[el.dataset.k] }),
  accent: (el) => saveSettings({ accent: el.dataset.v }),
  theme: () => saveSettings({ theme: isDark() ? 'light' : 'dark' }),
  lang: () => saveSettings({ language: LANG === 'en' ? 'es' : 'en' }),
  folderAdd: async () => { const r = await call('addFolder'); if (r) { S.scanFolders = r.scanFolders; S.scan.on = true; render(); } },
  folderRemove: async (el) => { const r = await call('removeFolder', el.dataset.p); if (r) { S.scanFolders = r.scanFolders; render(); } },
  pickDir: async (el) => { const d = await call('pickFolder'); if (d) saveSettings({ [el.dataset.k]: d }); },
  clearDir: (el) => saveSettings({ [el.dataset.k]: '' }),
  export: async () => { const f = await call('exportConfig'); if (f) toast(t('t.exported'), f, 'ok'); },
  import: async () => { const d = await call('importConfig'); if (d) { applyData(d); toast(t('t.imported'), '', 'ok'); } },
  restoreHidden: async () => { const d = await call('unhideAll'); if (d) applyData(d); },
  secGo: (el) => { const h = $('#sec-' + el.dataset.s), sc = $('#setScroll'); if (h) sc.scrollTo({ top: h.offsetTop - sc.offsetTop - 8, behavior: 'smooth' }); },
  win: (el) => api.win(el.dataset.w),
  palette: () => openPalette(),
  stop: async (el) => { await call('stop', kOf(el)); },
  terminal: (el) => call('terminal', P(kOf(el)).dir),
  redirectors: (el) => runTask('commandlet', kOf(el), 'redirectors'),
  blueprints: (el) => runTask('commandlet', kOf(el), 'blueprints'),
  galOpen: (el) => call('openPath', S.gallery[S.selected][+el.dataset.i].file),
  galCover: async (el) => { const r = await call('setThumbPath', S.selected, S.gallery[S.selected][+el.dataset.i].file); if (r) { Object.assign(P(r.key), r); render(); toast(t('gal.cover'), '', 'ok'); } },
  newProject: () => {
    if (!S.engines.length) return toast(t('eng.empty'), t('eng.emptySub'), 'bad');
    openModal(`<h3>${icon('sparkle', 18)} ${t('m.newTitle')}</h3><p class="d">${t('m.newD')}</p><div class="mbody"><select class="sel" id="mEng">${S.engines.map((e) => `<option value="${esc(e.key)}">UE ${esc(e.version)} · ${t('src.' + e.source)}</option>`).join('')}</select></div>
      <div class="mfoot"><button class="btn ghost" id="mNo">${t('btn.cancel')}</button><button class="btn pri" id="mOk">${icon('play', 14)} ${t('btn.launch')}</button></div>`, (m) => {
      $('#mNo', m).onclick = closeModal;
      $('#mOk', m).onclick = () => { const k = $('#mEng', m).value; closeModal(); call('launchEngine', k); };
    });
  },
  analyzeAll: async () => {
    const list = [...S.projects];
    for (let i = 0; i < list.length; i++) {
      toast(t('t.analyzing', { i: i + 1, n: list.length }), pname(list[i]));
      const r = await call('analyze', list[i].key);
      if (r) { list[i].size = r.total; S.analysis[list[i].key] = r; S.cleanSel[list[i].key] = Object.fromEntries(r.targets.filter((x) => x.def && x.size).map((x) => [x.id, true])); }
    }
    if (S.view === 'home') render();
  }
};

document.addEventListener('click', (e) => {
  if (!e.target.closest('#menu')) closeMenu();
  const el = e.target.closest('[data-act]');
  if (!el || el.closest('#modal') || el.closest('#palette')) return;
  const fn = A[el.dataset.act];
  if (fn) { e.stopPropagation(); fn(el); }
});
document.addEventListener('dblclick', (e) => {
  const el = e.target.closest('[data-dbl=launch]');
  if (el && !e.target.closest('button')) launch(el.dataset.key);
});
document.addEventListener('contextmenu', (e) => {
  const el = e.target.closest('[data-key]');
  if (el && P(el.dataset.key)) { e.preventDefault(); projectMenu(P(el.dataset.key), e.clientX, e.clientY); }
});
$('#veil').addEventListener('click', () => { closeModal(); closePalette(); });
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
  if (e.key === 'Escape') {
    if ($('#palette').classList.contains('on')) return closePalette();
    if ($('#modal').classList.contains('on')) return closeModal();
    if ($('#menu').classList.contains('on')) return closeMenu();
    if (S.view === 'project') return A.back();
  }
  if (mod && key === 'k') { e.preventDefault(); $('#palette').classList.contains('on') ? closePalette() : openPalette(); }
  else if (mod && key === 'f') { e.preventDefault(); if (S.view !== 'library') setView('library'); setTimeout(() => $('#search') && $('#search').focus(), 30); }
  else if (mod && e.shiftKey && key === 'l') { e.preventDefault(); A.theme(); }
  else if (mod && /^[1-5]$/.test(e.key)) { e.preventDefault(); setView(['home', 'library', 'engines', 'tasks', 'settings'][+e.key - 1]); }
  else if (e.key === 'F5') { e.preventDefault(); A.scan(); }
  else if (e.key === 'Enter' && mod && S.view === 'project') launch(S.selected);
  else if (e.key === 'F12') api.win('devtools');
});

// drag & drop .uproject files / folders
let dragDepth = 0;
$('#dropIcon').innerHTML = icon('upload', 34);
window.addEventListener('dragenter', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragDepth++; $('#dropTitle').textContent = t('drop.title'); $('#dropSub').textContent = t('drop.sub'); $('#drop').classList.add('on'); } });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop').classList.remove('on'); } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault(); dragDepth = 0; $('#drop').classList.remove('on');
  const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
  if (!paths.length) return;
  const r = await call('addProjectPaths', paths);
  if (r) { applyData(r); toast(t('t.added', { n: r.added }), '', 'ok'); }
});

// live clock
setInterval(() => {
  const f = $('#clockFace'); if (!f) return;
  const d = new Date(); f.innerHTML = clockSvg(d);
  const ct = clockText(d); $('#clockTm').textContent = ct.tm; $('#clockDt').textContent = ct.dt;
}, 1000);

api.onScan((m) => {
  if (m.state === 'start') S.scan = { on: true, dir: '', found: 0 };
  else if (m.state === 'progress') {
    S.scan = { on: true, dir: m.dir, found: m.found };
    const l = $('.scanchip .lbl'), c = $('.scanchip .count');
    if (l && c) { l.textContent = t('scan.running', { d: m.dir }); c.textContent = m.found; return; }
  } else if (m.state === 'end') { S.scan = { on: false, dir: '', found: 0 }; if (!m.cancelled) toast(t('scan.done'), t('scan.doneSub', { n: m.count }), 'ok'); }
  renderTop();
  if (S.view === 'library' || S.view === 'home') renderView();
});
api.onProjects((d) => {
  if (d.projects) S.projects = d.projects;
  if (d.engines) S.engines = d.engines;
  if (d.lastScan) S.lastScan = d.lastScan;
  if (S.view !== 'settings' && !(S.view === 'project' && S.ptab === 'notes')) renderView();
  renderTop();
});
api.onTask((m) => {
  if (m.type === 'start') { S.tasks.push({ ...m.task }); renderRail(); if (S.view === 'tasks') renderView(); return; }
  const x = S.tasks.find((y) => y.id === m.id); if (!x) return;
  if (m.type === 'log') {
    x.log += m.chunk;
    if (S.view === 'tasks' && S.activeTask === m.id) { const el = $('#term'); if (el) { const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 40; el.insertAdjacentHTML('beforeend', colorLog(m.chunk)); if (atEnd) el.scrollTop = el.scrollHeight; } }
  } else if (m.type === 'end') {
    x.status = m.status; x.code = m.code;
    const nm = t('task.' + x.title);
    if (m.status === 'done') toast(t('t.taskDone', { t: nm }), x.project, 'ok');
    else if (m.status === 'failed') toast(t('t.taskFailed', { t: nm }), x.project, 'bad');
    renderRail(); if (S.view === 'tasks') renderView();
  }
});
api.onRunning((m) => {
  const wasRunning = m.key && S.running.includes(m.key);
  S.running = m.running || []; if (m.sessions) S.sessions = m.sessions;
  if (m.key && P(m.key) && m.playTime !== undefined) P(m.key).playTime = m.playTime;
  if (wasRunning && !S.running.includes(m.key) && P(m.key)) toast(t('t.stopped'), pname(P(m.key)));
  if (!(S.view === 'project' && S.ptab === 'notes') && S.view !== 'settings') renderView();
});
api.onWindow((m) => { S.maximized = m.maximized; renderTop(); });


(async () => {
  const d = await call('load');
  if (!d) return;
  const tk = await call('tasks'); if (tk) S.tasks = tk;
  S.view = 'home';
  applyData(d);
})();