const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');
const ROOM_CODE = /^[A-Z0-9]{4,12}$/;
const PLAYER_OPTIONS = ['JBM', 'JBH', 'JBS', 'ZZZ', 'JJG', 'XC', '小卷卷', 'JBB'];
const DEFAULT_PLAYERS = PLAYER_OPTIONS.slice(0, 4);

fs.mkdirSync(DATA_DIR, { recursive: true });
const rooms = new Map();
function defaultState() { return { players: [...DEFAULT_PLAYERS], rounds: [{ kills: ['', '', '', ''], chicken: [] }] }; }
function normaliseState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const players = Array.isArray(source.players) && source.players.length === 4 ? source.players.map((name, index) => PLAYER_OPTIONS.includes(name) ? name : DEFAULT_PLAYERS[index]) : [...DEFAULT_PLAYERS];
  const rounds = Array.isArray(source.rounds) ? source.rounds.slice(0, 500).map(round => {
    const kills = Array.isArray(round && round.kills) ? round.kills.slice(0, 4) : [];
    const safeKills = [...Array(4)].map((_, i) => { const value = kills[i]; if (value === '' || value === null || value === undefined) return ''; const number = Number(value); return Number.isInteger(number) && number >= 0 && number <= 999 ? String(number) : ''; });
    const chicken = Array.isArray(round && round.chicken) ? [...new Set(round.chicken)] : [];
    return { kills: safeKills, chicken: chicken.filter(name => players.includes(name)) };
  }) : [];
  return { players, rounds: rounds.length ? rounds : [{ kills: ['', '', '', ''], chicken: [] }] };
}
function normaliseMatches(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-100).map((match, index) => ({
    id: String(match && match.id || `legacy-${index}`),
    title: String(match && match.title || `第 ${index + 1} 场`).slice(0, 48),
    timestamp: String(match && match.timestamp || new Date().toISOString()),
    state: normaliseState(match && match.state)
  }));
}
function loadRooms() {
  if (!fs.existsSync(ROOMS_FILE)) return;
  try { const stored = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8')); for (const [code, room] of Object.entries(stored)) if (ROOM_CODE.test(code)) rooms.set(code, { state: normaliseState(room.state), matches: normaliseMatches(room.matches), version: Number(room.version) || 0, createdAt: room.createdAt || new Date().toISOString(), updatedAt: room.updatedAt || new Date().toISOString(), users: new Map() }); }
  catch (error) { console.error('无法读取房间数据：', error.message); }
}
function saveRooms() { const saved = {}; rooms.forEach((room, code) => { saved[code] = { state: room.state, matches: room.matches, version: room.version, createdAt: room.createdAt, updatedAt: room.updatedAt }; }); const temporary = `${ROOMS_FILE}.tmp`; fs.writeFileSync(temporary, JSON.stringify(saved, null, 2)); fs.renameSync(temporary, ROOMS_FILE); }
function getRoom(code) { if (!rooms.has(code)) rooms.set(code, { state: defaultState(), matches: [], version: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), users: new Map() }); return rooms.get(code); }
function usersFor(room) { return [...room.users.entries()].map(([id, user]) => ({ id, name: user.name })); }
function send(ws, message) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message)); }
function broadcast(room, message) { room.users.forEach(user => send(user.ws, message)); }
function broadcastState(room, updatedBy) { broadcast(room, { type: 'state', state: room.state, matches: room.matches, version: room.version, users: usersFor(room), updatedBy }); }
function applyOperation(room, operation) {
  const state = room.state;
  if (!operation || typeof operation.type !== 'string') return false;
  if (operation.type === 'set-player') { const index = Number(operation.index); if (!Number.isInteger(index) || index < 0 || index > 3 || !PLAYER_OPTIONS.includes(operation.name)) return false; const previous = state.players[index]; state.players[index] = operation.name; state.rounds.forEach(round => { round.chicken = round.chicken.map(name => name === previous ? operation.name : name).filter((name, i, values) => state.players.includes(name) && values.indexOf(name) === i); }); return true; }
  if (operation.type === 'set-kill') { const roundIndex = Number(operation.roundIndex), playerIndex = Number(operation.playerIndex); if (!Number.isInteger(roundIndex) || !Number.isInteger(playerIndex) || !state.rounds[roundIndex] || playerIndex < 0 || playerIndex > 3) return false; const value = operation.value === '' ? '' : String(operation.value); if (value !== '' && (!/^\d+$/.test(value) || Number(value) > 999)) return false; state.rounds[roundIndex].kills[playerIndex] = value; return true; }
  if (operation.type === 'set-chicken') { const roundIndex = Number(operation.roundIndex); if (!Number.isInteger(roundIndex) || !state.rounds[roundIndex] || !Array.isArray(operation.players)) return false; state.rounds[roundIndex].chicken = [...new Set(operation.players)].filter(name => state.players.includes(name)); return true; }
  if (operation.type === 'add-round') { if (state.rounds.length >= 500) return false; state.rounds.push({ kills: ['', '', '', ''], chicken: [] }); return true; }
  if (operation.type === 'finish-match') { room.matches.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: `第 ${room.matches.length + 1} 场`, timestamp: new Date().toISOString(), state: normaliseState(room.state) }); if (room.matches.length > 100) room.matches.shift(); room.state = defaultState(); return true; }
  if (operation.type === 'reset') { room.state = defaultState(); return true; }
  return false;
}

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
wss.on('connection', ws => {
  let room = null, userId = null;
  ws.on('message', raw => {
    let message; try { message = JSON.parse(raw); } catch { return send(ws, { type: 'error', message: '消息格式无效' }); }
    if (message.type === 'join') { const code = String(message.roomCode || '').trim().toUpperCase(); const name = String(message.userName || '访客').trim().slice(0, 24) || '访客'; userId = String(message.userId || '').slice(0, 80); if (!ROOM_CODE.test(code) || !userId) return send(ws, { type: 'error', message: '房间号无效' }); room = getRoom(code); room.users.set(userId, { name, ws }); send(ws, { type: 'state', state: room.state, matches: room.matches, version: room.version, users: usersFor(room) }); broadcast(room, { type: 'users', users: usersFor(room) }); saveRooms(); return; }
    if (message.type === 'operation' && room && applyOperation(room, message.operation)) { room.version += 1; room.updatedAt = new Date().toISOString(); saveRooms(); broadcastState(room, room.users.get(userId)?.name || '访客'); }
  });
  ws.on('close', () => { if (room && userId) { room.users.delete(userId); broadcast(room, { type: 'users', users: usersFor(room) }); } });
});
loadRooms();
server.listen(PORT, () => console.log(`PUBG scoreboard listening on :${PORT}`));
