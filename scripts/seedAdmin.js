// Creates (or resets) the admin account with a bcrypt-hashed password from .env.
require("dotenv").config();
const bcrypt = require("bcrypt");
const { db, pool } = require("../config/db");

(async () => {
  if (!process.env.ADMIN_PASSWORD) {
    console.error("Set ADMIN_PASSWORD in your environment first.");
    process.exit(1);
  }
  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
  await db.query(
    `INSERT INTO users (username, password, role) VALUES ('admin', ?, 'admin')
     ON DUPLICATE KEY UPDATE password = VALUES(password), role = 'admin'`,
    [hash]
  );
  console.log("Admin account ready (username: admin).");
  pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
