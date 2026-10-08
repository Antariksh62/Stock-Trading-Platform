const { Schema } = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new Schema({
  email: {
    type: String,
    required: [true, "Email address is required"],
    unique: true,
  },
  username: {
    type: String,
    required: [true, "Username is required"],
  },
  password: {
    type: String,
    required: [true, "Password is required"],
  },
  createdAt: {
    type: Date,
    default: new Date(),
  },
});

UserSchema.pre("save", async function () {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 12);
  }
});

module.exports = { UserSchema };
