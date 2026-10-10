// New feature: product reviews (full CRUD, 1 review per user per product).
const router = require("express").Router();
const { body, param } = require("express-validator");
const validate = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");
const { db } = require("../config/db");

const idRule = param("id").isInt({ min: 1 }).withMessage("Invalid id");
const reviewRules = [
  body("rating").isInt({ min: 1, max: 5 }).withMessage("Rating must be between 1 and 5"),
  body("comment").optional({ values: "falsy" }).isString().trim().isLength({ max: 500 })
    .withMessage("Comment must be at most 500 characters")
];
const serverError = (res, err) => { console.error(err); res.status(500).json({ error: "Server error" }); };

// READ: all reviews and the average rating for a product (public)
router.get("/products/:id/reviews", idRule, validate, async (req, res) => {
  try {
    const [reviews] = await db.query(
      `SELECT r.id, r.user_id, r.rating, r.comment, r.created_at, u.username
       FROM reviews r JOIN users u ON u.id = r.user_id
       WHERE r.product_id = ? ORDER BY r.id DESC`,
      [req.params.id]
    );
    const average = reviews.length
      ? +(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(2)
      : null;
    res.json({ average, count: reviews.length, reviews });
  } catch (err) { serverError(res, err); }
});

// CREATE: logged-in users only
router.post("/products/:id/reviews", requireAuth, idRule, reviewRules, validate, async (req, res) => {
  try {
    const [r] = await db.query(
      "INSERT INTO reviews (product_id, user_id, rating, comment) VALUES (?, ?, ?, ?)",
      [req.params.id, req.user.id, req.body.rating, req.body.comment || null]
    );
    res.status(201).json({ message: "Review created", id: r.insertId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "You already reviewed this product." });
    if (err.code === "ER_NO_REFERENCED_ROW_2") return res.status(404).json({ error: "Product not found." });
    serverError(res, err);
  }
});

// UPDATE: owner only
router.put("/reviews/:id", requireAuth, idRule, reviewRules, validate, async (req, res) => {
  try {
    const [r] = await db.query(
      "UPDATE reviews SET rating = ?, comment = ? WHERE id = ? AND user_id = ?",
      [req.body.rating, req.body.comment || null, req.params.id, req.user.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: "Review not found." });
    res.json({ message: "Review updated" });
  } catch (err) { serverError(res, err); }
});

// DELETE: owner, or any review if admin
router.delete("/reviews/:id", requireAuth, idRule, validate, async (req, res) => {
  try {
    const [r] = req.user.role === "admin"
      ? await db.query("DELETE FROM reviews WHERE id = ?", [req.params.id])
      : await db.query("DELETE FROM reviews WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
    if (!r.affectedRows) return res.status(404).json({ error: "Review not found." });
    res.json({ message: "Review deleted" });
  } catch (err) { serverError(res, err); }
});

module.exports = router;
