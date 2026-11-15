let broadcastHandler = null;

/**
 * Registers the global Socket.IO balance/portfolio broadcast handler.
 * Called during application initialization in index.js.
 */
const setBroadcastHandler = (handler) => {
  broadcastHandler = handler;
};

/**
 * Notifies the connected client session that funds were updated.
 * Guaranteed to be called only AFTER database transactions have committed.
 */
const notifyUserFundsUpdated = async (userId) => {
  if (typeof broadcastHandler === "function" && userId) {
    try {
      await broadcastHandler(userId);
    } catch (e) {
      console.error("[SocketService] Failed to broadcast user updates:", e);
    }
  }
};

module.exports = {
  setBroadcastHandler,
  notifyUserFundsUpdated,
};

