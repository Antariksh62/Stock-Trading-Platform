import React, { useState } from "react";

/**
 * RazorpayTestCardNotice
 *
 * Displays a realistic Mastercard Test Card, step-by-step payment instructions,
 * and official Razorpay Test Mode disclaimers before checkout invocation.
 *
 * Card details strictly supplied for this project:
 * - Card Number: 5555 5100 0008 1006
 * - Card Type: Credit
 * - Card Category: Business
 * - CVV: Any random CVV
 * - Expiry Date: Any future date
 */
const RazorpayTestCardNotice = () => {
  const [copied, setCopied] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);

  const formattedCardNumber = "5555 5100 0008 1006";

  const handleCopy = async (e) => {
    if (e) e.preventDefault();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(formattedCardNumber);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = formattedCardNumber;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn("Copy to clipboard failed:", err);
    }
  };

  return (
    <div
      className="razorpay-test-mode-section"
      style={{
        margin: "14px 0",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      {/* 1. Header with Test Mode Badge & Disclaimer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "10px",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              background: "#fff3e0",
              color: "#e65100",
              border: "1px solid #ffe0b2",
              fontSize: "0.68rem",
              fontWeight: "700",
              letterSpacing: "0.5px",
              padding: "2px 6px",
              borderRadius: "3px",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span style={{ fontSize: "0.55rem" }}>●</span>
            TEST MODE
          </span>
          <span style={{ fontSize: "0.82rem", fontWeight: "600", color: "#333" }}>
            Razorpay Sandbox Simulator
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowInstructions(!showInstructions)}
          style={{
            background: "none",
            border: "none",
            color: "#387ed1",
            fontSize: "0.75rem",
            cursor: "pointer",
            padding: "2px 4px",
            textDecoration: "underline",
          }}
        >
          {showInstructions ? "Hide Instructions" : "View Instructions"}
        </button>
      </div>

      {/* 2. Visual Mastercard Test Card */}
      <div
        className="test-card-container"
        style={{
          background: "linear-gradient(135deg, #161e2e 0%, #222d42 55%, #182333 100%)",
          borderRadius: "8px",
          padding: "16px 18px",
          color: "#ffffff",
          boxShadow: "0 4px 14px rgba(0, 0, 0, 0.16)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          position: "relative",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      >
        {/* Subtle decorative background watermarks */}
        <div
          style={{
            position: "absolute",
            top: "-30px",
            right: "-20px",
            width: "120px",
            height: "120px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(235, 0, 27, 0.12) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-30px",
            right: "30px",
            width: "120px",
            height: "120px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(247, 158, 27, 0.12) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        {/* Card Top Row: Chip + Contactless + Mastercard Brand Logo */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "14px",
          }}
        >
          {/* Chip & NFC symbol */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "28px",
                height: "20px",
                borderRadius: "3px",
                background: "linear-gradient(135deg, #ffd700 0%, #b8860b 100%)",
                border: "1px solid #996515",
                boxShadow: "inset 0 1px 2px rgba(255,255,255,0.4)",
                position: "relative",
              }}
              title="EMV Smart Chip"
            />
            {/* Contactless / NFC SVG */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffffff88"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 8.5a7 7 0 0 1 14 0" />
              <path d="M8.5 12a3.5 3.5 0 0 1 7 0" />
            </svg>
          </div>

          {/* Official Mastercard Brandmark (SVG) */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              lineHeight: 1,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
              {/* Red Circle */}
              <div
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  background: "#EB001B",
                }}
              />
              {/* Yellow/Orange Circle */}
              <div
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  background: "#F79E1B",
                  marginLeft: "-8px",
                  opacity: 0.95,
                }}
              />
            </div>
            <span
              style={{
                fontSize: "0.55rem",
                letterSpacing: "0.5px",
                color: "#e0e0e0",
                marginTop: "2px",
                fontWeight: "700",
                fontFamily: "Arial, sans-serif",
              }}
            >
              mastercard
            </span>
          </div>
        </div>

        {/* Card Middle: Card Number + Copy Button */}
        <div style={{ marginBottom: "12px" }}>
          <div
            style={{
              fontSize: "0.65rem",
              textTransform: "uppercase",
              letterSpacing: "1px",
              color: "#9aa5b8",
              marginBottom: "3px",
            }}
          >
            Card Number (Mastercard Test)
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontFamily: "Consolas, 'Roboto Mono', Monaco, monospace",
                fontSize: "1.08rem",
                fontWeight: "600",
                letterSpacing: "2.2px",
                color: "#ffffff",
                textShadow: "0 1px 3px rgba(0,0,0,0.6)",
                wordBreak: "break-all",
              }}
            >
              {formattedCardNumber}
            </span>

            {/* Copy Button */}
            <button
              type="button"
              onClick={handleCopy}
              title="Copy card number to clipboard"
              style={{
                background: copied ? "#2e7d32" : "rgba(255, 255, 255, 0.16)",
                border: copied ? "1px solid #4caf50" : "1px solid rgba(255, 255, 255, 0.3)",
                color: "#ffffff",
                padding: "4px 10px",
                borderRadius: "4px",
                fontSize: "0.74rem",
                fontWeight: "600",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                transition: "all 0.15s ease",
                userSelect: "none",
                flexShrink: 0,
              }}
            >
              {copied ? (
                <>
                  <span style={{ fontSize: "0.8rem" }}>✓</span>
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Card Bottom Row: Metadata (Type, Expiry, CVV) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr 1fr",
            gap: "8px",
            borderTop: "1px solid rgba(255, 255, 255, 0.12)",
            paddingTop: "10px",
            fontSize: "0.72rem",
          }}
        >
          <div>
            <div style={{ color: "#9aa5b8", fontSize: "0.6rem", textTransform: "uppercase" }}>
              Card Type
            </div>
            <div style={{ fontWeight: "600", color: "#f0f4f8" }}>Credit (Business)</div>
          </div>
          <div>
            <div style={{ color: "#9aa5b8", fontSize: "0.6rem", textTransform: "uppercase" }}>
              Expiry Date
            </div>
            <div style={{ fontWeight: "600", color: "#f0f4f8" }}>Any future date (e.g. 12/30)</div>
          </div>
          <div>
            <div style={{ color: "#9aa5b8", fontSize: "0.6rem", textTransform: "uppercase" }}>
              CVV
            </div>
            <div style={{ fontWeight: "600", color: "#f0f4f8" }}>Any random CVV (e.g. 123)</div>
          </div>
        </div>
      </div>

      {/* 3. Test Payment Instructions Underneath Card */}
      {showInstructions && (
        <div
          className="test-instructions-box"
          style={{
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: "6px",
            padding: "12px 14px",
            marginTop: "10px",
            fontSize: "0.78rem",
            color: "#4b5563",
            lineHeight: "1.45",
          }}
        >
          <div
            style={{
              fontWeight: "600",
              color: "#1f2937",
              marginBottom: "8px",
              fontSize: "0.8rem",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>📝</span>
            <span>Razorpay Test Mode Payment Steps</span>
          </div>

          <ol style={{ margin: 0, paddingLeft: "18px" }}>
            <li style={{ marginBottom: "4px" }}>
              Enter the amount you want to deposit into your trading wallet.
            </li>
            <li style={{ marginBottom: "4px" }}>
              Click <strong>Pay with Razorpay</strong>.
            </li>
            <li style={{ marginBottom: "4px" }}>
              Select <strong>Card</strong> in the Razorpay Checkout window.
            </li>
            <li style={{ marginBottom: "4px" }}>
              Enter the Mastercard number displayed above (<code>5555 5100 0008 1006</code>).
            </li>
            <li style={{ marginBottom: "4px" }}>
              Enter a random CVV (e.g. <code>123</code>).
            </li>
            <li style={{ marginBottom: "4px" }}>
              Enter an expiry date later than today's date (e.g. <code>12/30</code>).
            </li>
            <li style={{ marginBottom: "2px" }}>
              Complete the authentication step using the appropriate Razorpay test-mode credentials and instructions.
            </li>
          </ol>

          {/* OTP Verification Guidance */}
          <div
            style={{
              marginTop: "10px",
              padding: "8px 10px",
              background: "#e8f4fd",
              border: "1px solid #bfdbfe",
              borderRadius: "4px",
              fontSize: "0.75rem",
              color: "#1e40af",
            }}
          >
            <strong>🔐 Simulated OTP & Authentication Flow:</strong>
            <div style={{ marginTop: "3px" }}>
              Razorpay Test Mode operates in an automated sandbox. On the test bank authentication screen, click the <strong>Success</strong> button (or enter standard test OTP <code>123456</code>) to simulate bank authorization. <em>No real phone number or SMS OTP is required.</em>
            </div>
          </div>
        </div>
      )}

      {/* 4. Prominent Test Mode Disclaimer */}
      <div
        className="test-mode-disclaimer"
        style={{
          marginTop: "10px",
          padding: "8px 12px",
          background: "#fff9e6",
          border: "1px solid #ffe8b3",
          borderRadius: "4px",
          fontSize: "0.75rem",
          color: "#7d5200",
          lineHeight: "1.4",
          display: "flex",
          alignItems: "flex-start",
          gap: "8px",
        }}
      >
        <span style={{ fontSize: "0.9rem", flexShrink: 0, marginTop: "1px" }}>⚠️</span>
        <div>
          You're using <strong>Razorpay Test Mode</strong>. Payments are simulated for demonstration purposes. No real money will be deducted when using valid Razorpay Test Mode credentials.
        </div>
      </div>
    </div>
  );
};

export default RazorpayTestCardNotice;
