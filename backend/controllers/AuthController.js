const { UserModel } = require("../model/UserModel");
const { createSecretToken } = require("../util/SecretToken");
const bcrypt = require("bcryptjs");

const isProduction = process.env.NODE_ENV === "production";

const getCookieOptions = () => ({
  path: "/",
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  maxAge: 3 * 24 * 60 * 60 * 1000, // 3 days
});

module.exports.Signup = async (req, res) => {
  try {
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await UserModel.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "User already exists with this email" });
    }

    const user = await UserModel.create({
      email: normalizedEmail,
      password,
      username: String(username).trim(),
    });
    const token = createSecretToken(user._id);

    res.cookie("token", token, getCookieOptions());

    res.status(201).json({
      message: "User signed up successfully",
      success: true,
      user: { id: user._id.toString(), username: user.username, email: user.email },
      token,
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

module.exports.Login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await UserModel.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ success: false, message: "Incorrect email or password" });
    }

    const auth = await bcrypt.compare(password, user.password);
    if (!auth) {
      return res.status(401).json({ success: false, message: "Incorrect email or password" });
    }

    const token = createSecretToken(user._id);

    res.cookie("token", token, getCookieOptions());

    res.status(200).json({
      message: "User logged in successfully",
      success: true,
      user: { id: user._id.toString(), username: user.username, email: user.email },
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

module.exports.Logout = async (req, res) => {
  try {
    res.clearCookie("token", {
      path: "/",
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
    });
    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
