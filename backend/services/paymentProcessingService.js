const mongoose = require("mongoose");
const { PaymentModel } = require("../model/PaymentModel");
const { FundsModel } = require("../model/FundsModel");
const { WalletTransactionModel } = require("../model/WalletTransactionModel");
const { notifyUserFundsUpdated } = require("./socketService");
const { acquireUserLock, releaseUserLock } = require("./orderExecutionService");

/**
 * Authoritative central payment processing and wallet crediting service.
 *
 * Implements strict ACID transaction semantics:
 * 1. Validates internal payment record (ownership, currency, positive amount, status CAPTURED).
 * 2. Serializes execution per user via acquireUserLock to prevent write conflicts.
 * 3. Starts Mongoose session & MongoDB transaction with automatic write conflict retry loop.
 * 4. Atomic $inc on FundsModel (availableCash, availableMargin, payin).
 * 5. Immutable ledger entry in WalletTransactionModel.
 * 6. Conditional transition of PaymentModel status from CAPTURED to CREDITED.
 * 7. Commits transaction and broadcasts real-time funds update via Socket.IO.
 *
 * Safe and idempotent:
 * - If already CREDITED: returns success without creating a second ledger transaction.
 * - Handles concurrent calls safely via MongoDB unique constraints and transactions.
 *
 * @param {Object} params
 * @param {string} [params.internalPaymentId] - Platform internal payment ID (PAY_...)
 * @param {string} [params.razorpayPaymentId] - Razorpay payment ID (pay_...)
 * @returns {Promise<Object>} Crediting outcome
 */
const processCapturedPayment = async ({
  internalPaymentId = null,
  razorpayPaymentId = null,
}) => {
  if (!internalPaymentId && !razorpayPaymentId) {
    const error = new Error(
      "Either internalPaymentId or razorpayPaymentId must be provided for wallet crediting."
    );
    error.statusCode = 400;
    throw error;
  }

  // 1. Locate internal payment record
  let payment = null;
  if (internalPaymentId) {
    payment = await PaymentModel.findOne({ internalPaymentId });
  } else if (razorpayPaymentId) {
    payment = await PaymentModel.findOne({ razorpayPaymentId });
  }

  if (!payment) {
    const identifier = internalPaymentId || razorpayPaymentId;
    const error = new Error(`Payment record not found for '${identifier}'.`);
    error.statusCode = 404;
    throw error;
  }

  // 2. Validate payment consistency
  if (
    razorpayPaymentId &&
    payment.razorpayPaymentId &&
    payment.razorpayPaymentId !== razorpayPaymentId
  ) {
    const error = new Error("Razorpay payment ID does not match internal record.");
    error.statusCode = 400;
    throw error;
  }

  if (payment.currency && payment.currency.toUpperCase() !== "INR") {
    const error = new Error("Currency mismatch. Only INR transactions can be credited.");
    error.statusCode = 400;
    throw error;
  }

  if (!payment.amount || !Number.isInteger(payment.amount) || payment.amount <= 0) {
    const error = new Error("Invalid payment amount: must be a positive integer in paise.");
    error.statusCode = 400;
    throw error;
  }

  const amountRupees = Number((payment.amount / 100).toFixed(2));

  // 3. Idempotency Check: Already Credited
  if (payment.status === "CREDITED") {
    return {
      success: true,
      isAlreadyCredited: true,
      message: "Payment has already been processed and credited to wallet.",
      paymentId: payment.internalPaymentId,
      razorpayPaymentId: payment.razorpayPaymentId,
      razorpayOrderId: payment.razorpayOrderId,
      amountRupees,
      status: "CREDITED",
    };
  }

  if (payment.status === "FAILED") {
    const error = new Error("Cannot credit wallet for a failed payment.");
    error.statusCode = 400;
    throw error;
  }

  if (payment.status !== "CAPTURED") {
    const error = new Error(
      `Payment must be confirmed as CAPTURED before crediting wallet (current status: '${payment.status}').`
    );
    error.statusCode = 400;
    throw error;
  }

  // 4. Ledger Check: ensure no duplicate transaction exists in WalletTransactionModel
  const existingLedger = await WalletTransactionModel.findOne({
    $or: [
      { paymentId: payment.internalPaymentId },
      ...(payment.razorpayPaymentId ? [{ razorpayPaymentId: payment.razorpayPaymentId }] : []),
    ],
  });

  if (existingLedger) {
    if (existingLedger.paymentId !== payment.internalPaymentId) {
      const error = new Error(
        `Razorpay payment ID '${payment.razorpayPaymentId}' has already been credited for another transaction ('${existingLedger.paymentId}').`
      );
      error.statusCode = 400;
      throw error;
    }

    // Payment was already credited in ledger; ensure payment status is marked CREDITED
    await PaymentModel.updateOne(
      { _id: payment._id },
      {
        $set: {
          status: "CREDITED",
          walletTransactionId: existingLedger._id,
          creditedAt: new Date(),
          reconciliationStatus: "RECONCILED",
          reconciledAt: new Date(),
        },
      }
    );

    return {
      success: true,
      isAlreadyCredited: true,
      message: "Payment already recorded in ledger.",
      paymentId: payment.internalPaymentId,
      razorpayPaymentId: payment.razorpayPaymentId,
      amountRupees,
      status: "CREDITED",
      balanceAfter: existingLedger.balanceAfter,
    };
  }

  // 5. Serialize user execution to prevent concurrent write conflicts on Funds document
  await acquireUserLock(payment.userId);

  try {
    let attempts = 0;
    const MAX_TX_ATTEMPTS = 5;

    while (attempts < MAX_TX_ATTEMPTS) {
      attempts++;
      const session = await mongoose.startSession();

      try {
        session.startTransaction();

        // Check if already credited under transaction
        const freshPayment = await PaymentModel.findOne({ _id: payment._id }).session(session);
        if (freshPayment && freshPayment.status === "CREDITED") {
          await session.abortTransaction();
          return {
            success: true,
            isAlreadyCredited: true,
            message: "Payment has already been processed and credited to wallet.",
            paymentId: freshPayment.internalPaymentId,
            razorpayPaymentId: freshPayment.razorpayPaymentId,
            status: "CREDITED",
            amountRupees,
          };
        }

        // Step A: Atomic $inc on FundsModel (upsert guarantees initialization if account is new)
        const updatedFunds = await FundsModel.findOneAndUpdate(
          { userId: payment.userId },
          {
            $inc: {
              availableCash: amountRupees,
              availableMargin: amountRupees,
              payin: amountRupees,
            },
            $setOnInsert: {
              usedMargin: 0.0,
              openingBalance: 0.0,
              span: 0.0,
              deliveryMargin: 0.0,
              exposure: 0.0,
              optionsPremium: 0.0,
            },
            $set: { updatedAt: new Date() },
          },
          { returnDocument: "after", upsert: true, session }
        );

        const balanceAfter = updatedFunds.availableMargin;
        const balanceBefore = Number((balanceAfter - amountRupees).toFixed(2));

        // Step B: Immutable Ledger Entry in WalletTransactionModel
        const txDocs = await WalletTransactionModel.create(
          [
            {
              userId: payment.userId,
              paymentId: payment.internalPaymentId,
              razorpayPaymentId: payment.razorpayPaymentId,
              razorpayOrderId: payment.razorpayOrderId,
              type: "DEPOSIT",
              transactionType: "DEPOSIT",
              amount: payment.amount,
              amountPaise: payment.amount,
              amountRupees,
              currency: "INR",
              balanceBefore,
              balanceBeforeRupees: balanceBefore,
              balanceAfter,
              balanceAfterRupees: balanceAfter,
              status: "COMPLETED",
              description: `Deposit via Razorpay (${payment.razorpayPaymentId || payment.internalPaymentId})`,
              timestamp: new Date(),
            },
          ],
          { session }
        );

        const walletTx = txDocs[0];

        // Step C: Conditional state transition: CAPTURED -> CREDITED
        const updatedPayment = await PaymentModel.findOneAndUpdate(
          {
            _id: payment._id,
            status: "CAPTURED", // Conditional check prevents lost updates / double transitions
          },
          {
            $set: {
              status: "CREDITED",
              walletTransactionId: walletTx._id,
              creditedAt: new Date(),
              reconciliationStatus: "RECONCILED",
              reconciledAt: new Date(),
              updatedAt: new Date(),
            },
          },
          { returnDocument: "after", session }
        );

        if (!updatedPayment) {
          throw new Error("Concurrent payment transition detected.");
        }

        // Step D: Commit transaction
        await session.commitTransaction();

        // Step E: Emit real-time Socket.IO funds update (strictly post-commit)
        await notifyUserFundsUpdated(payment.userId);

        return {
          success: true,
          isAlreadyCredited: false,
          message: "Payment successfully verified and credited to wallet.",
          paymentId: payment.internalPaymentId,
          razorpayPaymentId: payment.razorpayPaymentId,
          razorpayOrderId: payment.razorpayOrderId,
          amountRupees,
          status: "CREDITED",
          walletTransactionId: walletTx._id,
          balanceBefore,
          balanceAfter,
        };
      } catch (txErr) {
        await session.abortTransaction();

        const isWriteConflict =
          txErr.message.includes("Write conflict") ||
          (typeof txErr.hasErrorLabel === "function" && txErr.hasErrorLabel("TransientTransactionError"));

        if (isWriteConflict && attempts < MAX_TX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 50 * attempts));
          continue;
        }

        // Handle race conditions caught by unique index or conditional update
        if (
          txErr.code === 11000 ||
          txErr.message.includes("Concurrent payment transition")
        ) {
          const finalPayment = await PaymentModel.findOne({
            internalPaymentId: payment.internalPaymentId,
          });

          return {
            success: true,
            isAlreadyCredited: true,
            message: "Payment already processed by concurrent request.",
            paymentId: payment.internalPaymentId,
            razorpayPaymentId: payment.razorpayPaymentId,
            status: finalPayment?.status || "CREDITED",
          };
        }

        console.error("[processCapturedPayment Transaction Error]:", txErr.message);
        const error = new Error(txErr.message || "Failed to complete wallet credit transaction.");
        error.statusCode = txErr.statusCode || 500;
        throw error;
      } finally {
        session.endSession();
      }
    }
  } finally {
    releaseUserLock(payment.userId);
  }
};

module.exports = {
  processCapturedPayment,
};
