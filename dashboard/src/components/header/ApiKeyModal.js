import React, { useState, useContext } from "react";
import { MarketContext } from "../../context/MarketContext";

export const ApiKeyModal = ({ isOpen, onClose }) => {
  const { apiKey, updateApiKey, quotaInfo, toggleMockMode, isMockMode } =
    useContext(MarketContext);

  const [inputKey, setInputKey] = useState(apiKey);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e) => {
    e.preventDefault();
    updateApiKey(inputKey);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1000);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Twelve Data API Configuration</h3>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSave} className="modal-body">
          <p className="modal-desc">
            Provide your Twelve Data Free Tier API Key. The Free Tier provides up to <strong>800 calls per day</strong>.
            You can also activate <strong>Simulation Mode</strong> to practice and test charts without consuming API calls.
          </p>

          <div className="quota-meter-box">
            <div className="quota-meter-header">
              <span>Daily Request Quota</span>
              <span className="text-white fw-bold">
                {quotaInfo.used} / {quotaInfo.total} used ({quotaInfo.remaining} remaining)
              </span>
            </div>
            <div className="quota-bar-bg">
              <div
                className={`quota-bar-fill ${quotaInfo.percentUsed > 85 ? "bg-crimson" : "bg-cyan"}`}
                style={{ width: `${quotaInfo.percentUsed}%` }}
              />
            </div>
            {quotaInfo.lastError && (
              <div className="quota-warning-text">{quotaInfo.lastError}</div>
            )}
          </div>

          <div className="form-group mb-3">
            <label className="field-label">API Key</label>
            <input
              type="text"
              placeholder="e.g. 7a8b9c0d1e2f3g4h5i6j7k8l9m0n1o2p"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              className="ticket-input"
            />
          </div>

          <div className="d-flex justify-content-between align-items-center mb-3 p-2 rounded bg-slate-900 border border-slate-800">
            <div>
              <div className="text-white small fw-semibold">Mock / Simulation Mode</div>
              <div className="text-muted extra-small">Simulate realistic price ticks without API usage</div>
            </div>
            <button
              type="button"
              className={`toggle-switch-btn ${isMockMode ? "active" : ""}`}
              onClick={toggleMockMode}
            >
              {isMockMode ? "ON" : "OFF"}
            </button>
          </div>

          {savedSuccess && (
            <div className="ticket-alert alert-success">API Key saved successfully!</div>
          )}

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Save Configuration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
