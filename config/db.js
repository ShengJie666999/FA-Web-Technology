// Database connection pool. All credentials come from environment variables (.env).
require("dotenv").config();
const mysql = require("mysql2");

const required = ["DB_HOST", "DB_USER", "DB_NAME"];
const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  multipleStatements: false,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined
});

module.exports = { pool, db: pool.promise() };
