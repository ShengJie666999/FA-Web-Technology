// API gateway endpoints: combine local DB data with normalized external API data.
const router = require("express").Router();
const { param } = require("express-validator");
const validate = require("../middleware/validate");
const { db } = require("../config/db");
const ext = require("../services/external");

// Product + converted prices (Frankfurter) + estimated delivery (Nager.Date)
router.get("/products/:id/overview", param("id").isInt({ min: 1 }), validate, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, name, category, price, stock FROM products WHERE id = ?",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Product not found." });
    const p = rows[0];

    // Run both upstream calls in parallel; one failing must not break the response.
    const [fx, delivery] = await Promise.allSettled([ext.getRates(), ext.estimateDelivery(3)]);

    const prices = { MYR: Number(p.price) };
    if (fx.status === "fulfilled") {
      for (const [cur, rate] of Object.entries(fx.value.rates)) prices[cur] = +(p.price * rate).toFixed(2);
      prices.ratesDate = fx.value.date;
    } else {
      prices.note = "Exchange rates currently unavailable";
    }

    res.json({
      product: p,
      prices,
      estimatedDelivery: delivery.status === "fulfilled" ? delivery.value : null
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Could not build product overview." });
  }
});

router.get("/holidays/:year", param("year").isInt({ min: 2020, max: 2100 }), validate, async (req, res) => {
  try {
    res.json(await ext.getHolidays(req.params.year));
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Holiday service unavailable." });
  }
});

router.get("/rates", async (req, res) => {
  try {
    res.json(await ext.getRates());
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Exchange rate service unavailable." });
  }
});

module.exports = router;
