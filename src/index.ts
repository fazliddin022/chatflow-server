import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// Supabase admin client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "ChatFlow server is running!" });
});

// Online users
const onlineUsers = new Map<string, string>();

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // User online bo'lganda
  socket.on("user:online", (userId: string) => {
    onlineUsers.set(userId, socket.id);
    io.emit("users:online", Array.from(onlineUsers.keys()));
    console.log(`User online: ${userId}`);
  });

  // Xabar yuborilganda
  socket.on("message:send", async (data: {
    roomId: string;
    senderId: string;
    content: string;
    senderName: string;
  }) => {
    try {
      // Supabase'ga saqlash
      const { data: message, error } = await supabase
        .from("messages")
        .insert({
          room_id: data.roomId,
          sender_id: data.senderId,
          content: data.content,
          sender_name: data.senderName,
        })
        .select()
        .single();

      if (error) throw error;

      // Xona ichidagi hammaga yuborish
      io.to(data.roomId).emit("message:receive", message);
    } catch (err) {
      console.error("Message error:", err);
      socket.emit("message:error", "Failed to send message");
    }
  });

  // Xonaga qo'shilish
  socket.on("room:join", (roomId: string) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
  });

  // Xonadan chiqish
  socket.on("room:leave", (roomId: string) => {
    socket.leave(roomId);
  });

  // Typing indikator
  socket.on("typing:start", (data: { roomId: string; userName: string }) => {
    socket.to(data.roomId).emit("typing:show", data.userName);
  });

  socket.on("typing:stop", (data: { roomId: string }) => {
    socket.to(data.roomId).emit("typing:hide");
  });

  // Disconnect
  socket.on("disconnect", () => {
    // Online users dan o'chirish
    onlineUsers.forEach((socketId, userId) => {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
      }
    });
    io.emit("users:online", Array.from(onlineUsers.keys()));
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 ChatFlow server running on port ${PORT}`);
});