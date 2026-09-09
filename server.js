const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// 房间数据存储
const rooms = new Map();

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
            users: new Map()
          });
        }

        const room = rooms.get(roomCode);
        room.users.set(userId, { name: userName, ws });

        // 发送当前房间状态给新加入的用户
        ws.send(JSON.stringify({
          type: 'state',
          state: room.state,
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
        // 如果房间为空，删除房间
        if (room.users.size === 0) {
          rooms.delete(roomCode);
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

// REST API 接口（备用）
app.get('/api/rooms/:roomCode/state', (req, res) => {
  const { roomCode } = req.params;
  const room = rooms.get(roomCode);
  if (room) {
    res.json(room.state);
  } else {
    res.json({
      players: ['JBM', 'JBH', 'JBS', 'ZZZ'],
      rounds: [{ kills: ['', '', '', ''], chicken: [] }]
    });
  }
});

app.put('/api/rooms/:roomCode/state', (req, res) => {
  const { roomCode } = req.params;
  const { state } = req.body;

  if (!rooms.has(roomCode)) {
    rooms.set(roomCode, {
      state,
      users: new Map()
    });
  } else {
    rooms.get(roomCode).state = state;
  }

  broadcastToRoom(roomCode, {
    type: 'state',
    state
  });

  res.json({ success: true });
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 服务器运行在 http://localhost:${PORT}`);
  console.log(`📡 WebSocket 服务在 ws://localhost:${PORT}`);
});
