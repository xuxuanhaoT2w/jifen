const OPTIONS = ['JBM', 'JBH', 'JBS', 'ZZZ', 'JJG', 'XC', '小卷卷', 'JBB'];
const DEFAULT_STATE = { players: ['JBM', 'JBH', 'JBS', 'ZZZ'], rounds: [{ kills: ['', '', '', ''], chicken: [] }] };
const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
let state = JSON.parse(JSON.stringify(DEFAULT_STATE));
let roomCode = new URLSearchParams(location.search).get('room') || makeRoomCode();
let socket, connected = false, reconnectDelay = 500;
const userId = localStorage.getItem('pubg-user-id') || crypto.randomUUID();
const userName = localStorage.getItem('pubg-user-name') || `访客${Math.floor(Math.random() * 900 + 100)}`;
let users = [];
localStorage.setItem('pubg-user-id', userId);
localStorage.setItem('pubg-user-name', userName);
history.replaceState({}, '', `?room=${roomCode}`);

function makeRoomCode() { return crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(-6).toUpperCase(); }
function esc(value) { return String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char])); }
function setStatus(status) { const text = { connected:'已连接 · 实时同步', connecting:'连接中…', disconnected:'连接断开 · 正在重试' }[status]; document.getElementById('connectionStatus').className = `connection-status ${status}`; document.getElementById('statusText').textContent = text; }
function connect() {
  setStatus('connecting');
  socket = new WebSocket(wsUrl);
  socket.onopen = () => { connected = true; reconnectDelay = 500; setStatus('connected'); socket.send(JSON.stringify({ type:'join', roomCode, userId, userName })); };
  socket.onmessage = event => { const message = JSON.parse(event.data); if (message.type === 'state') { state = message.state; users = message.users || users; render(); } else if (message.type === 'users') { users = message.users; renderUsers(); } else if (message.type === 'error') alert(message.message); };
  socket.onclose = () => { connected = false; setStatus('disconnected'); setTimeout(connect, reconnectDelay); reconnectDelay = Math.min(reconnectDelay * 2, 8000); };
  socket.onerror = () => socket.close();
}
function operation(payload) { if (!connected) return alert('连接尚未建立，请稍后重试。'); socket.send(JSON.stringify({ type:'operation', operation:payload })); }
function roundScore(round, index) { if (round.kills.some(value => value === '')) return 0; const kills = round.kills.map(Number); const chickens = round.chicken.length; const headScore = 4 * kills[index] - kills.reduce((total, value) => total + value, 0); const chickenScore = chickens ? (round.chicken.includes(state.players[index]) ? 5 * (4 - chickens) : -5 * chickens) : 0; return headScore + chickenScore; }
function total(index) { return state.rounds.reduce((sum, round) => sum + roundScore(round, index), 0); }
function render() { renderPlayers(); renderScores(); renderRounds(); renderUsers(); }
function renderPlayers() { document.getElementById('players').innerHTML = state.players.map((player, index) => `<div class="player-name"><label>玩家 ${index + 1}</label><select data-player="${index}">${OPTIONS.map(option => `<option${option === player ? ' selected' : ''}>${option}</option>`).join('')}</select></div>`).join(''); }
function renderScores() { const totals = state.players.map((_, index) => total(index)); const lowest = Math.min(...totals); const worst = lowest < 0 ? totals.map((value, index) => value === lowest ? index : -1).filter(index => index >= 0) : []; document.getElementById('scores').innerHTML = state.players.map((player, index) => `<div class="score ${totals[index] > 0 ? 'positive' : totals[index] < 0 ? 'negative' : ''} ${worst.includes(index) ? 'worst' : ''}"><div class="name">${esc(player)}${worst.includes(index) ? ' · 当前负分最多' : ''}</div><div class="value">${totals[index] > 0 ? '+' : ''}${totals[index]}</div></div>`).join(''); }
function renderRounds() {
  document.getElementById('head').innerHTML = `<tr><th>局次</th>${state.players.map(player => `<th>${esc(player)} 人头数</th>`).join('')}<th>吃鸡玩家（可多选）</th>${state.players.map(player => `<th>${esc(player)} 本局得分</th>`).join('')}</tr>`;
  document.getElementById('rounds').innerHTML = state.rounds.map((round, roundIndex) => `<tr><td>${roundIndex + 1}</td>${round.kills.map((value, playerIndex) => `<td><input class="kill" type="number" min="0" max="999" inputmode="numeric" value="${value}" data-kill="${roundIndex}:${playerIndex}"></td>`).join('')}<td class="chicken-cell"><details><summary>${round.chicken.length ? esc(round.chicken.join('、')) : '请选择'}</summary><div class="multi-menu">${state.players.map(player => `<label><input type="checkbox" data-chicken="${roundIndex}" value="${esc(player)}"${round.chicken.includes(player) ? ' checked' : ''}>${esc(player)}</label>`).join('')}</div></details></td>${state.players.map((_, index) => { const score = roundScore(round, index); return `<td class="round-score ${round.kills.some(value => value === '') ? 'empty' : score > 0 ? 'positive' : score < 0 ? 'negative' : ''}">${round.kills.some(value => value === '') ? '—' : `${score > 0 ? '+' : ''}${score}`}</td>`; }).join('')}</tr>`).join('');
  document.querySelectorAll('[data-player]').forEach(element => element.onchange = () => operation({ type:'set-player', index:Number(element.dataset.player), name:element.value }));
  document.querySelectorAll('[data-kill]').forEach(element => element.onchange = () => { const [roundIndex, playerIndex] = element.dataset.kill.split(':').map(Number); operation({ type:'set-kill', roundIndex, playerIndex, value:element.value }); });
  document.querySelectorAll('[data-chicken]').forEach(element => element.onchange = () => { const roundIndex = Number(element.dataset.chicken); const players = [...document.querySelectorAll(`[data-chicken="${roundIndex}"]:checked`)].map(item => item.value); operation({ type:'set-chicken', roundIndex, players }); });
}
function renderUsers() { document.getElementById('usersList').innerHTML = users.map(user => `<div class="user-item ${user.id === userId ? 'active' : ''}"><div class="user-avatar">${esc(user.name.charAt(0))}</div><div class="user-info"><span class="user-name">${esc(user.name)}${user.id === userId ? '（你）' : ''}</span><span class="user-status"><span class="status-indicator status-online"></span> 在线</span></div></div>`).join(''); }
document.getElementById('roomCode').textContent = roomCode;
document.getElementById('addRound').onclick = () => operation({ type:'add-round' });
document.getElementById('reset').onclick = () => { if (confirm('确定清空当前房间的所有局数和得分吗？所有在线协作者都会看到清零结果。')) operation({ type:'reset' }); };
document.getElementById('copyCode').onclick = async () => { const link = `${location.origin}${location.pathname}?room=${roomCode}`; try { await navigator.clipboard.writeText(link); const button = document.getElementById('copyCode'); button.textContent = '已复制房间链接！'; setTimeout(() => button.textContent = '复制房间号', 1800); } catch { prompt('复制此房间链接：', link); } };
render(); connect();
