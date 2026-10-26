const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

// 记录每个房间的 socket 列表
const rooms = new Map(); // roomId -> [socketId, ...]

io.on('connection', (socket) => {
  console.log('用户连接:', socket.id);

  socket.on('join', (roomId) => {
    // 离开旧房间
    if (socket.roomId && socket.roomId !== roomId) {
      leaveRoom(socket, socket.roomId);
    }

    socket.join(roomId);
    socket.roomId = roomId;

    if (!rooms.has(roomId)) rooms.set(roomId, []);
    const members = rooms.get(roomId);

    // 通知房间已有的人：有新人来了
    if (members.length > 0) {
      // 告诉老成员：新人的 socketId，让老成员发起 offer
      io.to(members[0]).emit('peer-joined', socket.id);
    }

    members.push(socket.id);
    console.log(`房间 ${roomId} 成员:`, members);

    // 告诉新人：当前房间人数
    socket.emit('room-info', { members: members.length });
  });

  // 转发 SDP 和 ICE
  socket.on('signal', ({ to, data }) => {
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('disconnect', () => {
    console.log('用户断开:', socket.id);
    if (socket.roomId) leaveRoom(socket, socket.roomId);
  });

  function leaveRoom(socket, roomId) {
    const members = rooms.get(roomId);
    if (!members) return;
    const idx = members.indexOf(socket.id);
    if (idx !== -1) members.splice(idx, 1);
    if (members.length === 0) {
      rooms.delete(roomId);
    } else {
      // 通知剩下的人：有人离开了
      members.forEach(id => io.to(id).emit('peer-left', socket.id));
    }
    socket.leave(roomId);
    socket.roomId = null;
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`信令服务器运行在 http://localhost:${PORT}`);
  console.log('局域网内其他设备请用本机 IP 访问，例如 http://192.168.x.x:3000');
});
