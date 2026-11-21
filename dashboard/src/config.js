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
  typeof window !== "undefined" && window.location.port !== "3000"
    ? ""
    : process.env.REACT_APP_FRONTEND_URL !== undefined
    ? process.env.REACT_APP_FRONTEND_URL
    : "http://localhost:5173";

// Razorpay Public Test Key ID for Frontend Checkout
export const RAZORPAY_KEY_ID =
  (typeof process !== "undefined" &&
    process.env &&
    (process.env.REACT_APP_RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID)) ||
  (typeof window !== "undefined" &&
    (window.VITE_RAZORPAY_KEY_ID || window.__ENV__?.VITE_RAZORPAY_KEY_ID)) ||
  "";


