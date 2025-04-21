const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const rooms = {};

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("create-room", (roomId) => {
    rooms[roomId] = [socket.id];
    socket.join(roomId);
    console.log(`Room ${roomId} created by ${socket.id}`);
  });

  socket.on("join-room", (roomId) => {
    if (rooms[roomId] && rooms[roomId].length === 1) {
      rooms[roomId].push(socket.id);
      socket.join(roomId);
      socket.to(roomId).emit("peer-joined", socket.id);
      socket.emit("peer-joined", rooms[roomId][0]);
    } else {
      socket.emit("room-error", "Room is full or does not exist");
    }
  });

  socket.on("offer", ({ targetId, offer }) => {
    io.to(targetId).emit("offer", { senderId: socket.id, offer });
  });

  socket.on("answer", ({ targetId, answer }) => {
    io.to(targetId).emit("answer", { senderId: socket.id, answer });
  });

  socket.on("ice-candidate", ({ targetId, candidate }) => {
    io.to(targetId).emit("ice-candidate", { senderId: socket.id, candidate });
  });

  socket.on("chat-message", ({ roomId, message, sender }) => {
    socket.to(roomId).emit("chat-message", { message, sender });
  });

  socket.on("disconnecting", () => {
    for (const room of socket.rooms) {
      if (room !== socket.id && rooms[room]) {
        rooms[room] = rooms[room].filter((id) => id !== socket.id);
        socket.to(room).emit("peer-disconnected");
        if (rooms[room].length === 0) {
          delete rooms[room];
        }
      }
    }
  });
});

server.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});
