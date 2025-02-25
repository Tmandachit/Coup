require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const connection = require("./db"); // ✅ Ensure db.js exists

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000"],
  },
});

app.use(cors());
app.use(express.json());

// ✅ Ensure MySQL connection is established
connection.connect((err) => {
  if (err) {
    console.error("❌ MySQL Connection Failed:", err);
    process.exit(1);
  }
  console.log("✅ MySQL Connected!");
});

// ✅ SOCKET.IO - Handling Lobbies
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("join-lobby", ({ username, lobby }) => {
    // Check if lobby exists
    connection.query("SELECT id FROM lobbies WHERE name = ?", [lobby], (err, results) => {
      if (err) {
        console.error("Error fetching lobby:", err);
        return;
      }

      if (results.length === 0) {
        // Create lobby if not exists
        connection.query("INSERT INTO lobbies (name) VALUES (?)", [lobby], (err, result) => {
          if (err) {
            console.error("Error creating lobby:", err);
            return;
          }

          addUserToLobby(result.insertId, username, lobby);
        });
      } else {
        addUserToLobby(results[0].id, username, lobby);
      }
    });
  });

  function addUserToLobby(lobbyId, username, lobby) {
    connection.query("INSERT INTO lobby_users (lobby_id, username) VALUES (?, ?) ON DUPLICATE KEY UPDATE username=username",
      [lobbyId, username], (err) => {
        if (err) {
          console.error("Error adding user to lobby:", err);
          return;
        }

        // Fetch all users in the lobby
        connection.query("SELECT username FROM lobby_users WHERE lobby_id = ?", [lobbyId], (err, users) => {
          if (err) {
            console.error("Error fetching users:", err);
            return;
          }

          const userList = users.map(user => user.username);
          io.to(lobby).emit("lobby-update", userList);
        });
      }
    );
  }

  // User disconnects -> Remove them from lobbies
  socket.on("disconnecting", () => {
    for (const lobby of socket.rooms) {
      connection.query(
        "DELETE FROM lobby_users WHERE username = ?",
        [socket.id],
        (err) => {
          if (err) {
            console.error("Error removing user:", err);
            return;
          }

          io.to(lobby).emit("lobby-update");
        }
      );
    }
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// ✅ Start Server
server.listen(5001, () => console.log("🚀 Server started on port 5001"));
