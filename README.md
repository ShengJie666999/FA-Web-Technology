# ShopFlow E-Commerce

Express.js API gateway + MySQL, JWT authentication, bcrypt password hashing, and three external APIs
(Frankfurter exchange rates, Nager.Date holidays, Resend email).

## Project structure
```
server.js                 app entry, products + orders routes
config/db.js              MySQL pool (reads .env)
middleware/               auth (JWT, roles), validate (express-validator)
routes/                   auth, reviews (new feature), gateway (external APIs)
services/external.js      Frankfurter, Nager.Date, Resend wrappers
scripts/                  seedAdmin.js, initDb.js
database.sql              local schema      database_cloud.sql  cloud schema
public/                   frontend (HTML/CSS/JS)
```

## Run locally
1. Install Node.js 18+ and MySQL 8 (XAMPP/MySQL Server).
2. `git clone <your-repo-url>` then `cd shopflow` and `npm install`
3. `cp .env.example .env` and fill in DB_PASSWORD, JWT_SECRET (long random string), ADMIN_PASSWORD, and optionally RESEND_API_KEY.
   Generate a secret with: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
4. Create the schema: `mysql -u root -p < database.sql`
5. Create the admin account: `npm run seed:admin`
6. `npm start` then open http://localhost:3000

## How .env is used
`require("dotenv").config()` loads `.env` into `process.env`. Code only reads values such as
`process.env.DB_PASSWORD` and `process.env.JWT_SECRET`; nothing sensitive is hardcoded.
`.env` is listed in `.gitignore`; `.env.example` documents the required variables.

## Git
```
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<you>/shopflow.git
git push -u origin main
```

## Deploy (Railway example)
1. Push the repo to GitHub.
2. Railway: New Project > Deploy from GitHub repo > select the repo (build: `npm install`, start: `npm start`).
3. In the same project: New > Database > MySQL.
4. Web service > Variables: set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME from the MySQL service
   (Railway reference variables such as `${{MySQL.MYSQLHOST}}` work), plus JWT_SECRET, ADMIN_PASSWORD,
   RESEND_API_KEY, EMAIL_FROM. If you get an SSL error set DB_SSL=true.
5. Create the schema in the cloud DB: run `npm run db:init` (uses database_cloud.sql) with the cloud
   variables, e.g. via `railway run npm run db:init`, then `railway run npm run seed:admin`.
6. Settings > Networking > Generate Domain, then open the URL.
7. Every `git push` to `main` now redeploys automatically.

## API summary
| Method | Path | Access |
|---|---|---|
| POST | /api/register, /api/login | public |
| GET | /api/products, /api/products/:id | public |
| POST/PUT/DELETE | /api/products[/:id] | admin |
| POST | /api/orders | public (validated, transactional) |
| GET/DELETE | /api/orders[/:id] | admin |
| PUT | /api/orders/:id/status | admin (cancel restores stock) |
| GET | /api/products/:id/reviews | public |
| POST | /api/products/:id/reviews | logged in |
| PUT/DELETE | /api/reviews/:id | owner (delete: owner or admin) |
| GET | /api/gateway/products/:id/overview, /holidays/:year, /rates | public |
