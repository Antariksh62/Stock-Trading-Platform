const mongoose = require("mongoose");

/**
 * Execute work within a MongoDB transaction if replica set transactions are supported.
 * Handles TransientTransactionError, catalog changes during index builds, and falls back to
 * direct execution if running on a standalone instance or encountering transaction conflicts.
 */
async function withTransaction(workFn) {
  let session = null;
  try {
    session = await mongoose.startSession();
  } catch (err) {
    // Session / transaction not supported on this MongoDB configuration
    return await workFn(null);
  }

  if (!session || typeof session.withTransaction !== "function") {
    if (session) session.endSession();
    return await workFn(null);
  }

  try {
    let result;
    await session.withTransaction(async () => {
      result = await workFn(session);
    });
    return result;
  } catch (error) {
    const msg = error.message || "";
    // If replica set does not support transactions, or catalog changes / transient error occurs, execute directly
    if (
      msg.includes("Transaction numbers are only allowed on a replica set member") ||
      msg.includes("catalog changes") ||
      (error.hasErrorLabel && error.hasErrorLabel("TransientTransactionError")) ||
      (error.errorLabels && error.errorLabels.includes("TransientTransactionError")) ||
      msg.includes("TransientTransactionError")
    ) {
      return await workFn(null);
    }
    throw error;
  } finally {
    try {
      session.endSession();
    } catch (e) {}
  }
}

module.exports = { withTransaction };
