const jwt = require("jsonwebtoken");

/**
 * Strict authentication middleware for financial operations.
 * Requires a verified JWT from cookie or Authorization header.
 * Rejects unauthenticated requests with HTTP 401.
 * Never falls back to client-supplied user IDs or demo identities.
 */
const requireAuth = (req, res, next) => {
  const token = req.cookies?.token || req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication required. Please log in to perform this operation.",
    });
  }

  const tokenSecret = process.env.TOKEN_KEY;
  if (!tokenSecret) {
    return res.status(500).json({
      success: false,
      message: "Server authentication configuration error.",
    });
  }

  try {
    const decoded = jwt.verify(token, tokenSecret);
    if (!decoded || !decoded.id) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication credentials.",
      });
    }

    // Set authenticated user ID strictly from the verified token payload
    req.userId = String(decoded.id);
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired session. Please log in again.",
    });
  }
};

module.exports = { requireAuth };

