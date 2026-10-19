
const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, nativeTheme, clipboard, Tray, Menu, Notification, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { spawn, execFile } = require('child_process');

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
let win = null;

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', (_e, argv) => { if (!handleArgv(argv)) showWindow(); });

// Thumbnails are served from a disk cache through uh://thumb/ instead of being kept in memory as data URLs.
protocol.registerSchemesAsPrivileged([{ scheme: 'uh', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
// Chromium keeps a spare renderer process warm for fast navigation; the hub has a single page, so it is wasted RAM.
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess');

const DEFAULT_STORE = {
  scanFolders: [],
  extraProjects: [],
  hiddenProjects: [],
  manualEngines: [],
  knownProjects: [],
  meta: {},
  history: [],              
  sessions: [],              
  lastScan: 0,
  settings: {
    theme: 'system',        
    language: 'en',       
    accent: 'ink',
    defaultArgs: '',
    minimizeOnLaunch: false,
    packageDir: '',
    backupDir: '',
    scanDepth: 5,
    scanDrives: true,
    scanOnStartup: true,
    openAtLogin: false,
    confirmLaunch: false,
    cardSize: 'm',           
    viewMode: 'grid',        
    animations: true,
    use24h: false,
    shortcutTarget: 'editor', 
    closeToTray: true,
    notifications: true,
    startMinimized: false,
    fabFree: true,
    autoUpdate: true
  }
};
let store = null;
const userFile = (...p) => path.join(app.getPath('userData'), ...p);
const storeFile = () => userFile('unreal-hub-data.json');

function loadStore() {
  try {
    const raw = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
    store = { ...structuredClone(DEFAULT_STORE), ...raw };
    store.settings = { ...DEFAULT_STORE.settings, ...(raw.settings || {}) };
  } catch {
    store = structuredClone(DEFAULT_STORE);
    if ((app.getLocale() || '').toLowerCase().startsWith('es')) store.settings.language = 'es';
  }
}
let saveTimer = null;
function saveStore(now = false) {
  const write = () => {
    fs.mkdirSync(path.dirname(storeFile()), { recursive: true });
    const tmp = storeFile() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
    fs.renameSync(tmp, storeFile());
  };
  clearTimeout(saveTimer);
  if (now) write(); else saveTimer = setTimeout(write, 250);
}

const normKey = (p) => {
  const n = path.resolve(p).replace(/\\/g, '/');
  return IS_WIN ? n.toLowerCase() : n;
};
const exists = async (p) => { try { await fsp.access(p); return true; } catch { return false; } };
async function readJson(p) {
  let t = await fsp.readFile(p, 'utf8');
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  return JSON.parse(t);
}
const run = (cmd, args) => new Promise((res) =>
  execFile(cmd, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, out) => res(err ? '' : out)));
function splitArgs(str) {
  if (!str) return [];
  return (str.match(/(?:[^\s"]+|"[^"]*")+/g) || []).map((a) => a.replace(/"/g, ''));
}
const safeName = (s) => String(s).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'Project';
const hash = (s) => crypto.createHash('md5').update(s).digest('hex').slice(0, 12);

async function dirSize(dir) {
  let total = 0, entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return 0; }
  for (let i = 0; i < entries.length; i += 64) {
    await Promise.all(entries.slice(i, i + 64).map(async (e) => {
      const fp = path.join(dir, e.name);
      let s = 0;
      if (e.isDirectory()) s = await dirSize(fp);
      else if (e.isFile()) { try { s = (await fsp.stat(fp)).size; } catch {} }
      total += s;
    }));
  }
  return total;
}
async function countFiles(dir, ext) {
  let n = 0, entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    if (e.isDirectory()) n += await countFiles(path.join(dir, e.name), ext);
    else if (e.name.toLowerCase().endsWith(ext)) n++;
  }
  return n;
}

function editorExe(root) {
  const c = IS_WIN
    ? ['Engine/Binaries/Win64/UnrealEditor.exe', 'Engine/Binaries/Win64/UE4Editor.exe']
    : IS_MAC
      ? ['Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor', 'Engine/Binaries/Mac/UE4Editor.app/Contents/MacOS/UE4Editor']
      : ['Engine/Binaries/Linux/UnrealEditor', 'Engine/Binaries/Linux/UE4Editor'];
  for (const rel of c) { const p = path.join(root, rel); if (fs.existsSync(p)) return p; }
  return null;
}
async function engineVersion(root) {
  try {
    const v = await readJson(path.join(root, 'Engine/Build/Build.version'));
    return `${v.MajorVersion}.${v.MinorVersion}.${v.PatchVersion}`;
  } catch { return null; }
}

// Real program icons (Unreal Editor, Explorer, PowerShell, IDE) read from the files themselves,
// small PNG data URLs cached per file.
const iconCache = new Map();
async function exeIcon(file) {
  if (iconCache.has(file)) return iconCache.get(file);
  let url = '';
  try { const img = await app.getFileIcon(file, { size: 'large' }); if (!img.isEmpty()) url = img.toDataURL(); } catch {}
  iconCache.set(file, url);
  return url;
}

// The official Unreal logo shipped inside each engine (the one the editor itself uses).
async function engineLogo(root) {
  for (const rel of ['Engine/Content/Slate/Starship/Common/UELogo.png', 'Engine/Content/Editor/Slate/About/UnrealLogo.png']) {
    const f = path.join(root, rel);
    if (iconCache.has(f)) return iconCache.get(f);
    if (!(await exists(f))) continue;
    const img = nativeImage.createFromPath(f);
    const url = img.isEmpty() ? '' : img.toDataURL();
    iconCache.set(f, url);
    if (url) return url;
  }
  return '';
}

let engineCache = [];
async function detectEngines() {
  const found = new Map();
  const add = async (root, association, source) => {
    if (!root) return;
    root = path.resolve(root.trim());
    const key = normKey(root);
    if (found.has(key)) return;
    const exe = editorExe(root);
    if (!exe) return;
    const version = await engineVersion(root);
    const assoc = association || (version ? version.split('.').slice(0, 2).join('.') : '');
    const meta = (store.meta['engine:' + key]) || {};
    const logo = await engineLogo(root);
    found.set(key, { key, root, exe, version: version || assoc, association: assoc, source, size: meta.size || 0, logo, icon: logo ? '' : await exeIcon(exe) });
  };

  if (IS_WIN) {
    const dat = path.join(process.env.ProgramData || 'C:/ProgramData', 'Epic/UnrealEngineLauncher/LauncherInstalled.dat');
    try {
      const j = await readJson(dat);
      for (const it of j.InstallationList || []) if (/^UE_\d/.test(it.AppName)) await add(it.InstallLocation, it.AppName.slice(3), 'launcher');
    } catch {}
    const out = await run('reg', ['query', 'HKLM\\SOFTWARE\\EpicGames\\Unreal Engine', '/s', '/v', 'InstalledDirectory']);
    let section = null;
    for (const line of out.split(/\r?\n/)) {
      const h = line.match(/Unreal Engine\\([^\\]+?)\s*$/);
      if (h) { section = h[1]; continue; }
      const m = line.match(/InstalledDirectory\s+REG_SZ\s+(.+)$/);
      if (m && section) await add(m[1], section, 'launcher');
    }
    const out2 = await run('reg', ['query', 'HKCU\\Software\\Epic Games\\Unreal Engine\\Builds']);
    for (const line of out2.split(/\r?\n/)) {
      const m = line.match(/^\s+(\S+)\s+REG_SZ\s+(.+)$/);
      if (m) await add(m[2], m[1], 'source');
    }
    // Common default install folders
    for (const base of ['C:/Program Files/Epic Games', 'D:/Epic Games', 'D:/Program Files/Epic Games', 'E:/Epic Games']) {
      let dirs = [];
      try { dirs = await fsp.readdir(base); } catch {}
      for (const d of dirs) if (/^UE_\d/i.test(d)) await add(path.join(base, d), d.slice(3), 'launcher');
    }
  } else if (IS_MAC) {
    const base = '/Users/Shared/Epic Games';
    let dirs = [];
    try { dirs = await fsp.readdir(base); } catch {}
    for (const d of dirs) if (/^UE_\d/i.test(d)) await add(path.join(base, d), d.slice(3), 'launcher');
  }
  for (const e of store.manualEngines) await add(e.root, e.association, 'manual');

  engineCache = [...found.values()].sort((a, b) => (b.version || '').localeCompare(a.version || '', undefined, { numeric: true }));
  return engineCache;
}

function engineFor(project, engineKey) {
  if (engineKey) { const e = engineCache.find((x) => x.key === engineKey); if (e) return e; }
  const pinned = (store.meta[project.key] || {}).engineKey;
  if (pinned) { const e = engineCache.find((x) => x.key === pinned); if (e) return e; }
  const a = (project.association || '').toLowerCase();
  if (a) {
    return engineCache.find((e) => e.association.toLowerCase() === a)
      || engineCache.find((e) => (e.version || '').startsWith(a + '.'))
      || null;
  }
  return engineCache[0] || null;
}

const SKIP_DIRS = new Set([
  'intermediate', 'saved', 'binaries', 'deriveddatacache', 'content', 'node_modules', '.git', '.vs', '.idea', '.svn',
  'windows', 'windows.old', 'program files', 'program files (x86)', 'programdata', 'appdata', 'perflogs', 'recovery',
  'system volume information', '$recycle.bin', 'msocache', 'windowsapps', 'steamapps', 'epic games', 'templates',
  'featurepacks', 'samples', 'engine', 'android', 'sdk', 'ndk', 'python', 'anaconda3', 'miniconda3', 'library',
  'applications', 'system', 'proc', 'dev', 'sys', 'usr', 'bin', 'sbin', 'var', 'etc', 'boot', 'snap', 'cache', '.cache'
]);
let engineRoots = new Set();
let scanCancel = false;
let scanStats = { dirs: 0, found: 0 };

async function scanFolder(dir, depth, out) {
  if (scanCancel) return;
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
  scanStats.dirs++;
  if (scanStats.dirs % 150 === 0) send('scan:state', { state: 'progress', dir, dirs: scanStats.dirs, found: out.size });
  const up = entries.find((e) => e.isFile() && e.name.toLowerCase().endsWith('.uproject'));
  if (up) { out.add(path.join(dir, up.name)); return; }
  if (depth <= 0) return;
  const subs = entries.filter((e) => {
    if (!e.isDirectory()) return false;
    const n = e.name.toLowerCase();
    if (n.startsWith('$') || n.startsWith('.') || SKIP_DIRS.has(n) || /^ue_\d/.test(n)) return false;
    return !engineRoots.has(normKey(path.join(dir, e.name)));
  });
  for (let i = 0; i < subs.length; i += 24) {
    await Promise.all(subs.slice(i, i + 24).map((e) => scanFolder(path.join(dir, e.name), depth - 1, out)));
  }
}

async function readText(p) {
  const b = await fsp.readFile(p);
  if (b[0] === 0xff && b[1] === 0xfe) return b.slice(2).toString('utf16le');
  if (b[0] === 0xfe && b[1] === 0xff) return Buffer.from(b.slice(2)).swap16().toString('utf16le');
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.slice(3).toString('utf8');
  if (b.length > 3 && b[1] === 0 && b[3] === 0) return b.toString('utf16le');
  return b.toString('utf8');
}

async function recentProjects() {
  const base = IS_WIN
    ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData/Local'), 'UnrealEngine')
    : IS_MAC ? path.join(os.homedir(), 'Library/Application Support/Epic/UnrealEngine')
      : path.join(os.homedir(), '.config/Epic/UnrealEngine');
  const list = [];
  let versions = [];
  try { versions = await fsp.readdir(base); } catch {}
  for (const v of versions) {
    for (const sub of ['Saved/Config/WindowsEditor', 'Saved/Config/Windows', 'Saved/Config/MacEditor', 'Saved/Config/LinuxEditor']) {
      const dir = path.join(base, v, sub);
      let files = [];
      try { files = (await fsp.readdir(dir)).filter((f) => f.toLowerCase().endsWith('.ini')); } catch {}
      for (const f of files) {
        try {
          const t = await readText(path.join(dir, f));
          const re = IS_WIN ? /([A-Za-z]:[\\/][^"\r\n,)]*?\.uproject)/gi : /(\/[^"\r\n,)]*?\.uproject)/gi;
          let m;
          while ((m = re.exec(t))) list.push(m[1]);
        } catch {}
      }
    }
  }
  return list;
}

function scanRoots() {
  const roots = [];
  const home = os.homedir();
  const depth = Number(store.settings.scanDepth) || 5;
  for (const d of ['Documents/Unreal Projects', 'OneDrive/Documents/Unreal Projects', 'Documents', 'OneDrive/Documents', 'Desktop', 'OneDrive/Desktop', 'Downloads']) {
    roots.push({ dir: path.join(home, d), depth: 3 });
  }
  roots.push({ dir: home, depth: 4 });
  if (IS_WIN && store.settings.scanDrives) {
    for (let c = 67; c <= 90; c++) {
      const drive = String.fromCharCode(c) + ':\\';
      if (fs.existsSync(drive)) roots.push({ dir: drive, depth });
    }
  } else if (store.settings.scanDrives) {
    for (const base of IS_MAC ? ['/Volumes'] : ['/mnt', '/media']) roots.push({ dir: base, depth });
  }
  for (const f of store.scanFolders) roots.push({ dir: f, depth: depth + 2 });
  return roots;
}

let scanning = null;
function deepScan() {
  if (scanning) return scanning;
  scanCancel = false;
  scanStats = { dirs: 0, found: 0 };
  scanning = (async () => {
    send('scan:state', { state: 'start' });
    engineRoots = new Set(engineCache.map((e) => e.key));
    const found = new Set();
    for (const r of scanRoots()) {
      if (scanCancel) break;
      send('scan:state', { state: 'progress', dir: r.dir, dirs: scanStats.dirs, found: found.size });
      await scanFolder(r.dir, r.depth, found);
    }
    const known = new Map(store.knownProjects.map((f) => [normKey(f), f]));
    for (const f of found) known.set(normKey(f), f);
    const alive = [];
    for (const f of known.values()) if (await exists(f)) alive.push(f);
    store.knownProjects = alive;
    store.lastScan = Date.now();
    saveStore();
    const projects = await detectProjects();
    send('projects:update', { projects, engines: engineCache, lastScan: store.lastScan });
    send('scan:state', { state: 'end', count: projects.length, cancelled: scanCancel, dirs: scanStats.dirs });
  })().finally(() => { scanning = null; });
  return scanning;
}

const IMG_RE = /\.(png|jpe?g|bmp)$/i;
const thumbDir = () => userFile('Cache', 'thumbs');

// URL the renderer loads; the image is resized once and kept on disk, so nothing big lives in RAM.
async function thumbRef(file, width = 640, mtime) {
  try {
    if (mtime === undefined) {
      const st = await fsp.stat(file);
      if (!st.size || st.size > 40 * 1024 * 1024) return null;
      mtime = st.mtimeMs;
    }
    return `uh://thumb/?p=${encodeURIComponent(file)}&w=${width}&v=${Math.round(mtime)}`;
  } catch { return null; }
}
async function cachedThumb(file, width, v) {
  const out = path.join(thumbDir(), `${hash(file + '|' + v + '|' + width)}.jpg`);
  if (await exists(out)) return out;
  let img = nativeImage.createFromPath(file);
  if (img.isEmpty()) return null;
  if (img.getSize().width > width) img = img.resize({ width, quality: 'good' });
  await fsp.mkdir(thumbDir(), { recursive: true });
  await fsp.writeFile(out, img.toJPEG(86));
  return out;
}
function registerThumbProtocol() {
  protocol.handle('uh', async (req) => {
    try {
      const u = new URL(req.url);
      const file = u.searchParams.get('p') || '';
      if (u.host !== 'thumb' || !IMG_RE.test(file)) return new Response(null, { status: 404 });
      const width = Math.min(1280, Math.max(64, Number(u.searchParams.get('w')) || 640));
      const out = await cachedThumb(file, width, u.searchParams.get('v') || '');
      return out ? net.fetch(pathToFileURL(out).toString()) : new Response(null, { status: 404 });
    } catch { return new Response(null, { status: 404 }); }
  });
}
// Drop cached thumbnails not used for a month.
async function pruneThumbs() {
  let files = [];
  try { files = await fsp.readdir(thumbDir()); } catch { return; }
  const old = Date.now() - 30 * 86400000;
  for (const f of files) {
    const fp = path.join(thumbDir(), f);
    try { if ((await fsp.stat(fp)).atimeMs < old) await fsp.rm(fp, { force: true }); } catch {}
  }
}

async function newestImage(dir, depth = 2) {
  let best = null, entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return null; }
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory() && depth > 0) {
      const c = await newestImage(fp, depth - 1);
      if (c && (!best || c.t > best.t)) best = c;
    } else if (/\.(png|jpe?g|bmp)$/i.test(e.name)) {
      try { const st = await fsp.stat(fp); if (!best || st.mtimeMs > best.t) best = { f: fp, t: st.mtimeMs }; } catch {}
    }
  }
  return best;
}

async function thumbFile(dir, name, entries, meta) {
  if (meta.thumbPath && await exists(meta.thumbPath)) return meta.thumbPath;
  const cands = [path.join(dir, name + '.png'), path.join(dir, 'Saved', 'AutoScreenshot.png')];
  for (const e of entries) if (/\.(png|jpe?g)$/i.test(e)) cands.push(path.join(dir, e));
  for (const c of cands) if (await exists(c)) return c;
  const shot = await newestImage(path.join(dir, 'Saved', 'Screenshots'));
  return shot ? shot.f : null;
}

function writeIco(srcImage, out) {
  let img = srcImage;
  const { width, height } = img.getSize();
  const side = Math.min(width, height);
  img = img.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side });
  const sizes = [256, 64, 48, 32, 16];
  const pngs = sizes.map((s) => img.resize({ width: s, height: s, quality: 'best' }).toPNG());
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  const dir = Buffer.alloc(16 * sizes.length);
  let offset = 6 + dir.length;
  sizes.forEach((s, i) => {
    const o = i * 16;
    dir.writeUInt8(s >= 256 ? 0 : s, o); dir.writeUInt8(s >= 256 ? 0 : s, o + 1);
    dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(pngs[i].length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += pngs[i].length;
  });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.concat([header, dir, ...pngs]));
  return out;
}

function placeholderImage(name) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  const size = 256, buf = Buffer.alloc(size * size * 4);
  const hsl = (H, S, L) => { const a = S * Math.min(L, 1 - L); const f = (n) => { const k = (n + H / 30) % 12; return L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)].map((x) => Math.round(x * 255)); };
  const c1 = hsl(h, 0.45, 0.45), c2 = hsl((h + 45) % 360, 0.5, 0.2);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const t = (x + y) / (2 * size), i = (y * size + x) * 4;
    buf[i] = c1[2] + (c2[2] - c1[2]) * t; buf[i + 1] = c1[1] + (c2[1] - c1[1]) * t; buf[i + 2] = c1[0] + (c2[0] - c1[0]) * t; buf[i + 3] = 255;
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

let projectCache = [];

async function gitInfo(dir) {
  try {
    const head = (await fsp.readFile(path.join(dir, '.git', 'HEAD'), 'utf8')).trim();
    const m = head.match(/ref: refs\/heads\/(.+)$/);
    return { branch: m ? m[1] : head.slice(0, 7) };
  } catch { return null; }
}

async function readProject(file) {
  const dir = path.dirname(file);
  const name = path.basename(file, '.uproject');
  let j;
  try { j = await readJson(file); } catch { return null; }
  const st = await fsp.stat(file).catch(() => null);
  if (!st) return null;

  let entries = [];
  try { entries = await fsp.readdir(dir); } catch {}
  const lower = entries.map((e) => e.toLowerCase());
  const hasSource = lower.includes('source');
  const sln = entries.find((e) => /\.(sln|slnx)$/i.test(e));
  const xcode = entries.find((e) => e.toLowerCase().endsWith('.xcworkspace'));
  const vscode = entries.find((e) => e.toLowerCase().endsWith('.code-workspace'));

  const key = normKey(file);
  const meta = store.meta[key] || {};
  const tf = await thumbFile(dir, name, entries, meta);

  let modified = st.mtimeMs;
  for (const sub of ['Saved', 'Content', 'Config']) {
    try { const s = await fsp.stat(path.join(dir, sub)); modified = Math.max(modified, s.mtimeMs); } catch {}
  }

  return {
    key, file, dir, name,
    association: j.EngineAssociation || '',
    description: j.Description || '',
    category: j.Category || '',
    isCpp: (Array.isArray(j.Modules) && j.Modules.length > 0) || hasSource,
    modules: (j.Modules || []).map((m) => ({ name: m.Name, type: m.Type || '', phase: m.LoadingPhase || '' })),
    plugins: (j.Plugins || []).filter((p) => p.Enabled).map((p) => p.Name),
    targetPlatforms: j.TargetPlatforms || [],
    hasLocalPlugins: lower.includes('plugins'),
    hasSln: !!(sln || xcode || vscode),
    sln: sln ? path.join(dir, sln) : xcode ? path.join(dir, xcode) : vscode ? path.join(dir, vscode) : null,
    git: lower.includes('.git') ? await gitInfo(dir) : null,
    created: st.birthtimeMs || st.ctimeMs,
    modified,
    thumb: tf ? await thumbRef(tf, 640) : null,
    thumbFile: tf,
    customThumb: !!meta.thumbPath,
    favorite: !!meta.favorite,
    pinned: !!meta.pinned,
    tags: meta.tags || [],
    notes: meta.notes || '',
    color: meta.color || '',
    alias: meta.alias || '',
    engineKey: meta.engineKey || '',
    args: meta.args || '',
    lastLaunched: meta.lastLaunched || 0,
    launchCount: meta.launchCount || 0,
    playTime: meta.playTime || 0,
    size: meta.size || 0,
    sizeAt: meta.sizeAt || 0
  };
}

async function detectProjects() {
  const files = new Set();
  for (const f of await recentProjects()) files.add(path.resolve(f));
  for (const f of store.extraProjects) files.add(path.resolve(f));
  for (const f of store.knownProjects) files.add(path.resolve(f));
  const hidden = new Set(store.hiddenProjects);
  const seen = new Set();
  const list = [];
  for (const f of files) {
    const k = normKey(f);
    if (hidden.has(k) || seen.has(k)) continue;
    seen.add(k);
    list.push(f);
  }
  const out = [];
  for (let i = 0; i < list.length; i += 12) {
    const batch = await Promise.all(list.slice(i, i + 12).map(async (f) => ((await exists(f)) ? readProject(f) : null)));
    for (const p of batch) if (p) out.push(p);
  }
  projectCache = out;
  if (pendingLaunch) { const f = pendingLaunch; pendingLaunch = null; f(); }
  updateTray();
  updateJumpList();
  return out;
}

// Read-modify-write of a .uproject, keeping the previous version as .uproject.bak.
async function editUproject(p, fn) {
  let raw = await fsp.readFile(p.file, 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const j = JSON.parse(raw);
  await fsp.writeFile(p.file + '.bak', raw);
  fn(j);
  await fsp.writeFile(p.file, JSON.stringify(j, null, '\t'));
  return j;
}

/* ------------------------------------------------------------------ Plugins */
const PLUGIN_SKIP = new Set(['content', 'source', 'binaries', 'intermediate', 'resources', 'config', 'shaders', 'thirdparty', 'saved', 'docs']);
async function findUplugins(dir, depth, out) {
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return out; }
  const up = entries.find((e) => e.isFile() && e.name.toLowerCase().endsWith('.uplugin'));
  if (up) { out.push(path.join(dir, up.name)); return out; }
  if (depth <= 0) return out;
  await Promise.all(entries.filter((e) => e.isDirectory() && !PLUGIN_SKIP.has(e.name.toLowerCase()))
    .map((e) => findUplugins(path.join(dir, e.name), depth - 1, out)));
  return out;
}
async function readPlugins(root, source) {
  const list = [];
  for (const f of await findUplugins(root, 6, [])) {
    let j;
    try { j = await readJson(f); } catch { continue; }
    list.push({
      name: path.basename(f, '.uplugin'),
      friendly: j.FriendlyName || '',
      desc: j.Description || '',
      category: j.Category || '',
      version: j.VersionName || '',
      engineVersion: j.EngineVersion || '',
      byDefault: j.EnabledByDefault,
      beta: !!j.IsBetaVersion,
      experimental: !!j.IsExperimentalVersion,
      deps: (j.Plugins || []).filter((d) => d && d.Name && d.Enabled !== false).map((d) => d.Name),
      source: source === 'engine' && /\/plugins\/marketplace\//.test(normKey(f)) ? 'fab' : source
    });
  }
  return list;
}
// An engine ships hundreds of plugins: read them once per engine.
const enginePluginCache = new Map();
function enginePlugins(e) {
  if (!enginePluginCache.has(e.key)) enginePluginCache.set(e.key, readPlugins(path.join(e.root, 'Engine', 'Plugins'), 'engine'));
  return enginePluginCache.get(e.key);
}
const majorMinor = (v) => String(v || '').split('.').slice(0, 2).join('.');

async function projectPlugins(p) {
  const j = await readJson(p.file);
  const refs = new Map((j.Plugins || []).filter((x) => x && x.Name).map((x) => [x.Name.toLowerCase(), x]));
  const e = engineFor(p);
  const all = new Map();
  for (const pl of e ? await enginePlugins(e) : []) all.set(pl.name.toLowerCase(), pl);
  for (const pl of await readPlugins(path.join(p.dir, 'Plugins'), 'project')) all.set(pl.name.toLowerCase(), pl); // a project copy wins over the engine one
  const ev = e ? majorMinor(e.version) : '';
  const out = [];
  for (const [k, pl] of all) {
    const ref = refs.get(k);
    // Unreal's rule: project plugins are on unless they opt out, engine plugins are off unless they opt in.
    const def = pl.source === 'project' ? pl.byDefault !== false : pl.byDefault === true;
    const enabled = ref ? ref.Enabled !== false : def;
    const pv = majorMinor(pl.engineVersion);
    out.push({ ...pl, enabled, explicit: !!ref, issues: enabled && ev && pv && pv !== ev ? ['version:' + pv] : [] });
  }
  for (const [k, ref] of refs) {
    if (all.has(k) || ref.Enabled === false) continue;
    out.push({ name: ref.Name, friendly: '', desc: '', category: '', version: '', deps: [], source: 'missing', enabled: true, explicit: true, issues: e ? ['missing'] : [] });
  }
  if (e) {
    const names = new Set(out.map((x) => x.name.toLowerCase()));
    for (const pl of out) if (pl.enabled) for (const d of pl.deps) if (!names.has(d.toLowerCase())) pl.issues.push('dep:' + d);
  }
  out.sort((a, b) => (a.friendly || a.name).localeCompare(b.friendly || b.name));
  return { engine: e ? e.version : '', engineMissing: !e, running: running.has(p.key), plugins: out, names: p.plugins };
}

async function setProjectPlugin(p, name, enabled) {
  const j = await editUproject(p, (j) => {
    j.Plugins = Array.isArray(j.Plugins) ? j.Plugins : [];
    const ref = j.Plugins.find((x) => x && x.Name && x.Name.toLowerCase() === name.toLowerCase());
    if (ref) ref.Enabled = enabled;
    else j.Plugins.push({ Name: name, Enabled: enabled });
  });
  p.plugins = j.Plugins.filter((x) => x.Enabled).map((x) => x.Name);
  return projectPlugins(p);
}

const getProject = (key) => {
  const p = projectCache.find((x) => x.key === key);
  if (!p) throw new Error('Project not found. Try refreshing.');
  return p;
};
function setMeta(key, patch) {
  store.meta[key] = { ...(store.meta[key] || {}), ...patch };
  saveStore();
  const p = projectCache.find((x) => x.key === key);
  if (p) Object.assign(p, patch);
}

const tasks = new Map();
let taskSeq = 0;
const send = (ch, msg) => { if (win && !win.isDestroyed()) win.webContents.send(ch, msg); };
const sendTask = (msg) => send('task:update', msg);

function startTask(title, project, command, args, opts = {}) {
  const id = ++taskSeq;
  const task = { id, title, kind: opts.kind || 'generic', project: project ? project.name : '', projectKey: project ? project.key : '', status: 'running', log: '', started: Date.now(), ended: 0, code: null };
  tasks.set(id, task);
  sendTask({ type: 'start', task: { ...task } });
  const { onDone, kind, ...spawnOpts } = opts;
  let child;
  try { child = spawn(command, args, { windowsHide: true, ...spawnOpts }); }
  catch (err) { task.status = 'failed'; task.log = err.message; sendTask({ type: 'end', id, status: 'failed', code: -1 }); return id; }
  task.pid = child.pid;
  const onData = (d) => {
    const chunk = d.toString();
    task.log += chunk;
    if (task.log.length > 300000) task.log = task.log.slice(-250000);
    sendTask({ type: 'log', id, chunk });
  };
  child.stdout && child.stdout.on('data', onData);
  child.stderr && child.stderr.on('data', onData);
  child.on('error', (err) => onData(`\n[error] ${err.message}\n`));
  child.on('close', (code) => {
    if (task.status === 'running') task.status = code === 0 ? 'done' : 'failed';
    task.code = code;
    task.ended = Date.now();
    sendTask({ type: 'end', id, status: task.status, code });
    if (task.status !== 'cancelled' && (!win || !win.isFocused())) notify(`Unreal Hub · ${task.project}`, `${task.title}: ${task.status === 'done' ? '✓' : '✗'}`);
    if (onDone) onDone(task);
  });
  task.kill = () => {
    task.status = 'cancelled';
    if (IS_WIN) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    else child.kill('SIGTERM');
  };
  return id;
}
const q = (s) => `"${s}"`;

const CLEAN_TARGETS = [
  { id: 'intermediate', paths: ['Intermediate'], plugins: 'Intermediate', def: true },
  { id: 'ddc', paths: ['DerivedDataCache'], def: true },
  { id: 'logs', paths: ['Saved/Logs', 'Saved/Crashes'], def: true },
  { id: 'staged', paths: ['Saved/Cooked', 'Saved/StagedBuilds'], def: true },
  { id: 'vs', paths: ['.vs'], def: true },
  { id: 'shaders', paths: ['Saved/ShaderDebugInfo'], def: true },
  { id: 'binaries', paths: ['Binaries'], plugins: 'Binaries', def: false },
  { id: 'autosaves', paths: ['Saved/Autosaves'], def: false }
];
async function targetPaths(project, t) {
  const list = t.paths.map((p) => path.join(project.dir, p));
  if (t.plugins) {
    let plugins = [];
    try { plugins = await fsp.readdir(path.join(project.dir, 'Plugins'), { withFileTypes: true }); } catch {}
    for (const pl of plugins) if (pl.isDirectory()) list.push(path.join(project.dir, 'Plugins', pl.name, t.plugins));
  }
  return list;
}

// Without its own AppUserModelID, Windows ties every UnrealEditor.exe window to whichever project shortcut
// targets that exe, so the taskbar shows that project's picture for every project and for the engine itself.
const shortcutAumid = (key, mode) => `UnrealHub.Project.${hash(key)}${mode === 'game' ? '.Game' : ''}`;

// Give shortcuts made by older versions their own AppUserModelID (runs once).
async function repairShortcuts() {
  if (!IS_WIN || store.shortcutsRepaired) return;
  const iconDir = normKey(userFile('icons'));
  const dirs = [app.getPath('desktop'), path.join(process.env.PUBLIC || 'C:/Users/Public', 'Desktop'),
    path.join(app.getPath('appData'), 'Microsoft/Windows/Start Menu/Programs')];
  for (const dir of dirs) {
    let files = [];
    try { files = (await fsp.readdir(dir)).filter((f) => f.toLowerCase().endsWith('.lnk')); } catch {}
    for (const f of files) {
      const lnk = path.join(dir, f);
      try {
        const s = shell.readShortcutLink(lnk);
        if (!s.icon || !normKey(s.icon).startsWith(iconDir) || s.appUserModelId) continue;
        const m = (s.args || '').match(/"([^"]+\.uproject)"/i) || [null, s.target];
        const key = normKey(m[1] || lnk);
        shell.writeShortcutLink(lnk, 'update', { appUserModelId: shortcutAumid(key, /\s-game\b/.test(s.args || '') ? 'game' : '') });
      } catch {}
    }
  }
  store.shortcutsRepaired = true;
  saveStore();
}

async function createShortcut(p, opts = {}) {
  const e = engineFor(p, opts.engineKey);
  const desktop = opts.dir || app.getPath('desktop');
  const label = safeName(p.alias || p.name);
  const iconDir = userFile('icons');
  const src = p.thumbFile ? nativeImage.createFromPath(p.thumbFile) : null;
  const image = src && !src.isEmpty() ? src : placeholderImage(p.name);
  const extra = splitArgs(opts.args || p.args || '').map((a) => (/\s/.test(a) ? q(a) : a)).join(' ');
  const gameArgs = opts.mode === 'game' ? ' -game -log' : '';

  if (IS_WIN) {
    const ico = writeIco(image, path.join(iconDir, hash(p.key) + '.ico'));
    const lnk = path.join(desktop, `${label}${opts.mode === 'game' ? ' (Game)' : ''}.lnk`);
    const useEditor = e && store.settings.shortcutTarget !== 'uproject';
    const ok = shell.writeShortcutLink(lnk, fs.existsSync(lnk) ? 'replace' : 'create', {
      target: useEditor ? e.exe : p.file,
      args: useEditor ? `${q(p.file)}${gameArgs}${extra ? ' ' + extra : ''}` : '',
      cwd: p.dir,
      description: `Unreal Engine project - ${p.name}${e ? ' (UE ' + e.version + ')' : ''}`,
      icon: ico, iconIndex: 0,
      appUserModelId: shortcutAumid(p.key, opts.mode)
    });
    if (!ok) throw new Error('Windows refused to create the shortcut.');
    return lnk;
  }
  const png = path.join(iconDir, hash(p.key) + '.png');
  fs.mkdirSync(iconDir, { recursive: true });
  fs.writeFileSync(png, image.resize({ width: 256 }).toPNG());
  if (IS_MAC) {
    const f = path.join(desktop, `${label}.command`);
    const cmd = e ? `"${e.exe}" "${p.file}"${gameArgs} ${extra}` : `open "${p.file}"`;
    fs.writeFileSync(f, `#!/bin/bash\n${cmd} &\n`, { mode: 0o755 });
    return f;
  }
  const f = path.join(desktop, `${label}.desktop`);
  const cmd = e ? `"${e.exe}" "${p.file}"${gameArgs} ${extra}` : `xdg-open "${p.file}"`;
  fs.writeFileSync(f, `[Desktop Entry]\nType=Application\nName=${label}\nComment=Unreal Engine project\nExec=${cmd}\nIcon=${png}\nTerminal=false\n`, { mode: 0o755 });
  return f;
}


const running = new Map();
function killTree(pid) {
  if (IS_WIN) spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
  else try { process.kill(pid, 'SIGTERM'); } catch {}
}
function notify(title, body) {
  if (!store.settings.notifications || !Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: path.join(__dirname, 'assets', 'icon.png'), silent: false });
  n.on('click', showWindow);
  n.show();
}
function launchProject(key, opts = {}) {
  const p = getProject(key);
  const e = engineFor(p, opts.engineKey);
  if (!e) throw new Error(`NO_ENGINE:${p.association || '?'}`);
  const args = [p.file];
  if (opts.mode === 'game') args.push('-game', '-log');
  args.push(...splitArgs(opts.args ?? (p.args || store.settings.defaultArgs)));
  const child = spawn(e.exe, args, { detached: true, stdio: 'ignore', cwd: p.dir });
  const start = Date.now();
  running.set(key, { pid: child.pid, start });
  child.on('exit', () => {
    running.delete(key);
    const end = Date.now();
    if (end - start > 5000) {
      store.sessions.push({ key, start, end });
      if (store.sessions.length > 4000) store.sessions = store.sessions.slice(-4000);
      setMeta(key, { playTime: ((store.meta[key] || {}).playTime || 0) + (end - start) });
    }
    send('running:update', { running: [...running.keys()], sessions: store.sessions, key, playTime: (store.meta[key] || {}).playTime || 0 });
    updateTray();
  });
  child.on('error', () => running.delete(key));
  child.unref();
  setMeta(key, { lastLaunched: start, launchCount: (p.launchCount || 0) + 1 });
  store.history.push({ key, t: start });
  if (store.history.length > 5000) store.history = store.history.slice(-5000);
  saveStore();
  send('running:update', { running: [...running.keys()], sessions: store.sessions });
  updateTray();
  updateJumpList();
  if (store.settings.minimizeOnLaunch && win) win.minimize();
  return { engine: e.version, history: store.history };
}
async function screenshots(p) {
  const out = [];
  const walk = async (dir, depth) => {
    let entries = [];
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const fp = path.join(dir, e.name);
      if (e.isDirectory() && depth > 0) await walk(fp, depth - 1);
      else if (/\.(png|jpe?g|bmp)$/i.test(e.name)) { try { out.push({ file: fp, t: (await fsp.stat(fp)).mtimeMs }); } catch {} }
    }
  };
  await walk(path.join(p.dir, 'Saved', 'Screenshots'), 3);
  await walk(path.join(p.dir, 'Saved', 'AutoScreenshot.png').replace(/AutoScreenshot\.png$/, ''), 0);
  try { for (const f of await fsp.readdir(p.dir)) if (/\.(png|jpe?g)$/i.test(f)) out.push({ file: path.join(p.dir, f), t: (await fsp.stat(path.join(p.dir, f))).mtimeMs }); } catch {}
  const seen = new Set();
  const list = out.sort((a, b) => b.t - a.t).filter((x) => !seen.has(x.file) && seen.add(x.file)).slice(0, 48);
  return (await Promise.all(list.map(async (x) => ({ ...x, url: await thumbRef(x.file, 420, x.t) })))).filter((x) => x.url);
}

let tray = null, quitting = false;
function showWindow() {
  if (!app.isReady()) return;
  if (!win || win.isDestroyed()) { createWindow(true); return; }
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}
function recentForMenus(n) {
  return [...projectCache].filter((p) => p.lastLaunched).sort((a, b) => b.lastLaunched - a.lastLaunched).slice(0, n);
}
function trText(k) {
  const es = store.settings.language === 'es';
  return ({ open: es ? 'Abrir Unreal Hub' : 'Open Unreal Hub', recent: es ? 'Recientes' : 'Recent projects', scan: es ? 'Escanear discos' : 'Scan drives', quit: es ? 'Salir' : 'Quit', running: es ? 'abierto' : 'running', none: es ? 'Sin proyectos recientes' : 'No recent projects' })[k];
}
function updateTray() {
  if (!tray) return;
  const rec = recentForMenus(8);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: trText('open'), click: showWindow },
    { type: 'separator' },
    { label: trText('recent'), enabled: false },
    ...(rec.length ? rec.map((p) => ({ label: (p.alias || p.name) + (running.has(p.key) ? `  (${trText('running')})` : ''), click: () => { try { launchProject(p.key); } catch (e) { notify('Unreal Hub', e.message); } } })) : [{ label: trText('none'), enabled: false }]),
    { type: 'separator' },
    { label: trText('scan'), click: () => deepScan() },
    { label: trText('quit'), click: () => { quitting = true; app.quit(); } }
  ]));
}
function createTray() {
  try {
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', IS_WIN ? 'icon.ico' : 'icon.png')).resize({ width: 16, height: 16 }));
    tray.setToolTip('Unreal Hub');
    tray.on('click', showWindow);
    updateTray();
  } catch {}
}
function updateJumpList() {
  if (!IS_WIN) return;
  const base = app.isPackaged ? [] : [`"${app.getAppPath()}"`];
  try {
    app.setUserTasks(recentForMenus(6).map((p) => ({
      program: process.execPath,
      arguments: [...base, '--launch', `"${p.file}"`].join(' '),
      iconPath: process.execPath, iconIndex: 0,
      title: p.alias || p.name,
      description: p.file
    })));
  } catch {}
}
let pendingLaunch = null;
function handleArgv(argv) {
  const i = argv.indexOf('--launch');
  if (i < 0 || !argv[i + 1]) return false;
  const file = argv[i + 1].replace(/^"|"$/g, '');
  const go = () => {
    const p = projectCache.find((x) => x.key === normKey(file));
    if (p) { try { launchProject(p.key); notify('Unreal Hub', (store.settings.language === 'es' ? 'Abriendo ' : 'Launching ') + (p.alias || p.name)); } catch (e) { notify('Unreal Hub', e.message); } }
  };
  if (projectCache.length) go(); else pendingLaunch = go;
  return true;
}

/* ------------------------------------------------------------------ Fab limited-time free assets */
const FAB_BLADE = 'https://www.fab.com/i/blades/free_content_blade';
const FAB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
let fabPending = null;

function fabItem(l) {
  const lic = (l.licenses || []).find((x) => x.priceTier && x.priceTier.discountEndDate) || (l.licenses || [])[0] || {};
  const tier = lic.priceTier || {};
  const imgs = ((l.thumbnails || [])[0] || {}).images || [];
  const img = [...imgs].sort((a, b) => a.width - b.width).find((i) => i.width >= 480) || imgs[imgs.length - 1];
  return {
    uid: l.uid,
    title: l.title || '',
    seller: (l.user && l.user.sellerName) || '',
    type: l.listingType || '',
    rating: l.averageRating || 0,
    reviews: l.reviewCount || 0,
    price: tier.price ?? (l.startingPrice && l.startingPrice.price) ?? 0,
    currency: tier.currencyCode || 'USD',
    end: Date.parse(tier.discountEndDate || '') || 0,
    image: img ? img.url : '',
    url: `https://www.fab.com/listings/${l.uid}`
  };
}
// Cached until the giveaway ends (or 6 h), so the network is touched rarely.
function fabFree(force = false) {
  const c = store.fab, now = Date.now();
  if (!force && c && c.items && c.items.length && now < c.end && now - c.fetched < 6 * 3600000) return Promise.resolve(c);
  if (fabPending) return fabPending;
  fabPending = (async () => {
    try {
      const r = await net.fetch(FAB_BLADE, { headers: { 'User-Agent': FAB_UA, Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const items = (j.tiles || []).map((x) => x.listing).filter((l) => l && l.uid).map(fabItem);
      if (!items.length) throw new Error('EMPTY');
      const ends = items.map((x) => x.end).filter(Boolean);
      store.fab = { fetched: now, end: ends.length ? Math.min(...ends) : now + 86400000, items };
      saveStore();
      return store.fab;
    } catch (err) {
      if (c && c.items && c.items.length) return { ...c, stale: true };
      throw new Error('FAB_OFFLINE');
    }
  })().finally(() => { fabPending = null; });
  return fabPending;
}

/* ------------------------------------------------------------------ Updates (GitHub Releases) */
// The repository comes from package.json "homepage"; any release whose tag is newer than this build and
// that carries a Windows .msi is offered. The MSI shares one UpgradeCode, so it replaces the installed version.
const REPO = (String(require('../package.json').homepage || '').match(/github\.com\/([^/#?]+\/[^/#?]+)/) || [])[1]?.replace(/\.git$/, '') || '';
const GH_HEADERS = () => ({ 'User-Agent': 'UnrealHub/' + app.getVersion(), Accept: 'application/vnd.github+json' });
let update = { state: 'idle' };   // idle | checking | none | available | downloading | ready | error
let release = null;               // the offered release: asset + checksum sources + downloaded file
let notifiedVersion = '';
const setUpdate = (patch) => { update = { ...update, ...patch }; send('update:state', update); };
function cmpVer(a, b) {
  const x = String(a).split(/\D+/).filter(Boolean).map(Number), y = String(b).split(/\D+/).filter(Boolean).map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
}

async function checkUpdate(manual = false) {
  if (!REPO) throw new Error('NO_REPO');
  if (['checking', 'downloading', 'ready'].includes(update.state)) return update;
  setUpdate({ state: 'checking', error: '' });
  try {
    const r = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: GH_HEADERS() });
    if (r.status === 404) { setUpdate({ state: 'none', checked: Date.now() }); return update; } // no release published yet
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const rel = await r.json();
    const version = String(rel.tag_name || '').replace(/^v/i, '');
    const assets = rel.assets || [];
    const msi = assets.filter((a) => /\.msi$/i.test(a.name)).sort((a, b) => /setup/i.test(b.name) - /setup/i.test(a.name))[0];
    store.updateChecked = Date.now();
    saveStore();
    if (!version || !msi || cmpVer(version, app.getVersion()) <= 0) { release = null; setUpdate({ state: 'none', checked: store.updateChecked }); return update; }
    release = {
      name: msi.name, url: msi.browser_download_url, body: rel.body || '',
      sums: assets.filter((a) => /sha-?256|checksum/i.test(a.name)).map((a) => a.browser_download_url)
    };
    setUpdate({ state: 'available', version, notes: (rel.body || '').slice(0, 3000), page: rel.html_url, size: msi.size, published: Date.parse(rel.published_at) || 0, checked: store.updateChecked });
    if (!manual && version !== notifiedVersion && (!win || !win.isFocused())) {
      notify('Unreal Hub', (store.settings.language === 'es' ? 'Nueva versión disponible: ' : 'Update available: ') + version);
    }
    notifiedVersion = version;
  } catch (err) {
    setUpdate({ state: 'error', error: err.message });
  }
  return update;
}

// SHA-256 published with the release: a checksum asset, or a hash in the release notes.
async function expectedSha(rel) {
  const texts = [rel.body];
  for (const u of rel.sums) { try { const r = await net.fetch(u, { headers: GH_HEADERS() }); if (r.ok) texts.push(await r.text()); } catch {} }
  const HEX = /\b[a-f0-9]{64}\b/i;
  for (const tx of texts) {
    const line = String(tx || '').split(/\r?\n/).find((l) => l.includes(rel.name) && HEX.test(l));
    if (line) return line.match(HEX)[0].toLowerCase();
  }
  const all = new Set((texts.join('\n').match(/\b[a-f0-9]{64}\b/gi) || []).map((x) => x.toLowerCase()));
  return all.size === 1 ? [...all][0] : '';
}

async function downloadUpdate() {
  if (update.state !== 'available' || !release) return update;
  const dir = userFile('Cache', 'updates');
  await fsp.rm(dir, { recursive: true, force: true });
  await fsp.mkdir(dir, { recursive: true });
  const file = path.join(dir, safeName(release.name));
  setUpdate({ state: 'downloading', pct: 0, error: '' });
  try {
    const r = await net.fetch(release.url, { headers: { 'User-Agent': GH_HEADERS()['User-Agent'] } });
    if (!r.ok || !r.body) throw new Error('HTTP ' + r.status);
    const total = Number(r.headers.get('content-length')) || update.size || 0;
    const sha = crypto.createHash('sha256');
    const out = fs.createWriteStream(file);
    let writeErr = null;
    out.on('error', (e) => { writeErr = e; });
    const reader = r.body.getReader();
    let got = 0, last = -1;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (writeErr) throw writeErr;
      const buf = Buffer.from(value);
      sha.update(buf);
      got += buf.length;
      if (!out.write(buf)) await new Promise((res) => out.once('drain', res));
      const pct = total ? Math.min(99, Math.floor((got / total) * 100)) : 0;
      if (pct !== last) { last = pct; setUpdate({ pct }); }
    }
    await new Promise((res, rej) => { out.once('error', rej); out.end(res); });
    const want = await expectedSha(release);
    if (want && want !== sha.digest('hex')) throw new Error('CHECKSUM');
    release.file = file;
    setUpdate({ state: 'ready', pct: 100, verified: !!want });
  } catch (err) {
    await fsp.rm(file, { force: true }).catch(() => {});
    setUpdate({ state: 'available', pct: 0, error: err.message });
    throw err;
  }
  return update;
}

function installUpdate() {
  if (update.state !== 'ready' || !release || !release.file) throw new Error('NOT_READY');
  if (!app.isPackaged) throw new Error('DEV_MODE');
  spawn('msiexec.exe', ['/i', release.file], { detached: true, stdio: 'ignore' }).unref();
  quitting = true;
  setTimeout(() => app.quit(), 300);
}

function scheduleUpdateChecks() {
  if (!IS_WIN || !REPO) return;
  const auto = () => { if (store.settings.autoUpdate) checkUpdate().catch(() => {}); };
  setTimeout(auto, 15000);
  setInterval(auto, 6 * 3600000);
}

async function systemIcons() {
  if (!IS_WIN) return {};
  const winDir = process.env.WINDIR || 'C:/Windows';
  const sln = projectCache.find((p) => p.sln && /\.slnx?$/i.test(p.sln));
  const [explorer, terminal, ide] = await Promise.all([
    exeIcon(path.join(winDir, 'explorer.exe')),
    exeIcon(path.join(winDir, 'System32/WindowsPowerShell/v1.0/powershell.exe')),
    sln ? app.getFileIcon(sln.sln, { size: 'large' }).then((i) => (i.isEmpty() ? '' : i.toDataURL())).catch(() => '') : ''
  ]);
  return { explorer, terminal, ide };
}

/* ------------------------------------------------------------------ IPC */
function applySystemSettings() {
  nativeTheme.themeSource = store.settings.theme || 'system';
  try { app.setLoginItemSettings({ openAtLogin: !!store.settings.openAtLogin, args: ['--hidden'] }); } catch {}
  updateTray();
}

let startupScanDone = false;
function registerIpc() {
  const h = (ch, fn) => ipcMain.handle(ch, async (_e, ...a) => {
    try { return { ok: true, data: await fn(...a) }; } catch (err) { return { ok: false, error: err.message }; }
  });

  const snapshot = async () => ({
    engines: await detectEngines(),
    projects: await detectProjects(),
    settings: store.settings,
    scanFolders: store.scanFolders,
    history: store.history,
    lastScan: store.lastScan,
    platform: process.platform,
    version: app.getVersion(),
    hidden: store.hiddenProjects.length,
    sessions: store.sessions,
    running: [...running.keys()],
    update: { ...update, checked: update.checked || store.updateChecked || 0 },
    paths:{ userData: app.getPath('userData'), desktop: app.getPath('desktop') }
  });

  h('data:load', async () => {
    const d = await snapshot();
    if (!startupScanDone && (store.settings.scanOnStartup || !store.lastScan)) { startupScanDone = true; setTimeout(deepScan, 600); }
    return d;
  });
  h('fab:free', async (force) => fabFree(!!force));
  h('update:check', async () => checkUpdate(true));
  h('update:download', async () => downloadUpdate());
  h('update:install', async () => installUpdate());
  h('icons:system', async () => systemIcons());
  h('data:refresh', async () => snapshot());
  h('scan:now', async () => { deepScan(); });
  h('scan:cancel', async () => { scanCancel = true; });

  h('project:launch', async (key, opts = {}) => launchProject(key, opts));
  h('project:stop', async (key) => { const r = running.get(key); if (r) killTree(r.pid); });
  h('project:screenshots', async (key) => screenshots(getProject(key)));
  h('project:setThumbPath', async (key, file) => { setMeta(key, { thumbPath: file }); const fresh = await readProject(getProject(key).file); Object.assign(getProject(key), fresh); return fresh; });
  h('project:commandlet', async (key, which) => {
    const p = getProject(key);
    const e = engineFor(p);
    if (!e) throw new Error('NO_ENGINE:' + p.association);
    const dir = path.dirname(e.exe);
    const cmd = [path.join(dir, 'UnrealEditor-Cmd' + (IS_WIN ? '.exe' : '')), path.join(dir, 'UE4Editor-Cmd' + (IS_WIN ? '.exe' : ''))].find((f) => fs.existsSync(f));
    if (!cmd) throw new Error('UnrealEditor-Cmd not found in this engine.');
    const args = which === 'redirectors'
      ? [p.file, '-run=ResavePackages', '-fixupredirects', '-projectonly', '-unattended', '-nopause', '-stdout']
      : [p.file, '-run=CompileAllBlueprints', '-unattended', '-nopause', '-stdout'];
    return startTask(which === 'redirectors' ? 'redirectors' : 'blueprints', p, cmd, args, { kind: 'commandlet' });
  });
  h('shell:terminal', async (dir) => {
    if (IS_WIN) spawn('powershell.exe', ['-NoExit', '-NoLogo'], { cwd: dir, detached: true, stdio: 'ignore', windowsHide: false }).unref();
    else if (IS_MAC) spawn('open', ['-a', 'Terminal', dir], { detached: true, stdio: 'ignore' }).unref();
    else spawn('x-terminal-emulator', [], { cwd: dir, detached: true, stdio: 'ignore' }).unref();
  });
  h('stats:sessions', async () => store.sessions);


  h('shell:openFolder', async (p) => { const r = await shell.openPath(p); if (r) throw new Error(r); });
  h('shell:openPath', async (p) => { const r = await shell.openPath(p); if (r) throw new Error(r); });
  h('shell:showItem', async (p) => { shell.showItemInFolder(p); });
  h('shell:external', async (url) => { if (/^(https?|com\.epicgames\.launcher):/i.test(url)) await shell.openExternal(url); });
  h('clipboard:write', async (text) => { clipboard.writeText(String(text)); });

  h('project:openIDE', async (key) => {
    const p = getProject(key);
    if (!p.sln) throw new Error('NO_SLN');
    const r = await shell.openPath(p.sln);
    if (r) throw new Error(r);
  });

  h('project:details', async (key) => {
    const p = getProject(key);
    const [content, maps, bps, logs] = await Promise.all([
      dirSize(path.join(p.dir, 'Content')),
      countFiles(path.join(p.dir, 'Content'), '.umap'),
      countFiles(path.join(p.dir, 'Content'), '.uasset'),
      (async () => { let l = []; try { l = (await fsp.readdir(path.join(p.dir, 'Saved/Logs'))).filter((f) => f.endsWith('.log')); } catch {} return l.length; })()
    ]);
    let localPlugins = [];
    try {
      for (const d of await fsp.readdir(path.join(p.dir, 'Plugins'), { withFileTypes: true })) {
        if (!d.isDirectory()) continue;
        const files = await fsp.readdir(path.join(p.dir, 'Plugins', d.name)).catch(() => []);
        const up = files.find((f) => f.endsWith('.uplugin'));
        if (up) {
          let info = {};
          try { info = await readJson(path.join(p.dir, 'Plugins', d.name, up)); } catch {}
          localPlugins.push({ name: info.FriendlyName || d.name, version: info.VersionName || '', desc: info.Description || '' });
        }
      }
    } catch {}
    return { content, maps, assets: bps, logs, localPlugins };
  });

  h('project:generate', async (key, engineKey) => {
    const p = getProject(key);
    const e = engineFor(p, engineKey);
    if (!e) throw new Error('NO_ENGINE:' + p.association);
    const ubt5 = path.join(e.root, 'Engine/Binaries/DotNET/UnrealBuildTool/UnrealBuildTool.exe');
    const ubt4 = path.join(e.root, 'Engine/Binaries/DotNET/UnrealBuildTool.exe');
    const ubt = (await exists(ubt5)) ? ubt5 : ubt4;
    if (!(await exists(ubt))) throw new Error('UnrealBuildTool not found in this engine.');
    return startTask('generate', p, ubt, ['-projectfiles', `-project=${p.file}`, '-game', '-engine', '-progress'], {
      kind: 'generate',
      onDone: async () => { const fresh = await readProject(p.file); if (fresh) { Object.assign(p, fresh); send('projects:update', { projects: projectCache }); } }
    });
  });

  h('project:build', async (key, engineKey, config = 'Development') => {
    const p = getProject(key);
    if (!p.isCpp) throw new Error('BP_ONLY');
    const e = engineFor(p, engineKey);
    if (!e) throw new Error('NO_ENGINE:' + p.association);
    const bat = path.join(e.root, IS_WIN ? 'Engine/Build/BatchFiles/Build.bat' : IS_MAC ? 'Engine/Build/BatchFiles/Mac/Build.sh' : 'Engine/Build/BatchFiles/Linux/Build.sh');
    const plat = IS_WIN ? 'Win64' : IS_MAC ? 'Mac' : 'Linux';
    return startTask('build', p, `${q(bat)} ${p.name}Editor ${plat} ${config} -Project=${q(p.file)} -WaitMutex -FromMsBuild`, [], { shell: true, kind: 'build' });
  });

  h('project:package', async (key, engineKey, opts = {}) => {
    const p = getProject(key);
    const e = engineFor(p, engineKey);
    if (!e) throw new Error('NO_ENGINE:' + p.association);
    let outDir = opts.outDir || store.settings.packageDir;
    if (!outDir) {
      const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
      if (r.canceled) return null;
      outDir = r.filePaths[0];
    }
    const uat = path.join(e.root, IS_WIN ? 'Engine/Build/BatchFiles/RunUAT.bat' : 'Engine/Build/BatchFiles/RunUAT.sh');
    if (!(await exists(uat))) throw new Error('RunUAT not found in this engine.');
    const platform = opts.platform || 'Win64';
    const config = opts.config || 'Shipping';
    const args = ['BuildCookRun', '-nop4', '-utf8output', `-project=${q(p.file)}`, `-platform=${platform}`, `-clientconfig=${config}`,
      '-build', '-cook', '-stage', '-pak', '-archive', `-archivedirectory=${q(outDir)}`, '-prereqs'];
    if (!p.isCpp) args.push('-nocompileeditor', '-skipbuildeditor');
    if (opts.allMaps !== false) args.push('-allmaps');
    if (config === 'Shipping') args.push('-nodebuginfo');
    if (opts.compressed) args.push('-compressed');
    if (opts.iostore) args.push('-iostore');
    return startTask('package', p, `${q(uat)} ${args.join(' ')}`, [], { shell: true, kind: 'package', onDone: (t) => { if (t.status === 'done') shell.openPath(outDir); } });
  });

  h('project:backup', async (key) => {
    const p = getProject(key);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const r = await dialog.showSaveDialog(win, {
      defaultPath: path.join(store.settings.backupDir || path.dirname(p.dir), `${p.name}_${stamp}.zip`),
      filters: [{ name: 'Zip', extensions: ['zip'] }]
    });
    if (r.canceled) return null;
    const parent = path.dirname(p.dir), folder = path.basename(p.dir);
    const ex = ['Intermediate', 'DerivedDataCache', 'Saved', 'Binaries', '.vs', '.git'];
    if (IS_WIN) {
      const args = ['-a', '-c', '-v', '-f', r.filePath];
      for (const x of ex) args.push(`--exclude=${folder}/${x}`, `--exclude=${folder}/Plugins/*/${x}`);
      args.push('-C', parent, folder);
      return startTask('backup', p, 'tar', args, { kind: 'backup', onDone: (t) => { if (t.status === 'done') shell.showItemInFolder(r.filePath); } });
    }
    const args = ['-r', r.filePath, folder];
    for (const x of ex) args.push('-x', `${folder}/${x}/*`, `${folder}/Plugins/*/${x}/*`);
    return startTask('backup', p, 'zip', args, { cwd: parent, kind: 'backup' });
  });

  h('project:duplicate', async (key, newName) => {
    const p = getProject(key);
    newName = safeName(newName).replace(/\s+/g, '');
    if (!/^[A-Za-z][A-Za-z0-9_]{0,19}$/.test(newName)) throw new Error('BAD_NAME');
    const dest = path.join(path.dirname(p.dir), newName);
    if (await exists(dest)) throw new Error('EXISTS');
    const skip = new Set(['intermediate', 'deriveddatacache', 'saved', 'binaries', '.vs', '.git']);
    await fsp.cp(p.dir, dest, { recursive: true, filter: (src) => {
      const rel = path.relative(p.dir, src).split(path.sep);
      return !(rel[0] && skip.has(rel[0].toLowerCase())) && !(rel[0] === 'Plugins' && rel[2] && skip.has(rel[2].toLowerCase()));
    } });
    const oldUp = path.join(dest, p.name + '.uproject');
    const newUp = path.join(dest, newName + '.uproject');
    await fsp.rename(oldUp, newUp);
    for (const f of await fsp.readdir(dest)) if (/\.(sln|slnx)$/i.test(f)) await fsp.rm(path.join(dest, f), { force: true });
    if (await exists(path.join(dest, p.name + '.png'))) await fsp.rename(path.join(dest, p.name + '.png'), path.join(dest, newName + '.png'));
    store.extraProjects.push(newUp);
    saveStore();
    return { file: newUp, cpp: p.isCpp };
  });

  h('project:analyze', async (key) => {
    const p = getProject(key);
    const total = await dirSize(p.dir);
    const content = await dirSize(path.join(p.dir, 'Content'));
    const targets = [];
    for (const t of CLEAN_TARGETS) {
      let size = 0;
      for (const tp of await targetPaths(p, t)) size += await dirSize(tp);
      targets.push({ id: t.id, size, def: t.def && !(t.id === 'binaries' && p.isCpp) });
    }
    setMeta(key, { size: total, sizeAt: Date.now() });
    return { total, content, targets };
  });

  h('project:clean', async (key, ids) => {
    const p = getProject(key);
    let freed = 0;
    for (const t of CLEAN_TARGETS.filter((x) => ids.includes(x.id))) {
      for (const tp of await targetPaths(p, t)) {
        const s = await dirSize(tp);
        try { await fsp.rm(tp, { recursive: true, force: true }); freed += s; } catch {}
      }
    }
    if (p.size) setMeta(key, { size: Math.max(0, p.size - freed), sizeAt: Date.now() });
    return { freed };
  });

  h('project:setEngine', async (key, engineKey) => {
    const p = getProject(key);
    const e = engineCache.find((x) => x.key === engineKey);
    if (!e) throw new Error('Engine not found.');
    await editUproject(p, (j) => { j.EngineAssociation = e.association; });
    p.association = e.association;
    setMeta(key, { engineKey: '' });
    return { association: e.association };
  });

  h('project:meta', async (key, patch) => { setMeta(key, patch); });
  h('project:plugins', async (key, force) => { if (force) enginePluginCache.clear(); return projectPlugins(getProject(key)); });
  h('project:setPlugin', async (key, name, enabled) => setProjectPlugin(getProject(key), String(name), !!enabled));

  h('project:pickThumb', async (key) => {
    const r = await dialog.showOpenDialog(win, { filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp'] }], properties: ['openFile'] });
    if (r.canceled) return null;
    setMeta(key, { thumbPath: r.filePaths[0] });
    const fresh = await readProject(getProject(key).file);
    Object.assign(getProject(key), fresh);
    return fresh;
  });
  h('project:resetThumb', async (key) => {
    setMeta(key, { thumbPath: '' });
    const fresh = await readProject(getProject(key).file);
    Object.assign(getProject(key), fresh);
    return fresh;
  });

  h('project:shortcut', async (key, opts) => createShortcut(getProject(key), opts || {}));

  h('project:unhideAll', async () => { store.hiddenProjects = []; saveStore(); return snapshot(); });
  h('project:hide', async (key) => {
    if (!store.hiddenProjects.includes(key)) store.hiddenProjects.push(key);
    store.extraProjects = store.extraProjects.filter((f) => normKey(f) !== key);
    saveStore();
    projectCache = projectCache.filter((p) => p.key !== key);
  });
  h('project:trash', async (key) => {
    const p = getProject(key);
    await shell.trashItem(p.dir);
    store.knownProjects = store.knownProjects.filter((f) => normKey(f) !== key);
    store.extraProjects = store.extraProjects.filter((f) => normKey(f) !== key);
    delete store.meta[key];
    saveStore();
    projectCache = projectCache.filter((x) => x.key !== key);
  });

  const addPaths = async (paths) => {
    let added = 0;
    for (let f of paths) {
      try {
        const st = await fsp.stat(f);
        if (st.isDirectory()) {
          const up = (await fsp.readdir(f)).find((x) => x.toLowerCase().endsWith('.uproject'));
          if (!up) { if (!store.scanFolders.includes(f)) store.scanFolders.push(f); continue; }
          f = path.join(f, up);
        }
      } catch { continue; }
      if (!f.toLowerCase().endsWith('.uproject')) continue;
      const k = normKey(f);
      store.hiddenProjects = store.hiddenProjects.filter((x) => x !== k);
      if (!store.extraProjects.some((x) => normKey(x) === k)) { store.extraProjects.push(f); added++; }
    }
    saveStore();
    return { added, ...(await snapshot()) };
  };
  h('project:add', async () => {
    const r = await dialog.showOpenDialog(win, { filters: [{ name: 'Unreal Project', extensions: ['uproject'] }], properties: ['openFile', 'multiSelections'] });
    if (r.canceled) return null;
    return addPaths(r.filePaths);
  });
  h('project:addPaths', async (paths) => addPaths(paths || []));

  h('folders:add', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (r.canceled) return null;
    if (!store.scanFolders.includes(r.filePaths[0])) store.scanFolders.push(r.filePaths[0]);
    saveStore();
    deepScan();
    return { scanFolders: store.scanFolders };
  });
  h('folders:remove', async (p) => {
    store.scanFolders = store.scanFolders.filter((x) => x !== p);
    saveStore();
    return { scanFolders: store.scanFolders };
  });

  h('engine:launch', async (engineKey) => {
    const e = engineCache.find((x) => x.key === engineKey);
    if (!e) throw new Error('Engine not found.');
    spawn(e.exe, [], { detached: true, stdio: 'ignore' }).unref();
  });
  h('engine:add', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (r.canceled) return null;
    let root = r.filePaths[0];
    if (path.basename(root).toLowerCase() === 'engine') root = path.dirname(root);
    if (!editorExe(root)) throw new Error('NO_EDITOR');
    if (!store.manualEngines.some((e) => normKey(e.root) === normKey(root))) store.manualEngines.push({ root });
    saveStore();
    return detectEngines();
  });
  h('engine:remove', async (engineKey) => {
    store.manualEngines = store.manualEngines.filter((e) => normKey(e.root) !== engineKey);
    saveStore();
    return detectEngines();
  });
  h('engine:size', async (engineKey) => {
    const e = engineCache.find((x) => x.key === engineKey);
    if (!e) throw new Error('Engine not found.');
    const size = await dirSize(e.root);
    store.meta['engine:' + e.key] = { size };
    e.size = size;
    saveStore();
    return size;
  });
  h('engine:epic', async () => { await shell.openExternal('com.epicgames.launcher://apps'); });

  h('settings:set', async (patch) => {
    store.settings = { ...store.settings, ...patch };
    saveStore();
    if ('theme' in patch || 'openAtLogin' in patch) applySystemSettings();
    if (patch.autoUpdate) checkUpdate().catch(() => {});
    return store.settings;
  });

  h('config:export', async () => {
    const r = await dialog.showSaveDialog(win, { defaultPath: 'unreal-hub-config.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (r.canceled) return null;
    await fsp.writeFile(r.filePath, JSON.stringify(store, null, 2));
    return r.filePath;
  });
  h('config:import', async () => {
    const r = await dialog.showOpenDialog(win, { filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] });
    if (r.canceled) return null;
    const raw = await readJson(r.filePaths[0]);
    store = { ...structuredClone(DEFAULT_STORE), ...raw, settings: { ...DEFAULT_STORE.settings, ...(raw.settings || {}) } };
    saveStore(true);
    applySystemSettings();
    return snapshot();
  });

  h('dialog:pickFolder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  h('task:cancel', async (id) => { const t = tasks.get(id); if (t && t.status === 'running') t.kill(); });
  h('task:list', async () => [...tasks.values()].map(({ kill, ...t }) => t));
  h('task:clear', async () => { for (const [id, t] of tasks) if (t.status !== 'running') tasks.delete(id); });

  h('window:control', async (action) => {
    if (!win) return;
    if (action === 'min') win.minimize();
    else if (action === 'max') win.isMaximized() ? win.unmaximize() : win.maximize();
    else if (action === 'close') win.close();
    else if (action === 'devtools') win.webContents.toggleDevTools();
  });
}

let winBounds = null;
function createWindow(focus = false) {
  const dark = nativeTheme.shouldUseDarkColors;
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 680, ...(winBounds || {}),
    backgroundColor: dark ? '#0d1017' : '#dfe6ec',
    title: 'Unreal Hub',
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    frame: false,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, spellcheck: false, backgroundThrottling: true }
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => { win.show(); if (focus) win.focus(); });
  // Closing to the tray destroys the window instead of hiding it: the renderer's memory is given back
  // and the window is rebuilt in a moment when it is opened again from the tray or the taskbar.
  win.on('close', () => { if (!win.isMaximized() && !win.isMinimized()) winBounds = win.getBounds(); });
  win.on('closed', () => { win = null; });
  win.on('maximize', () => send('window:state', { maximized: true }));
  win.on('unmaximize', () => send('window:state', { maximized: false }));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

if (IS_WIN) app.setAppUserModelId('com.hsinjinshi.unrealhub');

app.whenReady().then(() => {
  loadStore();
  if (IS_WIN && !store.installerChecked) {
    store.installerChecked = true;
    try {
      const out = require('child_process').execFileSync('reg', ['query', 'HKCU\\Software\\jsTici\\UnrealHub', '/v', 'OpenAtLogin'], { windowsHide: true }).toString();
      if (/0x1/.test(out)) Object.assign(store.settings, { openAtLogin: true, startMinimized: true });
    } catch {}
    saveStore();
  }
  applySystemSettings();
  registerThumbProtocol();
  registerIpc();
  createTray();
  const hidden = process.argv.includes('--hidden') && store.settings.startMinimized && tray;
  if (hidden) detectEngines().then(detectProjects).catch(() => {}); // fill tray & jump list without opening a window
  else createWindow();
  handleArgv(process.argv);
  setTimeout(() => { repairShortcuts().catch(() => {}); pruneThumbs(); }, 8000);
  scheduleUpdateChecks();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('before-quit', () => { quitting = true; saveStore(true); });
app.on('window-all-closed', () => {
  if (!quitting && store.settings.closeToTray && tray) return; // keep living in the tray
  for (const t of tasks.values()) if (t.status === 'running') t.kill();
  if (!IS_MAC) app.quit();
});
