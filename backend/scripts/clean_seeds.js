const mongoose = require("mongoose");
require("dotenv").config();
const { HoldingsModel } = require("../model/HoldingsModel");
const { PositionsModel } = require("../model/PositionsModel");

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log("Connected to MongoDB Atlas");

    const delH = await HoldingsModel.deleteMany({
      $or: [
        { userId: "demo_user" },
        { userId: { $exists: false } },
        { userId: null },
      ],
    });
    console.log("Deleted fake/seeded holdings:", delH.deletedCount);

    const delP = await PositionsModel.deleteMany({
      $or: [
        { userId: "demo_user" },
        { userId: { $exists: false } },
        { userId: null },
      ],
    });
    console.log("Deleted fake/seeded positions:", delP.deletedCount);

    const remH = await HoldingsModel.countDocuments();
    const remP = await PositionsModel.countDocuments();
    console.log("Remaining valid user holdings:", remH);
    console.log("Remaining valid user positions:", remP);

    process.exit(0);
  } catch (err) {
    console.error("Cleanup error:", err);
    process.exit(1);
  }
}

run();
