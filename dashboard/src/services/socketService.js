import { io } from "socket.io-client";

const SOCKET_URL = "http://localhost:3001";

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect(userId = "demo_user", token = null) {
    if (this.socket && this.socket.connected) {
      return this.socket;
    }

    this.socket = io(SOCKET_URL, {
      auth: { token },
      query: { userId },
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    this.socket.on("connect", () => {
      console.log(`[Socket.IO] Connected to backend on ${SOCKET_URL} (ID: ${this.socket.id})`);
    });

    this.socket.on("disconnect", (reason) => {
      console.warn(`[Socket.IO] Disconnected: ${reason}`);
    });

    this.socket.on("connect_error", (err) => {
      console.warn(`[Socket.IO] Connection error: ${err.message}`);
    });

    // Wire up events to registered listeners
    ["holdings_update", "positions_update", "orders_update", "funds_update"].forEach((event) => {
      this.socket.on(event, (data) => {
        const callbacks = this.listeners.get(event) || [];
        callbacks.forEach((cb) => cb(data));
      });
    });

    return this.socket;
  }

  subscribe(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);

    return () => {
      const callbacks = this.listeners.get(event) || [];
      this.listeners.set(
        event,
        callbacks.filter((cb) => cb !== callback)
      );
    };
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketService = new SocketService();
