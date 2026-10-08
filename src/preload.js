const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
const on = (ch) => (cb) => { const f = (_e, m) => cb(m); ipcRenderer.on(ch, f); return () => ipcRenderer.removeListener(ch, f); };

contextBridge.exposeInMainWorld('api', {
  load: invoke('data:load'),
  refresh: invoke('data:refresh'),
  scan: invoke('scan:now'),
  cancelScan: invoke('scan:cancel'),

  launch: invoke('project:launch'),
  stop: invoke('project:stop'),
  screenshots: invoke('project:screenshots'),
  setThumbPath: invoke('project:setThumbPath'),
  commandlet: invoke('project:commandlet'),
  terminal: invoke('shell:terminal'),
  openFolder: invoke('shell:openFolder'),
  openPath: invoke('shell:openPath'),
  showItem: invoke('shell:showItem'),
  openIDE: invoke('project:openIDE'),
  generateFiles: invoke('project:generate'),
  build: invoke('project:build'),
  package: invoke('project:package'),
  backup: invoke('project:backup'),
  analyze: invoke('project:analyze'),
  clean: invoke('project:clean'),
  setEngine: invoke('project:setEngine'),
  setMeta: invoke('project:meta'),
  hide: invoke('project:hide'),
  unhideAll: invoke('project:unhideAll'),
  trash: invoke('project:trash'),
  addProject: invoke('project:add'),
  addProjectPaths: invoke('project:addPaths'),
  shortcut: invoke('project:shortcut'),
  pickThumb: invoke('project:pickThumb'),
  resetThumb: invoke('project:resetThumb'),
  details: invoke('project:details'),
  duplicate: invoke('project:duplicate'),

  addFolder: invoke('folders:add'),
  removeFolder: invoke('folders:remove'),

  launchEngine: invoke('engine:launch'),
  addEngine: invoke('engine:add'),
  removeEngine: invoke('engine:remove'),
  engineSize: invoke('engine:size'),
  epicLauncher: invoke('engine:epic'),

  setSettings: invoke('settings:set'),
  exportConfig: invoke('config:export'),
  importConfig: invoke('config:import'),
  pickFolder: invoke('dialog:pickFolder'),
  copy: invoke('clipboard:write'),
  openExternal: invoke('shell:external'),

  cancelTask: invoke('task:cancel'),
  tasks: invoke('task:list'),
  clearTasks: invoke('task:clear'),

  win: invoke('window:control'),
  pathForFile: (f) => { try { return webUtils.getPathForFile(f); } catch { return f.path || ''; } },

  onTask: on('task:update'),
  onProjects: on('projects:update'),
  onScan: on('scan:state'),
  onWindow: on('window:state'),
  onRunning: on('running:update')
});
