// Registration and login. Passwords are hashed with bcrypt; sessions use signed JWTs.
const router = require("express").Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { body } = require("express-validator");
const validate = require("../middleware/validate");
const { db } = require("../config/db");

const BCRYPT_ROUNDS = 12;
const signToken = user =>
  jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "2h" }
  );

router.post(
  "/register",
  body("username").trim().matches(/^[A-Za-z0-9_]{3,30}$/)
    .withMessage("Username must be 3-30 letters, numbers or underscores"),
  body("password").isLength({ min: 8, max: 72 }).withMessage("Password must be 8-72 characters")
    .matches(/[A-Za-z]/).withMessage("Password needs at least one letter")
    .matches(/\d/).withMessage("Password needs at least one number"),
  validate,
  async (req, res) => {
    try {
      const hash = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS);
      // Role is always 'customer'; it is never taken from the request body.
      const [r] = await db.query(
        "INSERT INTO users (username, password, role) VALUES (?, ?, 'customer')",
        [req.body.username, hash]
      );
      res.status(201).json({ message: "Registration successful", id: r.insertId });
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Username already taken." });
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

router.post(
  "/login",
  body("username").trim().notEmpty().withMessage("Username required").isLength({ max: 50 }),
  body("password").notEmpty().withMessage("Password required").isLength({ max: 72 }),
  validate,
  async (req, res) => {
    try {
      const [rows] = await db.query(
        "SELECT id, username, password, role FROM users WHERE username = ?",
        [req.body.username]
      );
      const ok = rows.length > 0 && (await bcrypt.compare(req.body.password, rows[0].password));
      if (!ok) return res.status(401).json({ error: "Invalid login credentials." });

      const user = { id: rows[0].id, username: rows[0].username, role: rows[0].role };
      res.json({ message: "Login successful", token: signToken(user), user });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

module.exports = router;
