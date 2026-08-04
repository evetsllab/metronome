'use strict'

const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron')
const { join } = require('path')
const fs    = require('fs')
const os    = require('os')
const Store = require('electron-store')
const ftp   = require('basic-ftp')

const store = new Store({ name: 'connections', encryptionKey: 'dualfm-v1-2024' })
const sessions = new Map()
let sessionSeq = 0
let mainWindow

// Set SBFTP_VERBOSE=1 before launching to dump the full FTP conversation to the console.
const VERBOSE = process.env.SBFTP_VERBOSE === '1'

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360, height: 800, minWidth: 880, minHeight: 480,
    frame: false, backgroundColor: '#1c1c1c',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  })
  nativeTheme.themeSource = 'dark'
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  mainWindow.on('maximize',   () => mainWindow.webContents.send('win:maximized', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('win:maximized', false))
}
app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

ipcMain.handle('win:minimize',    () => mainWindow?.minimize())
ipcMain.handle('win:maximize',    () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize())
ipcMain.handle('win:close',       () => mainWindow?.close())
ipcMain.handle('win:isMaximized', () => mainWindow?.isMaximized() ?? false)

ipcMain.handle('fs:home', () => os.homedir())
ipcMain.handle('fs:drives', () => {
  if (process.platform !== 'win32') return [{ name: '/', path: '/', type: 'drive' }]
  const drives = []
  for (let c = 65; c <= 90; c++) {
    const letter = String.fromCharCode(c)
    const p = `${letter}:\\`
    try { fs.accessSync(p); drives.push({ name: `${letter}:`, path: p }) } catch {}
  }
  return drives
})
ipcMain.handle('fs:list', (_, dirPath) => {
  try {
    const entries = []
    for (const d of fs.readdirSync(dirPath, { withFileTypes: true })) {
      try {
        const full = join(dirPath, d.name)
        const st = fs.statSync(full)
        entries.push({ name: d.name, path: full, isDirectory: d.isDirectory(), size: st.size, modified: st.mtime.toISOString() })
      } catch {}
    }
    entries.sort((a, b) => a.isDirectory !== b.isDirectory ? (a.isDirectory ? -1 : 1) : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    return { ok: true, entries }
  } catch (e) { return { ok: false, error: e.message } }
})
ipcMain.handle('fs:mkdir',  (_, p)         => { try { fs.mkdirSync(p, { recursive: true }); return { ok: true } } catch (e) { return { ok: false, error: e.message } } })
ipcMain.handle('fs:rename', (_, old_, new_) => { try { fs.renameSync(old_, new_); return { ok: true } } catch (e) { return { ok: false, error: e.message } } })
ipcMain.handle('fs:delete', (_, p) => {
  try { const st = fs.statSync(p); st.isDirectory() ? fs.rmSync(p, { recursive: true }) : fs.unlinkSync(p); return { ok: true } }
  catch (e) { return { ok: false, error: e.message } }
})
ipcMain.handle('fs:stat', (_, p) => {
  try { const st = fs.statSync(p); return { ok: true, size: st.size, modified: st.mtime.toISOString(), isDirectory: st.isDirectory() } }
  catch (e) { return { ok: false, error: e.message } }
})

// ── Connection storage ────────────────────────────────────────────────────────
// Connections saved to ~/Documents/SB-FTP/connections.json. Auto-migrates from SB-DualFM on first run.
// so they survive app reinstalls, renames, and updates forever.
// Passwords are kept separately in the encrypted electron-store.

const CONN_DIR  = join(os.homedir(), 'Documents', 'SB-FTP')
const CONN_FILE   = join(CONN_DIR, 'connections.json')
const LEGACY_FILE = join(os.homedir(), 'Documents', 'SB-DualFM', 'connections.json')

function readConnFile() {
  try {
    fs.mkdirSync(CONN_DIR, { recursive: true })
    if (!fs.existsSync(CONN_FILE) && fs.existsSync(LEGACY_FILE)) { try { fs.copyFileSync(LEGACY_FILE, CONN_FILE) } catch {} }
    if (!fs.existsSync(CONN_FILE)) return []
    return JSON.parse(fs.readFileSync(CONN_FILE, 'utf8')) || []
  } catch { return [] }
}

function writeConnFile(list) {
  try {
    fs.mkdirSync(CONN_DIR, { recursive: true })
    // Strip passwords before writing to plain file
    const safe = list.map(({ password, ...rest }) => rest)
    fs.writeFileSync(CONN_FILE, JSON.stringify(safe, null, 2), 'utf8')
  } catch (e) { console.error('conn file write failed:', e.message) }
}

// FIX 3: the app was renamed SB-DualFM -> SB-FTP, which moved electron-store's
// userData directory. connections.json was migrated above, but the encrypted
// password map was not, so every saved connection loaded with password: ''.
// Read the old store once and fold any missing passwords forward.
function getLegacyPwMap() {
  try {
    const legacyDir = join(app.getPath('appData'), 'SB-DualFM')
    if (!fs.existsSync(join(legacyDir, 'connections.json'))) return {}
    const legacy = new Store({ name: 'connections', cwd: legacyDir, encryptionKey: 'dualfm-v1-2024' })
    return legacy.get('pwmap', {}) || {}
  } catch { return {} }
}

function getPwMap() {
  const current = store.get('pwmap', {}) || {}
  if (store.get('pwMigrated')) return current
  const merged = { ...getLegacyPwMap(), ...current }
  try { store.set('pwmap', merged); store.set('pwMigrated', true) } catch {}
  return merged
}
function setPwMap(m) { store.set('pwmap', m) }

// Merge file connections with stored passwords
function loadConns() {
  const list  = readConnFile()
  const pwmap = getPwMap()
  return list.map(c => ({ ...c, password: pwmap[c.id] || '' }))
}

ipcMain.handle('conn:list', () => loadConns())

ipcMain.handle('conn:delete', (_, id) => {
  const list = readConnFile().filter(c => c.id !== id)
  writeConnFile(list)
  const pwmap = getPwMap()
  delete pwmap[id]
  setPwMap(pwmap)
  return { ok: true }
})

ipcMain.handle('conn:save', (_, conn) => {
  const list = readConnFile()
  if (!conn.id) conn.id = `${Date.now()}`
  const idx = list.findIndex(c => c.id === conn.id)
  const { password, ...safe } = conn
  idx >= 0 ? (list[idx] = safe) : list.push(safe)
  writeConnFile(list)
  // Save password separately in encrypted store
  if (password) {
    const pwmap = getPwMap()
    pwmap[conn.id] = password
    setPwMap(pwmap)
  }
  return { ok: true, id: conn.id }
})

// ── FTP helpers ───────────────────────────────────────────────────────────────
const rp = p => p.replace(/\\/g, '/').replace(/\/\/+/g, '/')

function mapFtpEntries(list, remotePath) {
  const base = rp(remotePath).replace(/\/$/, '')
  return list
    .filter(item => item.name !== '.' && item.name !== '..')
    .map(item => ({
      name:        item.name,
      path:        `${base}/${item.name}`,
      isDirectory: item.type === 2,
      size:        item.size ?? 0,
      modified:    item.modifiedAt ? item.modifiedAt.toISOString() : null
    }))
    .sort((a, b) => a.isDirectory !== b.isDirectory ? (a.isDirectory ? -1 : 1) : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

async function openClient(cfg) {
  const client = new ftp.Client(30000)
  client.ftp.verbose = VERBOSE
  await client.access({
    host: cfg.host, port: cfg.port || 21,
    user: cfg.username, password: cfg.password,
    secure: cfg.secure || false
  })
  try { client.ftp.socket.setKeepAlive(true, 20000) } catch {}
  return client
}

// FIX 2: a dead control connection. The client was created once and kept in the
// sessions Map forever, but the server drops idle control sockets after a few
// minutes. Every later operation then failed against a closed socket.
async function ensureAlive(s) {
  if (s.client && !s.client.closed) return
  try { s.client?.close() } catch {}
  s.client = await openClient(s.config)
}

// FIX 1: the real cause of "folder created, file never transferred".
// basic-ftp runs ONE task at a time per Client. The renderer fires several IPC
// calls at once during a drag-drop or sync, so the first (ensureDir) won a race
// and the rest died on a busy client. Serialise every operation per session.
async function withSession(id, fn) {
  const s = sessions.get(id)
  if (!s) return { ok: false, error: 'Not connected' }

  const prev = s.lock
  let release
  s.lock = new Promise(r => { release = r })
  try { await prev } catch {}

  try {
    await ensureAlive(s)
    return await fn(s)
  } catch (e) {
    // One retry if the socket died mid-operation.
    if (/closed|ECONNRESET|EPIPE|ETIMEDOUT|not connected/i.test(e.message || '')) {
      try {
        s.client = await openClient(s.config)
        return await fn(s)
      } catch (e2) { return { ok: false, error: e2.message } }
    }
    return { ok: false, error: e.message }
  } finally {
    release()
  }
}

// ── FTP IPC ───────────────────────────────────────────────────────────────────
ipcMain.handle('ftp:connect', async (_, cfg) => {
  const id = `s${++sessionSeq}`
  try {
    const client = await openClient(cfg)
    sessions.set(id, { client, config: cfg, lock: Promise.resolve() })
    return { ok: true, sessionId: id }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('ftp:disconnect', (_, id) => {
  const s = sessions.get(id)
  if (s) { try { s.client.close() } catch {} sessions.delete(id) }
  return { ok: true }
})

ipcMain.handle('ftp:list', (_, id, remotePath) =>
  withSession(id, async s => ({ ok: true, entries: mapFtpEntries(await s.client.list(rp(remotePath)), remotePath) })))

ipcMain.handle('ftp:mkdir', (_, id, p) =>
  withSession(id, async s => {
    await s.client.ensureDir(rp(p))
    // ensureDir leaves the working directory inside the new folder; reset it so
    // any later relative path resolves from the root as the caller expects.
    try { await s.client.cd('/') } catch {}
    return { ok: true }
  }))

ipcMain.handle('ftp:rename', (_, id, oldP, newP) =>
  withSession(id, async s => { await s.client.rename(rp(oldP), rp(newP)); return { ok: true } }))

ipcMain.handle('ftp:delete', (_, id, p, isDir) =>
  withSession(id, async s => {
    if (isDir) await s.client.removeDir(rp(p))
    else       await s.client.remove(rp(p))
    return { ok: true }
  }))

ipcMain.handle('ftp:upload', (_, id, localPath, remotePath) =>
  withSession(id, async s => {
    let stat
    try { stat = fs.statSync(localPath) } catch (e) { return { ok: false, error: e.message } }
    const name = localPath.split(/[/\\]/).pop()
    s.client.trackProgress(info => {
      const pct = stat.size > 0 ? Math.min(99, Math.round(info.bytes / stat.size * 100)) : 50
      mainWindow?.webContents.send('transfer:progress', { file: name, percent: pct, direction: 'up' })
    })
    try {
      await s.client.uploadFrom(localPath, rp(remotePath))
    } finally {
      try { s.client.trackProgress() } catch {}
    }
    // Verify the bytes actually landed instead of trusting a silent success.
    let remoteSize = null
    try { remoteSize = await s.client.size(rp(remotePath)) } catch {}
    if (remoteSize !== null && stat.size > 0 && remoteSize !== stat.size) {
      return { ok: false, error: `Incomplete upload: ${remoteSize} of ${stat.size} bytes` }
    }
    mainWindow?.webContents.send('transfer:progress', { file: name, percent: 100, direction: 'up' })
    return { ok: true }
  }))

ipcMain.handle('ftp:download', (_, id, remotePath, localPath) =>
  withSession(id, async s => {
    const name = remotePath.split('/').pop()
    s.client.trackProgress(() => {
      mainWindow?.webContents.send('transfer:progress', { file: name, percent: -1, direction: 'down' })
    })
    try {
      fs.mkdirSync(localPath.replace(/[/\\][^/\\]+$/, ''), { recursive: true })
      await s.client.downloadTo(localPath, rp(remotePath))
    } finally {
      try { s.client.trackProgress() } catch {}
    }
    mainWindow?.webContents.send('transfer:progress', { file: name, percent: 100, direction: 'down' })
    return { ok: true }
  }))

// ── Bidirectional sync compare ─────────────────────────────────────────────────
// Rules:
//   local only   → toUpload
//   remote only  → toDownload
//   both, local newer  (>2s) → toUpload
//   both, remote newer (>2s) → toDownload
//   both, same within 2s     → in sync, skip
// When server returns no mtime (common on shared FTP), fall back to size comparison.
ipcMain.handle('sync:compare', (_, id, localDir, remoteDir) =>
  withSession(id, async s => {
    let localFiles
    try {
      localFiles = fs.readdirSync(localDir, { withFileTypes: true })
        .filter(d => !d.isDirectory())
        .map(d => { const st = fs.statSync(join(localDir, d.name)); return { name: d.name, size: st.size, mtime: st.mtime.getTime() } })
    } catch (e) { return { ok: false, error: e.message } }

    const remoteFiles = mapFtpEntries(await s.client.list(rp(remoteDir)), remoteDir).filter(e => !e.isDirectory)

    const localMap  = new Map(localFiles.map(f  => [f.name, f]))
    const remoteMap = new Map(remoteFiles.map(f => [f.name, f]))

    const toUpload = [], toDownload = []

    for (const lf of localFiles) {
      const rf = remoteMap.get(lf.name)
      if (!rf) {
        toUpload.push({ name: lf.name, reason: 'local only' })
      } else {
        const rmtime = rf.modified ? new Date(rf.modified).getTime() : null
        if (rmtime === null) {
          if (lf.size !== rf.size) toUpload.push({ name: lf.name, reason: 'size differs' })
        } else {
          const diff = lf.mtime - rmtime
          if      (diff >  2000) toUpload.push  ({ name: lf.name, reason: 'local newer'  })
          else if (diff < -2000) toDownload.push({ name: lf.name, reason: 'remote newer' })
        }
      }
    }
    for (const rf of remoteFiles) {
      if (!localMap.has(rf.name)) toDownload.push({ name: rf.name, reason: 'remote only' })
    }

    return { ok: true, toUpload, toDownload, localCount: localFiles.length, remoteCount: remoteFiles.length }
  }))
