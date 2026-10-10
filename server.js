// ShopFlow E-Commerce: Express.js API gateway + MySQL
require("dotenv").config();
const express = require("express");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { body, param } = require("express-validator");

const { pool, db } = require("./config/db");
const validate = require("./middleware/validate");
const { requireAuth, requireAdmin } = require("./middleware/auth");
const ext = require("./services/external");

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is not set. Add it to your .env file.");
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Security & middleware ----------
app.set("trust proxy", 1); // required behind a cloud proxy so rate limiting sees real IPs
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src-attr": ["'unsafe-inline'"], // frontend uses onclick="" attributes
        "upgrade-insecure-requests": null       // allow plain http://localhost
      }
    }
  })
);
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
app.use(["/api/login", "/api/register"], authLimiter);

// Verify DB connection on start-up
pool.getConnection((err, conn) => {
  if (err) return console.error("Database connection failed:", err.message);
  console.log("Connected to MySQL database.");
  conn.release();
});

// Centralized error helper: logs details server-side, never leaks SQL errors to clients
const handleError = (res, err, msg = "Server error", status = 500) => {
  if (err) console.error(err);
  res.status(status).json({ error: msg });
};

// ---------- Routes: auth, reviews, gateway ----------
app.use("/api", require("./routes/auth"));      // POST /api/register, /api/login
app.use("/api", require("./routes/reviews"));   // reviews CRUD (new feature)
app.use("/api/gateway", require("./routes/gateway")); // external API gateway

// ---------- Products ----------
const idRule = param("id").isInt({ min: 1 }).withMessage("Invalid id");
const productRules = [
  body("name").trim().isLength({ min: 1, max: 100 }).withMessage("Name is required (max 100 chars)"),
  body("category").isIn(["Electronics", "Fashion", "Accessories", "Sports"]).withMessage("Invalid category"),
  body("price").isFloat({ gt: 0, max: 99999999 }).withMessage("Price must be greater than 0"),
  body("stock").isInt({ min: 0, max: 1000000 }).withMessage("Stock must be a whole number >= 0"),
  body("image_url").optional({ values: "falsy" }).trim().isLength({ max: 255 }).withMessage("Image name too long")
];

app.get("/api/products", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM products ORDER BY id DESC");
    res.json(rows);
  } catch (err) { handleError(res, err); }
});

app.get("/api/products/:id", idRule, validate, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM products WHERE id = ?", [req.params.id]);
    if (!rows.length) return handleError(res, null, "Product not found.", 404);
    res.json(rows[0]);
  } catch (err) { handleError(res, err); }
});

app.post("/api/products", requireAuth, requireAdmin, productRules, validate, async (req, res) => {
  const { name, category, price, stock, image_url } = req.body;
  try {
    const [r] = await db.query(
      "INSERT INTO products (name, category, price, stock, image_url) VALUES (?, ?, ?, ?, ?)",
      [name, category, price, stock, image_url?.trim() || "default.jpg"]
    );
    res.status(201).json({ message: "Product created", id: r.insertId });
  } catch (err) { handleError(res, err); }
});

app.put("/api/products/:id", requireAuth, requireAdmin, idRule, productRules, validate, async (req, res) => {
  const { name, category, price, stock, image_url } = req.body;
  try {
    const [r] = await db.query(
      "UPDATE products SET name=?, category=?, price=?, stock=?, image_url=? WHERE id=?",
      [name, category, price, stock, image_url?.trim() || "default.jpg", req.params.id]
    );
    if (!r.affectedRows) return handleError(res, null, "Product not found.", 404);
    res.json({ message: "Product updated" });
  } catch (err) { handleError(res, err); }
});

app.delete("/api/products/:id", requireAuth, requireAdmin, idRule, validate, async (req, res) => {
  try {
    const [r] = await db.query("DELETE FROM products WHERE id=?", [req.params.id]);
    if (!r.affectedRows) return handleError(res, null, "Product not found.", 404);
    res.json({ message: "Product deleted" });
  } catch (err) { handleError(res, err); }
});

// ---------- Orders ----------
const ORDER_STATUSES = ["Pending", "Paid", "Shipped", "Completed", "Cancelled"];

// Place order: stock rows are locked (FOR UPDATE) inside the transaction so concurrent
// buyers can never oversell. Everything commits together or rolls back together.
app.post(
  "/api/orders",
  body("customerName").trim().isLength({ min: 1, max: 100 }).withMessage("Name is required"),
  body("customerEmail").trim().isEmail().isLength({ max: 120 }).withMessage("Valid email is required"),
  body("items").isArray({ min: 1, max: 50 }).withMessage("Cart items required"),
  body("items.*.id").isInt({ min: 1 }).withMessage("Invalid product id"),
  body("items.*.quantity").isInt({ min: 1, max: 99 }).withMessage("Quantity must be 1-99"),
  validate,
  async (req, res) => {
    const { customerName, customerEmail, items } = req.body;
    const conn = await pool.promise().getConnection();
    try {
      await conn.beginTransaction();

      const ids = [...new Set(items.map(i => Number(i.id)))];
      const [products] = await conn.query(
        "SELECT id, price, stock FROM products WHERE id IN (?) FOR UPDATE", [ids]
      );

      // Combine duplicate cart lines so stock is checked against the full quantity
      const wanted = new Map();
      for (const i of items) wanted.set(Number(i.id), (wanted.get(Number(i.id)) || 0) + Number(i.quantity));

      let total = 0;
      for (const [id, qty] of wanted) {
        const p = products.find(x => x.id === id);
        if (!p || p.stock < qty) {
          await conn.rollback();
          return handleError(res, null, "Invalid product or stock limit reached.", 400);
        }
        total += Number(p.price) * qty;
      }

      const [ord] = await conn.query(
        "INSERT INTO orders (customer_name, customer_email, total, status) VALUES (?, ?, ?, 'Pending')",
        [customerName, customerEmail, total]
      );
      for (const [id, qty] of wanted) {
        const p = products.find(x => x.id === id);
        await conn.query(
          "INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)",
          [ord.insertId, id, qty, p.price]
        );
        await conn.query("UPDATE products SET stock = stock - ? WHERE id = ?", [qty, id]);
      }

      await conn.commit();
      res.status(201).json({ message: "Order placed successfully", orderId: ord.insertId, total });

      // External API 3: confirmation email. Fire-and-forget so failures never affect the order.
      ext.sendOrderEmail({ to: customerEmail, name: customerName, orderId: ord.insertId, total })
        .catch(e => console.error("Order email failed:", e.message));
    } catch (err) {
      await conn.rollback();
      handleError(res, err);
    } finally {
      conn.release();
    }
  }
);

app.get("/api/orders", requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM orders ORDER BY id DESC");
    res.json(rows);
  } catch (err) { handleError(res, err); }
});

app.get("/api/orders/:id", requireAuth, requireAdmin, idRule, validate, async (req, res) => {
  try {
    const [[order]] = await db.query("SELECT * FROM orders WHERE id = ?", [req.params.id]);
    if (!order) return handleError(res, null, "Order not found.", 404);
    const [items] = await db.query(
      `SELECT oi.product_id, p.name, oi.quantity, oi.unit_price
       FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?`,
      [order.id]
    );
    res.json({ ...order, items });
  } catch (err) { handleError(res, err); }
});

// Update status. Cancelling restores stock; both changes are one atomic transaction.
app.put(
  "/api/orders/:id/status",
  requireAuth, requireAdmin, idRule,
  body("status").isIn(ORDER_STATUSES).withMessage("Invalid status"),
  validate,
  async (req, res) => {
    const conn = await pool.promise().getConnection();
    try {
      await conn.beginTransaction();
      const [[order]] = await conn.query("SELECT status FROM orders WHERE id = ? FOR UPDATE", [req.params.id]);
      if (!order) {
        await conn.rollback();
        return handleError(res, null, "Order not found.", 404);
      }
      if (req.body.status === "Cancelled" && order.status !== "Cancelled") {
        await conn.query(
          `UPDATE products p JOIN order_items oi ON oi.product_id = p.id
           SET p.stock = p.stock + oi.quantity WHERE oi.order_id = ?`,
          [req.params.id]
        );
      }
      await conn.query("UPDATE orders SET status = ? WHERE id = ?", [req.body.status, req.params.id]);
      await conn.commit();
      res.json({ message: "Order status updated" });
    } catch (err) {
      await conn.rollback();
      handleError(res, err);
    } finally {
      conn.release();
    }
  }
);

app.delete("/api/orders/:id", requireAuth, requireAdmin, idRule, validate, async (req, res) => {
  try {
    const [r] = await db.query("DELETE FROM orders WHERE id = ?", [req.params.id]);
    if (!r.affectedRows) return handleError(res, null, "Order not found.", 404);
    res.json({ message: "Order deleted successfully." });
  } catch (err) { handleError(res, err); }
});

// ---------- Start ----------
app.listen(PORT, () => console.log(`ShopFlow running at http://localhost:${PORT}`));
