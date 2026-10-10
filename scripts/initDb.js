// Runs database_cloud.sql against the database configured in .env (useful for cloud deploys).
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    multipleStatements: true
  });
  const [exists] = await conn.query("SHOW TABLES LIKE 'users'");
  if (exists.length && process.argv[2] !== "--force") {
    console.log("Tables already exist. Re-run with --force to recreate them (DROPS DATA).");
    return conn.end();
  }
  if (process.argv[2] === "--force") {
    await conn.query("SET FOREIGN_KEY_CHECKS=0; DROP TABLE IF EXISTS reviews, order_items, orders, products, users; SET FOREIGN_KEY_CHECKS=1;");
  }
  await conn.query(fs.readFileSync(path.join(__dirname, "..", "database_cloud.sql"), "utf8"));
  console.log("Schema created.");
  await conn.end();
})().catch(e => { console.error(e.message); process.exit(1); });
