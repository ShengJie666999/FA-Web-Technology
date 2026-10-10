// JWT authentication and role-based authorization.
const jwt = require("jsonwebtoken");

exports.requireAuth = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Authentication required." });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token." });
  }
};

exports.requireAdmin = (req, res, next) =>
  req.user?.role === "admin"
    ? next()
    : res.status(403).json({ error: "Admin access required." });
