import { useState, useEffect, useRef } from "react";

function App() {
  const [username, setUsername] = useState("");
  const [token, setToken] = useState(null);

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [lastId, setLastId] = useState("0");

  const [online, setOnline] = useState([]);

  const messagesEndRef = useRef(null);

  // 🔐 LOGIN
  async function login() {
    const res = await fetch("http://localhost:3000/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username }),
    });

    const data = await res.json();
    setToken(data.token);
  }

  // 🔽 AUTO SCROLL
  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  // 💬 SEND MESSAGE
  async function sendMessage() {
    if (!message) return;

    await fetch("http://localhost:3000/teams/team1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ body: message }),
    });

    setMessage("");
  }

  // 📥 FETCH MESSAGES
  async function fetchMessages() {
    const res = await fetch(
      `http://localhost:3000/teams/team1/messages?since=${lastId}`,
      {
        headers: {
          Authorization: "Bearer " + token,
        },
      }
    );

    const data = await res.json();

    if (data.length > 0) {
      setMessages((prev) => [...prev, ...data]);
      setLastId(data[data.length - 1].id);

      setTimeout(scrollToBottom, 100);
    }
  }

  // 🟢 FETCH ONLINE USERS
  async function fetchOnlineUsers() {
    const res = await fetch("http://localhost:3000/heartbeat/online");
    const data = await res.json();
    setOnline(data);
  }

  // ❤️ HEARTBEAT (keeps user online)
  async function sendHeartbeat() {
    await fetch("http://localhost:3000/heartbeat", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
      },
    });
  }

  // 🔁 POLLING
  useEffect(() => {
    if (!token) return;

    const interval = setInterval(() => {
      fetchMessages();
      fetchOnlineUsers();
      sendHeartbeat();
    }, 2000);

    return () => clearInterval(interval);
  }, [token, lastId]);

  // 🔐 LOGIN UI
  if (!token) {
    return (
      <div style={{ padding: 50 }}>
        <h2>Login</h2>

        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
        />

        <button onClick={login}>Login</button>
      </div>
    );
  }

  // 💬 CHAT UI
  return (
    <div
      style={{
        maxWidth: 800,
        margin: "auto",
        marginTop: 50,
        fontFamily: "Arial",
      }}
    >
      <h2>Chat App</h2>

      <div style={{ display: "flex", gap: 40 }}>
        
        {/* ONLINE USERS */}
        <div>
          <h3>Online Users</h3>
          <ul>
            {online.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </div>

        {/* CHAT */}
        <div>
          <h3>Messages</h3>

          <div
            style={{
              height: 250,
              overflowY: "scroll",
              border: "1px solid gray",
              padding: 10,
              marginBottom: 10,
              background: "#111",
            }}
          >
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  textAlign: m.from === username ? "right" : "left",
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    background:
                      m.from === username ? "#4CAF50" : "#444",
                    padding: "6px 10px",
                    borderRadius: 10,
                    color: "white",
                    display: "inline-block",
                  }}
                >
                  <b>{m.from}:</b> {m.body}
                </span>
              </div>
            ))}

            {/* AUTO SCROLL TARGET */}
            <div ref={messagesEndRef}></div>
          </div>

          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="message"
          />

          <button onClick={sendMessage}>Send</button>
        </div>

      </div>
    </div>
  );
}

export default App;