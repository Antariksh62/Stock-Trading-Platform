const { UserModel } = require("../model/UserModel");
require("dotenv").config();
const jwt = require("jsonwebtoken");

module.exports.userVerification = (req, res) => {
  const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.json({ status: false, message: "No token provided" });
  }

  jwt.verify(token, process.env.TOKEN_KEY, async (err, data) => {
    if (err) {
      return res.json({ status: false, message: "Invalid or expired token" });
    } else {
      try {
        const user = await UserModel.findById(data.id);
        if (user) {
          return res.json({
            status: true,
            user: user.username,
            email: user.email,
          });
        } else {
          return res.json({ status: false, message: "User not found" });
        }
      } catch (error) {
        return res.json({ status: false, message: "Server error" });
      }
    }
  });
};
