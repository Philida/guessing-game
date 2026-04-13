const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3000;

let sessions = {};

// 👑 helper
function getNextGameMaster(session) {
  const currentIndex = session.players.findIndex(
    (p) => p.id === session.gameMaster
  );
  const nextIndex = (currentIndex + 1) % session.players.length;
  return session.players[nextIndex].id;
}

app.get("/", (req, res) => {
  res.send("Server is running");
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // JOIN
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

    const exists = session.players.find((p) => p.id === socket.id);
    if (!exists) {
      session.players.push({
        id: socket.id,
        username,
        score: 0,
      });
    }

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

    if (!question || !answer) {
      io.to(socket.id).emit("error_message", "Enter question and answer");
      return;
    }

    if (session.gameMaster !== socket.id) {
      io.to(socket.id).emit("error_message", "Only game master can start");
      return;
    }

    if (session.players.length <= 2) {
      io.to(socket.id).emit("error_message", "Need more than 2 players");
      return;
    }

    session.status = "in_progress";
    session.question = question;
    session.answer = answer.toLowerCase();

    session.attempts = {};
    session.players.forEach((p) => {
      session.attempts[p.id] = 3;
    });

    if (session.timer) clearTimeout(session.timer);

    session.timer = setTimeout(() => {
      if (session.status === "in_progress") {
        session.status = "ended";

        io.to(sessionId).emit("game_over", {
          answer: session.answer,
        });

        // 🔥 rotate GM
        session.gameMaster = getNextGameMaster(session);

        // reset
        session.status = "waiting";
        session.question = "";
        session.answer = "";
        session.timer = null;

        io.to(sessionId).emit("player_list", {
          players: session.players,
          gameMaster: session.gameMaster,
        });
      }
    }, 60000);

    io.to(sessionId).emit("game_started", {
      question: session.question,
    });
  });

  // GUESS
  socket.on("submit_guess", ({ sessionId, guess }) => {
    const session = sessions[sessionId];
    if (!session || session.status !== "in_progress") return;

    const player = session.players.find((p) => p.id === socket.id);

    if (!session.attempts[socket.id] || session.attempts[socket.id] <= 0)
      return;

    io.to(sessionId).emit("player_guessed", {
      username: player?.username,
      guess,
    });

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

      // 🔥 rotate GM
      session.gameMaster = getNextGameMaster(session);

      // reset
      session.status = "waiting";
      session.question = "";
      session.answer = "";

      io.to(sessionId).emit("player_list", {
        players: session.players,
        gameMaster: session.gameMaster,
      });

      return;
    }

    session.attempts[socket.id]--;

    io.to(socket.id).emit("guess_result", {
      attemptsLeft: session.attempts[socket.id],
    });
  });

  // DISCONNECT
  socket.on("disconnect", () => {
    for (let sessionId in sessions) {
      const session = sessions[sessionId];

      session.players = session.players.filter(
        (p) => p.id !== socket.id
      );

      if (session.players.length === 0) {
        delete sessions[sessionId];
      } else {
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

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});