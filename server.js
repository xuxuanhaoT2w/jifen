const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// 数据文件路径
const dataDir = path.join(__dirname, 'data');
const roomsFile = path.join(dataDir, 'rooms.json');
const historyDir = path.join(dataDir, 'history');

// 初始化数据目录
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(historyDir)) {
  fs.mkdirSync(historyDir, { recursive: true });
}

// 房间数据存储（内存 + 文件持久化）
let rooms = new Map();

// 加载数据
function loadData() {
  if (fs.existsSync(roomsFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(roomsFile, 'utf8'));
      Object.entries(data).forEach(([code, roomData]) => {
        rooms.set(code, {
          state: roomData.state,
          users: new Map(),
          matches: roomData.matches || [],
          createdAt: roomData.createdAt
        });
      });
      console.log(`已加载 ${rooms.size} 个房间`);
    } catch (e) {
      console.error('加载数据失败:', e);
    }
  }
}

// 保存数据
function saveData() {
  try {
    const data = {};
    rooms.forEach((room, code) => {
      data[code] = {
        state: room.state,
        matches: room.matches,
        createdAt: room.createdAt
      };
    });
    fs.writeFileSync(roomsFile, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('保存数据失败:', e);
  }
}

// WebSocket 连接处理
wss.on('connection', (ws) => {
  let roomCode = null;
  let userId = null;
  let userName = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      // 加入房间
      if (msg.type === 'join') {
        roomCode = msg.roomCode;
        userId = msg.userId;
        userName = msg.userName;

        if (!rooms.has(roomCode)) {
          rooms.set(roomCode, {
            state: {
              players: ['JBM', 'JBH', 'JBS', 'ZZZ'],
              rounds: [{ kills: ['', '', '', ''], chicken: [] }]
            },
            users: new Map(),
            matches: [],
            createdAt: new Date().toISOString()
          });
        }

        const room = rooms.get(roomCode);
        room.users.set(userId, { name: userName, ws });

        // 发送当前房间状态给新加入的用户
        ws.send(JSON.stringify({
          type: 'state',
          state: room.state,
          matches: room.matches,
          users: Array.from(room.users.values()).map(u => ({
            id: Array.from(room.users.entries()).find(([_, v]) => v === u)[0],
            name: u.name
          }))
        }));

        // 通知房间内其他用户有新用户加入
        broadcastToRoom(roomCode, {
          type: 'user-joined',
          userId,
          userName
        }, userId);

        saveData();
      }

      // 状态更新
      if (msg.type === 'update' && roomCode) {
        const room = rooms.get(roomCode);
        if (room) {
          room.state = msg.state;
          // 广播给房间内所有用户
          broadcastToRoom(roomCode, {
            type: 'state',
            state: room.state,
            updatedBy: userName
          });
          saveData();
        }
      }

      // 保存比赛
      if (msg.type === 'save-match' && roomCode) {
        const room = rooms.get(roomCode);
        if (room) {
          const match = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            state: msg.state,
            title: msg.title || `比赛 ${room.matches.length + 1}`,
            scores: msg.scores || {}
          };
          room.matches.push(match);
          
          // 保存到历史文件
          const historyFile = path.join(historyDir, `${roomCode}_${match.id}.json`);
          fs.writeFileSync(historyFile, JSON.stringify(match, null, 2));

          broadcastToRoom(roomCode, {
            type: 'match-saved',
            match
          });

          saveData();
        }
      }

      // 获取历史比赛列表
      if (msg.type === 'get-history' && roomCode) {
        const room = rooms.get(roomCode);
        if (room) {
          ws.send(JSON.stringify({
            type: 'history',
            matches: room.matches
          }));
        }
      }

      // 加载历史比赛
      if (msg.type === 'load-match' && roomCode) {
        const room = rooms.get(roomCode);
        if (room) {
          const match = room.matches.find(m => m.id === msg.matchId);
          if (match) {
            ws.send(JSON.stringify({
              type: 'match-loaded',
              match
            }));
          }
        }
      }

      // 删除比赛
      if (msg.type === 'delete-match' && roomCode) {
        const room = rooms.get(roomCode);
        if (room) {
          const index = room.matches.findIndex(m => m.id === msg.matchId);
          if (index !== -1) {
            const match = room.matches.splice(index, 1)[0];
            
            // 删除历史文件
            const historyFile = path.join(historyDir, `${roomCode}_${match.id}.json`);
            if (fs.existsSync(historyFile)) {
              fs.unlinkSync(historyFile);
            }

            broadcastToRoom(roomCode, {
              type: 'match-deleted',
              matchId: msg.matchId
            });

            saveData();
          }
        }
      }

      // 用户列表更新
      if (msg.type === 'list' && roomCode) {
        const room = rooms.get(roomCode);
        if (room) {
          broadcastToRoom(roomCode, {
            type: 'users',
            users: Array.from(room.users.values()).map((u, idx) => ({
              id: Array.from(room.users.keys())[idx],
              name: u.name
            }))
          });
        }
      }
    } catch (e) {
      console.error('消息处理错误:', e);
    }
  });

  ws.on('close', () => {
    if (roomCode) {
      const room = rooms.get(roomCode);
      if (room) {
        room.users.delete(userId);
        // 通知房间内其他用户
        broadcastToRoom(roomCode, {
          type: 'user-left',
          userId,
          userName
        });
        // 如果房间为空，保留房间数据但清理内存
        if (room.users.size === 0) {
          // 可选：保留房间数据以便后续恢复
        }
      }
    }
  });
});

// 广播到房间内所有用户
function broadcastToRoom(roomCode, message, excludeUserId = null) {
  const room = rooms.get(roomCode);
  if (!room) return;

  room.users.forEach((user, userId) => {
    if (excludeUserId !== userId && user.ws.readyState === WebSocket.OPEN) {
      user.ws.send(JSON.stringify(message));
    }
  });
}

// REST API 接口
app.get('/api/rooms/:roomCode/state', (req, res) => {
  const { roomCode } = req.params;
  const room = rooms.get(roomCode);
  if (room) {
    res.json({
      state: room.state,
      matches: room.matches
    });
  } else {
    res.json({
      state: {
        players: ['JBM', 'JBH', 'JBS', 'ZZZ'],
        rounds: [{ kills: ['', '', '', ''], chicken: [] }]
      },
      matches: []
    });
  }
});

app.put('/api/rooms/:roomCode/state', (req, res) => {
  const { roomCode } = req.params;
  const { state } = req.body;

  if (!rooms.has(roomCode)) {
    rooms.set(roomCode, {
      state,
      users: new Map(),
      matches: [],
      createdAt: new Date().toISOString()
    });
  } else {
    rooms.get(roomCode).state = state;
  }

  broadcastToRoom(roomCode, {
    type: 'state',
    state
  });

  saveData();
  res.json({ success: true });
});

app.post('/api/rooms/:roomCode/matches', (req, res) => {
  const { roomCode } = req.params;
  const { title, state, scores } = req.body;

  if (!rooms.has(roomCode)) {
    rooms.set(roomCode, {
      state,
      users: new Map(),
      matches: [],
      createdAt: new Date().toISOString()
    });
  }

  const match = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    state,
    title: title || `比赛 ${rooms.get(roomCode).matches.length + 1}`,
    scores: scores || {}
  };

  const room = rooms.get(roomCode);
  room.matches.push(match);

  // 保存到历史文件
  const historyFile = path.join(historyDir, `${roomCode}_${match.id}.json`);
  fs.writeFileSync(historyFile, JSON.stringify(match, null, 2));

  broadcastToRoom(roomCode, {
    type: 'match-saved',
    match
  });

  saveData();
  res.json(match);
});

app.get('/api/rooms/:roomCode/matches', (req, res) => {
  const { roomCode } = req.params;
  const room = rooms.get(roomCode);
  if (room) {
    res.json(room.matches);
  } else {
    res.json([]);
  }
});

app.get('/api/rooms/:roomCode/matches/:matchId', (req, res) => {
  const { roomCode, matchId } = req.params;
  const room = rooms.get(roomCode);
  if (room) {
    const match = room.matches.find(m => m.id === parseInt(matchId));
    if (match) {
      res.json(match);
    } else {
      res.status(404).json({ error: '比赛不存在' });
    }
  } else {
    res.status(404).json({ error: '房间不存在' });
  }
});

app.delete('/api/rooms/:roomCode/matches/:matchId', (req, res) => {
  const { roomCode, matchId } = req.params;
  const room = rooms.get(roomCode);
  if (room) {
    const index = room.matches.findIndex(m => m.id === parseInt(matchId));
    if (index !== -1) {
      const match = room.matches.splice(index, 1)[0];
      
      // 删除历史文���
      const historyFile = path.join(historyDir, `${roomCode}_${match.id}.json`);
      if (fs.existsSync(historyFile)) {
        fs.unlinkSync(historyFile);
      }

      broadcastToRoom(roomCode, {
        type: 'match-deleted',
        matchId: parseInt(matchId)
      });

      saveData();
      res.json({ success: true });
    } else {
      res.status(404).json({ error: '比赛不存在' });
    }
  } else {
    res.status(404).json({ error: '房间不存在' });
  }
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 加载数据
loadData();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 服务器运行在 http://localhost:${PORT}`);
  console.log(`📡 WebSocket 服务在 ws://localhost:${PORT}`);
  console.log(`📊 数据目录: ${dataDir}`);
});
