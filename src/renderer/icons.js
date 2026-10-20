/* Native Windows icons: Segoe Fluent Icons (Windows 11) with Segoe MDL2 Assets fallback (Windows 10).
   App icons (Explorer, PowerShell, IDE, Unreal Editor) are the real ones, read from the installed programs. */
const ICONS = {
  home: 'E80F', library: 'E8F1', grid: 'F0E2', list: 'EA37', folder: 'E8B7', folderPlus: 'E8F4',
  star: 'E734', starFill: 'E735', play: 'F5B0', gamepad: 'E7FC', code: 'E943', cpu: 'E950', terminal: 'E756',
  settings: 'E713', search: 'E721', plus: 'E710', refresh: 'E72C', chevron: 'E76C', chevronDown: 'E70D',
  chevronUp: 'E70E', chevronLeft: 'E76B', x: 'E711', check: 'E73E', checkCircle: 'E930', trash: 'E74D',
  eyeOff: 'ED1A', copy: 'E8C8', shortcut: 'E71B', archive: 'F012', broom: 'EA99', hammer: 'E90F', box: 'E7B8',
  fileCode: 'E8A5', image: 'E91B', tag: 'E8EC', note: 'E70B', calendar: 'E787', clock: 'E917', sun: 'E706',
  moon: 'E708', monitor: 'E7F4', globe: 'E774', layers: 'E81E', drive: 'EDA2', git: 'F003', pin: 'E718',
  info: 'E946', alert: 'E7BA', upload: 'E898', download: 'E896', keyboard: 'E765', sparkle: 'EA86', blueprint: 'EA86',
  sort: 'E8CB', history: 'E81C', zap: 'E945', dots: 'E712', dotsH: 'E712', grip: 'E784', external: 'E8A7',
  bell: 'EA8F', database: 'EDA2', palette: 'E790', scan: 'E9A6', users: 'E77B', log: 'E9F9', duplicate: 'E8C8',
  edit: 'E70F', minimize: 'E921', maximize: 'E922', restore: 'E923', close: 'E8BB', newProject: 'ECC8',
  gift: 'E719', idea: 'EA80', help: 'E9CE', cart: 'E7BF'
};
// Real program icons, filled in at startup from the main process (data URLs).
const APP_ICONS = { explorer: '', terminal: '', ide: '', ueEngine: null };

function icon(name, size = 18, cls = '') {
  if (name === 'ue') return ueIcon(size, null, cls);
  if (name.startsWith('app:')) {
    const src = APP_ICONS[name.slice(4)];
    if (src) return `<img class="i appi ${cls}" src="${src}" style="width:${size}px;height:${size}px" alt="" draggable="false"/>`;
    name = { explorer: 'folder', terminal: 'terminal', ide: 'code' }[name.slice(4)] || 'info';
  }
  return `<i class="i fi ${cls}" style="font-size:${size}px;width:${size}px;height:${size}px" aria-hidden="true">&#x${ICONS[name] || 'E946'};</i>`;
}
// Unreal logo of an installed engine: the official logo shipped with the engine (tinted like the rest of the UI),
// else the UnrealEditor.exe icon, else the hub logo.
function ueIcon(size = 18, eng = null, cls = '') {
  const e = eng && (eng.logo || eng.icon) ? eng : APP_ICONS.ueEngine;
  const box = `width:${size}px;height:${size}px`;
  if (e && e.logo) return `<span class="i uemask ${cls}" style="${box};-webkit-mask-image:url(${e.logo});mask-image:url(${e.logo})"></span>`;
  if (e && e.icon) return `<img class="i appi ${cls}" src="${e.icon}" style="${box}" alt="" draggable="false"/>`;
  return `<span class="i uelogo ${cls}" style="${box}"></span>`;
}
function hubLogo(size = 26) { return `<span class="i uelogo" style="width:${size}px;height:${size}px"></span>`; }
