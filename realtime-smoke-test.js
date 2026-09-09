const WebSocket = require('ws');
const url = 'ws://127.0.0.1:3101/ws';
const room = 'TEST99';
const first = new WebSocket(url);
const second = new WebSocket(url);
let latest = null;
let joined = 0;

function join(ws, id) {
  ws.send(JSON.stringify({ type: 'join', roomCode: room, userId: id, userName: id }));
}
function ready() {
  joined += 1;
  if (joined !== 2) return;
  setTimeout(() => first.send(JSON.stringify({ type: 'operation', operation: { type: 'set-kill', roundIndex: 0, playerIndex: 0, value: '4' } })), 40);
  setTimeout(() => second.send(JSON.stringify({ type: 'operation', operation: { type: 'set-kill', roundIndex: 0, playerIndex: 1, value: '3' } })), 80);
  setTimeout(() => first.send(JSON.stringify({ type: 'operation', operation: { type: 'finish-match' } })), 140);
  setTimeout(() => {
    const kills = latest && latest.matches && latest.matches[0] && latest.matches[0].state.rounds[0].kills;
    const activeKills = latest && latest.state.rounds[0].kills;
    if (!kills || kills[0] !== '4' || kills[1] !== '3' || activeKills.some(Boolean)) {
      console.error('同步失败:', JSON.stringify(latest));
      process.exitCode = 1;
    } else {
      console.log('实时多人、场次保存与历史验证通过:', kills.join(','));
    }
    clearTimeout(timeout);
    first.close(); second.close();
  }, 500);
}
first.on('open', () => { join(first, 'one'); ready(); });
second.on('open', () => { join(second, 'two'); ready(); });
first.on('message', value => { const message = JSON.parse(value); if (message.type === 'state') latest = message; });
second.on('message', value => { const message = JSON.parse(value); if (message.type === 'state') latest = message; });
const timeout = setTimeout(() => { console.error('验证超时'); process.exit(1); }, 3000);
