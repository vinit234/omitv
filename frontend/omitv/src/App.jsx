import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { v4 as uuidv4 } from "uuid";

const socket = io("http://localhost:5000");

const App = () => {
  const [roomId, setRoomId] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnection = useRef(null);
  const remoteSocketId = useRef(null);

  const config = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

  useEffect(() => {
    socket.on("peer-joined", async (socketId) => {
      remoteSocketId.current = socketId;
      await createOffer(socketId);
    });

    socket.on("offer", async ({ senderId, offer }) => {
      remoteSocketId.current = senderId;
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);
      socket.emit("answer", { targetId: senderId, answer });
    });

    socket.on("answer", async ({ answer }) => {
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on("ice-candidate", ({ candidate }) => {
      peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
    });

    socket.on("peer-disconnected", () => {
      remoteVideoRef.current.srcObject = null;
    });

    socket.on("chat-message", ({ message, sender }) => {
      setMessages((prev) => [...prev, { message, sender }]);
    });

    socket.on("room-error", (msg) => {
      setError(msg);
    });
  }, []);

  const initConnection = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideoRef.current.srcObject = stream;

    peerConnection.current = new RTCPeerConnection(config);

    stream.getTracks().forEach((track) => {
      peerConnection.current.addTrack(track, stream);
    });

    peerConnection.current.ontrack = (event) => {
      remoteVideoRef.current.srcObject = event.streams[0];
    };

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate && remoteSocketId.current) {
        socket.emit("ice-candidate", {
          targetId: remoteSocketId.current,
          candidate: event.candidate,
        });
      }
    };
  };

  const createOffer = async (targetId) => {
    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offer);
    socket.emit("offer", { targetId, offer });
  };

  const createRoom = async () => {
    const newRoomId = uuidv4().slice(0, 8);
    setRoomId(newRoomId);
    await initConnection();
    socket.emit("create-room", newRoomId);
    setConnected(true);
  };

  const joinRoom = async () => {
    if (!roomId) return;
    await initConnection();
    socket.emit("join-room", roomId);
    setConnected(true);
  };

  const sendMessage = () => {
    if (newMessage.trim() && roomId) {
      const msgObj = { message: newMessage, sender: "You" };
      setMessages((prev) => [...prev, msgObj]);
      socket.emit("chat-message", { roomId, message: newMessage, sender: "Peer" });
      setNewMessage("");
    }
  };

  return (
    <div style={{ textAlign: "center", padding: "2rem" }}>
      <h2>WebRTC Video Call + Chat</h2>

      {!connected && (
        <>
          <button onClick={createRoom}>Create Room</button>
          <br />
          <input
            type="text"
            placeholder="Enter Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            style={{ marginTop: "1rem" }}
          />
          <br />
          <button onClick={joinRoom} style={{ marginTop: "0.5rem" }}>Join Room</button>
          {error && <p style={{ color: "red" }}>{error}</p>}
        </>
      )}

      <div style={{ display: "flex", justifyContent: "center", gap: "2rem", marginTop: "2rem" }}>
        <div>
          <h4>Local</h4>
          <video ref={localVideoRef} autoPlay playsInline muted width="300" height="200" />
        </div>
        <div>
          <h4>Remote</h4>
          <video ref={remoteVideoRef} autoPlay playsInline width="300" height="200" />
        </div>
      </div>

      {connected && (
        <>
          <p style={{ marginTop: "1rem" }}>Room ID: <strong>{roomId}</strong></p>
          <div style={{ marginTop: "2rem", textAlign: "left", width: "60%", marginInline: "auto" }}>
            <h3>Live Chat</h3>
            <div
              style={{
                border: "1px solid #ccc",
                padding: "1rem",
                height: "200px",
                overflowY: "auto",
                marginBottom: "1rem",
                backgroundColor: "#f9f9f9",
                borderRadius: "10px"
              }}
            >
              {messages.map((msg, index) => (
                <div key={index}>
                  <strong>{msg.sender}:</strong> {msg.message}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "1rem" }}>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                style={{ flexGrow: 1, padding: "0.5rem" }}
                placeholder="Type a message..."
              />
              <button onClick={sendMessage}>Send</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default App;
