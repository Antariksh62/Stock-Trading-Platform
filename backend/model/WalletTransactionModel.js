const { model } = require("mongoose");
const { WalletTransactionSchema } = require("../schemas/WalletTransactionSchema");

const WalletTransactionModel = model("wallet_transaction", WalletTransactionSchema);

module.exports = { WalletTransactionModel };

