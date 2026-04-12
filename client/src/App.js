import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:3000");

function App() {
  const [username, setUsername] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [players, setPlayers] = useState([]);
  const [joined, setJoined] = useState(false);
  const [gameMaster, setGameMaster] = useState(null);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [guess, setGuess] = useState("");

  const [myId, setMyId] = useState("");
  const [messages, setMessages] = useState([]);
  const [timeLeft, setTimeLeft] = useState(60);
  const [winner, setWinner] = useState("");

  const messagesEndRef = useRef(null);

  // ✅ Get socket ID
  useEffect(() => {
    const handleConnect = () => {
      setMyId(socket.id);
    };

    socket.on("connect", handleConnect);

    return () => {
      socket.off("connect", handleConnect);
    };
  }, []);

  const isGameMaster = myId === gameMaster;

  // ✅ Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ✅ Timer logic (SEPARATE useEffect)
  useEffect(() => {
    if (!currentQuestion) return;

    setTimeLeft(60);

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [currentQuestion]);

  // ✅ Socket listeners
  useEffect(() => {
    socket.on("player_list", (data) => {
      setPlayers(data.players);
      setGameMaster(data.gameMaster);
    });

    socket.on("game_started", (data) => {
      setCurrentQuestion(data.question);
      setWinner("");

      setMessages((prev) => [
        ...prev,
        { text: "🎮 Game started!", type: "system" },
      ]);
    });

    socket.on("player_guessed", (data) => {
      setMessages((prev) => [
        ...prev,
        { text: `${data.username}: ${data.guess}`, type: "player" },
      ]);
    });

    socket.on("game_won", (data) => {
      setWinner(data.winner);

      setMessages((prev) => [
        ...prev,
        { text: `🏆 ${data.winner} won! Answer: ${data.answer}`, type: "win" },
      ]);

      setCurrentQuestion("");
    });

    socket.on("guess_result", (data) => {
      setMessages((prev) => [
        ...prev,
        {
          text: `❌ Wrong! Attempts left: ${data.attemptsLeft}`,
          type: "error",
        },
      ]);
    });

    socket.on("game_over", (data) => {
      setMessages((prev) => [
        ...prev,
        { text: `⏱️ Time up! Answer was: ${data.answer}`, type: "system" },
      ]);

      setWinner("");
      setCurrentQuestion("");
    });

    return () => {
      socket.off("player_list");
      socket.off("game_started");
      socket.off("player_guessed");
      socket.off("game_won");
      socket.off("guess_result");
      socket.off("game_over");
    };
  }, []);

  const joinSession = () => {
    if (!username || !sessionId) {
      alert("Enter username and session ID");
      return;
    }

    socket.emit("join_session", { username, sessionId });
    setJoined(true);
  };

  return (
    <div style={{ padding: 20 }}>
      {!joined ? (
        <div>
          <h2>Join Game</h2>

          <input
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <br /><br />

          <input
            placeholder="Session ID"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
          />
          <br /><br />

          <button onClick={joinSession}>Join</button>
        </div>
      ) : (
        <div>
          <h2>Players in Session</h2>

          <ul>
            {players.map((p) => (
              <li key={p.id}>
                {p.username} - {p.score}
                {p.id === gameMaster && " 👑"}
              </li>
            ))}
          </ul>

          {/* 👑 Game Master */}
          {isGameMaster && !currentQuestion && (
            <div>
              <input
                placeholder="Enter question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
              <br /><br />

              <input
                placeholder="Enter answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
              <br /><br />

              <button
                onClick={() =>
                  socket.emit("start_game", {
                    sessionId,
                    question,
                    answer,
                  })
                }
              >
                Start Game
              </button>
            </div>
          )}

          {/* 🎮 Game */}
          {currentQuestion && (
            <div>
              <h3>⏱ {timeLeft}s</h3>
              <h3>Question: {currentQuestion}</h3>

              <input
                placeholder="Your guess"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
              />

              <button
                onClick={() => {
                  socket.emit("submit_guess", { sessionId, guess });
                  setGuess("");
                }}
              >
                Submit Guess
              </button>
            </div>
          )}

          {/* 🏆 Winner */}
          {winner && (
            <div style={{ marginTop: 10, color: "green" }}>
              🏆 {winner} wins this round!
            </div>
          )}

          {/* 💬 Game Log */}
          <div style={{ marginTop: 20 }}>
            <h3>Game Log</h3>

            <div
              style={{
                border: "1px solid #ccc",
                padding: 10,
                height: 200,
                overflowY: "scroll",
                background: "#f9f9f9",
              }}
            >
              {messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    marginBottom: 5,
                    color:
                      m.type === "win"
                        ? "green"
                        : m.type === "error"
                        ? "red"
                        : m.type === "player"
                        ? "blue"
                        : "black",
                  }}
                >
                  {m.text}
                </div>
              ))}

              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;