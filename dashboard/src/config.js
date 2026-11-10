// Centralized API, WebSocket, and Navigation Configuration
// In production (same-origin Render deployment), defaults to relative paths.
// In standalone local development (port 3000), falls back to localhost:3001.

export const API_BASE =
  process.env.REACT_APP_API_URL !== undefined
    ? process.env.REACT_APP_API_URL
    : typeof window !== "undefined" && window.location.port === "3000"
    ? "http://localhost:3001"
    : "";

export const SOCKET_URL =
  process.env.REACT_APP_SOCKET_URL !== undefined
    ? process.env.REACT_APP_SOCKET_URL
    : typeof window !== "undefined" && window.location.port === "3000"
    ? "http://localhost:3001"
    : "/";

export const FRONTEND_URL =
  process.env.REACT_APP_FRONTEND_URL !== undefined
    ? process.env.REACT_APP_FRONTEND_URL
    : typeof window !== "undefined" && window.location.port === "3000"
    ? "http://localhost:5173"
    : "";

