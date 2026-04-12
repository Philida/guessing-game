const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);

// ✅ IMPORTANT: better CORS for production
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// ✅ REQUIRED FOR RENDER
const PORT = process.env.PORT || 3000;

let sessions = {};

app.get("/", (req, res) => {
  res.send("Server is running");
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // JOIN SESSION
  socket.on("join_session", ({ username, sessionId }) => {
    if (!sessions[sessionId]) {
      sessions[sessionId] = {
        players: [],
        gameMaster: null,
        status: "waiting",
        question: "",
        answer: "",
        attempts: {},
        timer: null,
      };
    }

    const session = sessions[sessionId];

    // prevent duplicate players
    const existingPlayer = session.players.find(
      (p) => p.id === socket.id
    );

    if (!existingPlayer) {
      session.players.push({
        id: socket.id,
        username,
        score: 0,
      });
    }

    // assign game master
    if (!session.gameMaster) {
      session.gameMaster = socket.id;
    }

    socket.join(sessionId);

    io.to(sessionId).emit("player_list", {
      players: session.players,
      gameMaster: session.gameMaster,
    });
  });

  // START GAME
  socket.on("start_game", ({ sessionId, question, answer }) => {
    const session = sessions[sessionId];
    if (!session) return;

    if (session.gameMaster !== socket.id) return;

    if (session.players.length <= 2) {
      io.to(socket.id).emit("error_message", "Need more than 2 players");
      return;
    }

    session.status = "in_progress";
    session.question = question;
    session.answer = answer.toLowerCase();

    // reset attempts
    session.attempts = {};
    session.players.forEach((p) => {
      session.attempts[p.id] = 3;
    });

    // clear old timer
    if (session.timer) {
      clearTimeout(session.timer);
    }

    // start timer (60s)
    session.timer = setTimeout(() => {
      if (session.status === "in_progress") {
        session.status = "ended";

        io.to(sessionId).emit("game_over", {
          answer: session.answer,
        });

        // reset game
        session.status = "waiting";
        session.question = "";
        session.answer = "";
        session.timer = null;
      }
    }, 60000);

    io.to(sessionId).emit("game_started", {
      question: session.question,
    });
  });

  // SUBMIT GUESS
  socket.on("submit_guess", ({ sessionId, guess }) => {
    const session = sessions[sessionId];
    if (!session || session.status !== "in_progress") return;

    const playerId = socket.id;
    const player = session.players.find((p) => p.id === playerId);

    if (!session.attempts[playerId] || session.attempts[playerId] <= 0)
      return;

    // 🔥 show guess to everyone
    io.to(sessionId).emit("player_guessed", {
      username: player?.username,
      guess,
    });

    // ✅ correct guess
    if (guess.toLowerCase() === session.answer) {
      session.status = "ended";

      if (session.timer) {
        clearTimeout(session.timer);
        session.timer = null;
      }

      if (player) player.score += 10;

      io.to(sessionId).emit("game_won", {
        winner: player?.username,
        answer: session.answer,
      });

      // reset game
      session.status = "waiting";
      session.question = "";
      session.answer = "";

      return;
    }

    // ❌ wrong guess
    session.attempts[playerId]--;

    io.to(socket.id).emit("guess_result", {
      correct: false,
      attemptsLeft: session.attempts[playerId],
    });
  });

  // DISCONNECT
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    for (let sessionId in sessions) {
      let session = sessions[sessionId];

      session.players = session.players.filter(
        (p) => p.id !== socket.id
      );

      if (session.players.length === 0) {
        delete sessions[sessionId];
      } else {
        // reassign game master
        if (session.gameMaster === socket.id) {
          session.gameMaster = session.players[0].id;
        }

        io.to(sessionId).emit("player_list", {
          players: session.players,
          gameMaster: session.gameMaster,
        });
      }
    }
  });
});

// ✅ START SERVER
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});