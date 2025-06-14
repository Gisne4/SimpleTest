const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require("mongoose");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// --- MongoDB Connection ---
mongoose
  .connect(
    "mongodb+srv://dkrkd010:L0JYhkQmsmriyW3j@krlee.slxnsqd.mongodb.net/?retryWrites=true&w=majority&appName=KRLEE"
  )
  .then(() => console.log("MongoDB connected successfully"))
  .catch((err) => console.error("MongoDB connection error:", err));

// --- Mongoose Schema and Model ---
const QuestionSchema = new mongoose.Schema({
  question: { type: String, required: true },
  answer: { type: String, required: true, enum: ["O", "X"] },
  explanation: { type: String, default: "" }, // Added explanation field
});

const Question = mongoose.model("Question", QuestionSchema);

// --- Express Middleware ---
app.use(express.json()); // For parsing application/json
app.use(express.static(path.join(__dirname, "public"))); // Serve static files from 'public' directory

// --- API Routes ---

// GET all questions
app.get("/api/questions", async (req, res) => {
  try {
    const questions = await Question.find({});
    res.status(200).json(questions);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching questions", error: error.message });
  }
});

// POST a new question
app.post("/api/questions", async (req, res) => {
  try {
    const { question, answer, explanation } = req.body;
    if (!question || !answer || !["O", "X"].includes(answer)) {
      return res
        .status(400)
        .json({ message: "Question and a valid answer (O/X) are required." });
    }
    const newQuestion = new Question({
      question,
      answer,
      explanation: explanation || "",
    }); // Save explanation
    await newQuestion.save();
    res
      .status(201)
      .json({ message: "Question added successfully", question: newQuestion });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error adding question", error: error.message });
  }
});

// DELETE a question by ID
app.delete("/api/questions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Question.findByIdAndDelete(id);
    if (!result) {
      return res.status(404).json({ message: "Question not found." });
    }
    res.status(200).json({ message: "Question deleted successfully." });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting question", error: error.message });
  }
});

// --- Game Logic Variables ---
const rooms = {}; // Stores active rooms { roomId: { hostId, players: {}, gameStarted, currentQuestionIndex, questions: [], questionTimer, lastActivity } }
const MAX_PLAYERS_PER_ROOM = 8; // Max players per room
const QUESTION_DURATION = 20; // Seconds for each question
const ROOM_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
const GAME_QUESTION_COUNT = 20; // 定义游戏问题数量为20

// --- Helper Functions ---
function generateRoomId() {
  let roomId;
  do {
    roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  } while (rooms[roomId]);
  return roomId;
}

function getAvailableRooms() {
  const availableRooms = [];
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (
      !room.gameStarted &&
      Object.keys(room.players).length < MAX_PLAYERS_PER_ROOM
    ) {
      availableRooms.push({
        id: roomId,
        playersCount: Object.keys(room.players).length,
        maxPlayers: MAX_PLAYERS_PER_ROOM,
      });
    }
  }
  return availableRooms;
}

// Clean up inactive rooms
setInterval(() => {
  const now = new Date();
  for (const roomId in rooms) {
    const room = rooms[roomId];
    // Clean up if no players and game not started, or inactive for too long
    if (
      (Object.keys(room.players).length === 0 && !room.gameStarted) ||
      now - room.lastActivity > ROOM_CLEANUP_INTERVAL
    ) {
      if (room.questionTimer) {
        clearTimeout(room.questionTimer);
      }
      delete rooms[roomId];
      console.log(`Cleaned up inactive or empty room: ${roomId}`);
      io.emit("updateRoomList", getAvailableRooms());
    }
  }
}, 60 * 1000); // Check every minute

// --- Socket.IO Connection Handling ---
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);
  socket.emit("updateRoomList", getAvailableRooms()); // Send available rooms to new connection

  // Player creating a new room
  socket.on("createOnlyRoom", ({ playerName }) => {
    if (!playerName || playerName.trim() === "") {
      socket.emit("message", "유효한 닉네임을 입력하세요!");
      return;
    }

    // Leave any existing room first
    if (socket.data.roomId && rooms[socket.data.roomId]) {
      const oldRoomId = socket.data.roomId;
      const oldRoom = rooms[oldRoomId];
      socket.leave(oldRoomId);
      if (oldRoom && oldRoom.players[socket.id]) {
        delete oldRoom.players[socket.id];
        io.to(oldRoomId).emit("updatePlayers", oldRoom.players);
        io.to(oldRoomId).emit(
          "message",
          `${playerName} 방을 떠났습니다 ${oldRoomId}。`
        );
        console.log(
          `Player ${playerName} left old room ${oldRoomId} to create a new one.`
        );
        // If old room is empty and not in game, clean it up
        if (Object.keys(oldRoom.players).length === 0 && !oldRoom.gameStarted) {
          delete rooms[oldRoomId];
          console.log(`Cleaned up empty room ${oldRoomId}`);
        }
      }
      delete socket.data.roomId; // Clear old room ID from socket data
    }

    const newRoomId = generateRoomId();
    rooms[newRoomId] = {
      hostId: socket.id,
      players: {},
      gameStarted: false,
      currentQuestionIndex: 0,
      questionTimer: null,
      questions: [],
      lastActivity: new Date(),
    };

    socket.join(newRoomId);
    socket.data.roomId = newRoomId; // Store room ID on socket
    rooms[newRoomId].players[socket.id] = { name: playerName, score: 0 };
    rooms[newRoomId].lastActivity = new Date();

    socket.emit("roomJoined", { roomId: newRoomId, isHost: true });
    io.to(newRoomId).emit("updatePlayers", rooms[newRoomId].players);
    io.to(newRoomId).emit(
      "message",
      `${playerName} 가 참여했습니다 ${newRoomId}。`
    );
    console.log(
      `New room ${newRoomId} created and joined by ${playerName} (${socket.id}).`
    );
    io.emit("updateRoomList", getAvailableRooms()); // Notify all clients
  });

  // Player joining an existing room or creating if not found
  socket.on("createOrJoinRoom", ({ roomId, playerName }) => {
    if (!playerName || playerName.trim() === "") {
      socket.emit("message", "유효한 닉네임을 입력하세요");
      return;
    }

    // Leave any existing room first
    if (socket.data.roomId && rooms[socket.data.roomId]) {
      const oldRoomId = socket.data.roomId;
      const oldRoom = rooms[oldRoomId];
      socket.leave(oldRoomId);
      if (oldRoom && oldRoom.players[socket.id]) {
        delete oldRoom.players[socket.id];
        io.to(oldRoomId).emit("updatePlayers", oldRoom.players);
        io.to(oldRoomId).emit(
          "message",
          `${playerName}가 ${oldRoomId}방을 떠나셨습니다。`
        );
        console.log(`Player ${playerName} left old room ${oldRoomId}.`);
        if (Object.keys(oldRoom.players).length === 0 && !oldRoom.gameStarted) {
          delete rooms[oldRoomId];
          console.log(`Cleaned up empty room ${oldRoomId}`);
        }
      }
      delete socket.data.roomId; // Clear old room ID from socket data
    }

    const room = rooms[roomId];

    if (
      !room ||
      room.gameStarted ||
      Object.keys(room.players).length >= MAX_PLAYERS_PER_ROOM
    ) {
      socket.emit("message", "방이 존재하지않거나, 이미 시작하였습니다");
      io.emit("updateRoomList", getAvailableRooms()); // Ensure client has updated list
      return;
    }

    socket.join(roomId);
    socket.data.roomId = roomId; // Store room ID on socket
    room.players[socket.id] = { name: playerName, score: 0 };
    room.lastActivity = new Date();

    const isHost = room.hostId === socket.id;
    socket.emit("roomJoined", { roomId: roomId, isHost: isHost });
    io.to(roomId).emit("updatePlayers", room.players);
    io.to(roomId).emit(
      "message",
      `${playerName} 가 입장하셨습니다 ${roomId}。`
    );
    console.log(`Player ${playerName} (${socket.id}) joined room ${roomId}.`);
    io.emit("updateRoomList", getAvailableRooms());
  });

  // Host starts the game
  socket.on('startGame', async () => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];

    if (!room || socket.id !== room.hostId || room.gameStarted) {
        socket.emit('message', '只有房主才能开始游戏，或者游戏已开始！');
        return;
    }

    // Fetch questions from DB
    try {
        const allQuestions = await Question.find({});
        if (allQuestions.length === 0) {
            socket.emit('message', '数据库中没有题目，请先添加一些题目！');
            return;
        }

        // --- 核心修改：随机抽取20个问题 ---
        // 1. 随机打乱所有题目
        const shuffledQuestions = allQuestions.sort(() => 0.5 - Math.random());

        // 2. 截取前 GAME_QUESTION_COUNT 个问题
        //    如果总问题数不足 GAME_QUESTION_COUNT，则使用所有可用问题
        room.questions = shuffledQuestions.slice(0, GAME_QUESTION_COUNT);

        if (room.questions.length === 0) {
            socket.emit('message', '没有足够的题目来开始游戏。请添加更多题目！');
            return;
        }
        // --- 核心修改结束 ---


        room.currentQuestionIndex = 0;
        room.gameStarted = true;
        room.lastActivity = new Date();

        io.to(roomId).emit('gameStart');
        io.to(roomId).emit('message', '游戏开始！');
        io.emit('updateRoomList', getAvailableRooms()); // Update room list (room now unavailable)
        sendNextQuestion(roomId);
    } catch (error) {
        console.error('Error fetching questions for game:', error);
        socket.emit('message', '启动游戏失败：无法加载题目。');
    }
});

  // Send the next question to the room
  function sendNextQuestion(roomId) {
    const room = rooms[roomId];
    if (!room || !room.gameStarted) return;

    if (room.currentQuestionIndex < room.questions.length) {
      const question = room.questions[room.currentQuestionIndex];
      // Reset player scores for the next round (if starting new game after previous one)
      // Or reset answers
      Object.values(room.players).forEach((player) => {
        player.answered = false; // Mark player as not having answered yet for current question
      });

      io.to(roomId).emit("newQuestion", {
        question: question.question,
        index: room.currentQuestionIndex,
        total: room.questions.length,
        duration: QUESTION_DURATION,
        correct_answer: question.answer, // Include correct answer for frontend display
        explanation: question.explanation, // Include explanation for frontend display
      });
      room.lastActivity = new Date();

      if (room.questionTimer) {
        clearTimeout(room.questionTimer);
      }
      room.questionTimer = setTimeout(() => {
        // Time's up, process answers
        processEndOfQuestion(roomId);
      }, QUESTION_DURATION * 1000);
    } else {
      // Game over
      endGame(roomId);
    }
  }

  // --- 新增：鼠标光标移动处理 ---
socket.on('cursorMove', (data) => {
  const roomId = socket.data.roomId;
  const room = rooms[roomId];

  if (!room || !room.players[socket.id]) {
      return; // 玩家不在房间内
  }

  const playerName = room.players[socket.id].name;

  // 将光标数据广播给房间内的所有其他玩家
  // 不发回给自己，因为自己的光标已经显示
  socket.to(roomId).emit('cursorUpdate', {
      playerId: socket.id,
      playerName: playerName,
      x: data.x,
      y: data.y
  });
});

  // Player answers a question
  socket.on("answer", (answer) => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    const player = room?.players[socket.id];

    if (!room || !player || !room.gameStarted || player.answered) {
      socket.emit("message", "쫌만 기둘");
      return;
    }

    const currentQuestion = room.questions[room.currentQuestionIndex];
    const isCorrect = answer === currentQuestion.answer;

    player.answered = true; // Mark player as answered
    player.score += isCorrect ? 1 : 0;
    room.lastActivity = new Date();

    // Send feedback to the player who answered
    socket.emit("playerAnswered", {
      playerId: socket.id,
      correct: isCorrect,
      correct_answer: currentQuestion.answer, // Send correct answer back
      explanation: currentQuestion.explanation, // Send explanation back
    });

    // Check if all active players have answered
    const allAnswered = Object.values(room.players).every((p) => p.answered);
    if (allAnswered) {
      if (room.questionTimer) {
        clearTimeout(room.questionTimer); // Stop timer if all answered early
      }
      processEndOfQuestion(roomId);
    }

    // Update all players' scores in the lobby (even during game)
    io.to(roomId).emit("updatePlayers", room.players);
  });

  function processEndOfQuestion(roomId) {
    const room = rooms[roomId];
    if (!room || !room.gameStarted) return;

    // If timer ran out, ensure all players who didn't answer are marked as answered
    Object.values(room.players).forEach((p) => {
      if (!p.answered) {
        p.answered = true; // Mark as answered to move on
        // No score change for unanswered questions
      }
    });

    // This part is crucial: after the timer, advance to next question
    // Frontend will show the correct answer and explanation based on 'playerAnswered' event or 'newQuestion' next round
    room.currentQuestionIndex++;
    room.lastActivity = new Date();
    // Give frontend a moment to display final feedback for current question
    setTimeout(() => {
      sendNextQuestion(roomId);
    }, 3000); // Wait 3 seconds before sending next question
  }

  function endGame(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    if (room.questionTimer) {
      clearTimeout(room.questionTimer);
    }
    room.gameStarted = false;
    room.lastActivity = new Date();

    io.to(roomId).emit("gameEnd", room.players); // Send final scores
    io.to(roomId).emit("message", "게임이 종료되었습니다");
    console.log(`Game ended for room ${roomId}`);

    // Reset scores for next game in the same room (optional, depending on game flow)
    Object.values(room.players).forEach((player) => (player.score = 0));
    io.to(roomId).emit("updatePlayers", room.players); // Update scores in lobby
    io.emit("updateRoomList", getAvailableRooms()); // Update room list (room now available)
  }

  // Player disconnects
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      const room = rooms[roomId];
      if (room.players[socket.id]) {
        const playerName = room.players[socket.id].name;
        delete room.players[socket.id];
        io.to(roomId).emit("updatePlayers", room.players); // Update players for others in room
        io.to(roomId).emit("message", `${playerName} 방을 떠났습니다`);
        console.log(`Player ${playerName} (${socket.id}) left room ${roomId}.`);

        if (Object.keys(room.players).length === 0) {
          // If room becomes empty, clean it up
          if (room.questionTimer) {
            clearTimeout(room.questionTimer);
          }
          delete rooms[roomId];
          console.log(`Room ${roomId} is empty and cleaned up.`);
        } else if (room.hostId === socket.id) {
          // If host leaves, assign new host or end game
          const newHostId = Object.keys(room.players)[0];
          if (newHostId) {
            room.hostId = newHostId;
            io.to(newHostId).emit("message", "당신이 방장입니다");
            // Update host status for all players in the room (optional, but good practice)
            io.to(roomId).emit("updatePlayers", room.players); // Re-broadcast to update host styling
          } else {
            // No players left, room will be cleaned up by interval
            if (room.questionTimer) {
              clearTimeout(room.questionTimer);
            }
            delete rooms[roomId]; // Should be handled by the empty check above
            console.log(`Room ${roomId} has no new host.`);
          }
          if (room.gameStarted) {
            // End game if host leaves mid-game
            endGame(roomId);
            io.to(roomId).emit("message", "방장이 떠났습니다");
          }
        }
      }
    }
    io.emit("updateRoomList", getAvailableRooms()); // Update room list for all clients
  });
  // --- 新增：聊天消息处理 ---
  socket.on("sendMessage", (message) => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];

    if (!room || !room.players[socket.id]) {
      // 如果玩家不在房间或数据异常，则不发送消息
      socket.emit("message", "채팅은 방에 들어가서 해라");
      return;
    }

    const senderName = room.players[socket.id].name;

    // 向房间内的所有玩家广播聊天消息
    io.to(roomId).emit("chatMessage", {
      senderId: socket.id, // 发送者ID，用于前端判断是自己还是其他人
      senderName: senderName,
      message: message,
    });
    console.log(`Room ${roomId} - ${senderName}: ${message}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
