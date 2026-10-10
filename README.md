# ShopFlow E-Commerce

ShopFlow is an e-commerce web application built with Express.js and MySQL. The backend works as an API gateway: it serves the shop, protects admin features with JWT authentication, and combines data from three external Web APIs.

## Features

- **Product catalog** with search, category filter and low-stock badges
- **Shopping cart and checkout** with transactional order processing (no overselling)
- **Stock management** (admin): create, read, update and delete products
- **Order management** (admin): view orders, change status, delete orders; cancelling an order restores stock
- **Product reviews** (new feature): customers rate and comment on products
- **Authentication**: registration and login with bcrypt-hashed passwords and JWT sessions
- **External APIs** (see below): exchange rates, public holidays and email

## Tech stack

Node.js 18+, Express.js, MySQL 8 (mysql2), bcrypt, jsonwebtoken, express-validator, helmet, express-rate-limit, dotenv, and plain HTML/CSS/JavaScript for the frontend.

## External APIs

| API | Purpose | Where it is used |
|---|---|---|
| Frankfurter | Converts product prices from MYR to USD, SGD and EUR | "Details & Reviews" panel on the Products page |
| Nager.Date | Malaysian public holidays, used to estimate delivery dates | Same panel (estimated delivery) |
| Resend | Sends an order confirmation email | After a successful checkout (optional) |

Frankfurter and Nager.Date need no API key. Resend needs `RESEND_API_KEY`; without it the email step is skipped and orders still work.

## Project structure

```
server.js                 app entry point, product and order routes
config/db.js              MySQL connection pool (reads .env)
middleware/auth.js        JWT verification and admin role check
middleware/validate.js    express-validator error handling
routes/auth.js            register and login
routes/reviews.js         product reviews (new feature)
routes/gateway.js         external API gateway endpoints
services/external.js      Frankfurter, Nager.Date and Resend wrappers
scripts/seedAdmin.js      creates the admin account (hashed password)
scripts/initDb.js         creates the schema in a cloud database
database.sql              local schema (creates ecommerce_db)
database_cloud.sql        schema for a cloud database (no CREATE DATABASE / DROP)
public/                   frontend (HTML, CSS, JS, images)
.env.example              list of required environment variables
```

## Run locally (Windows)

1. Install **Node.js 18+** (nodejs.org) and **MySQL 8** (for example XAMPP). Start MySQL from the XAMPP Control Panel.
2. Get the code and install dependencies:
   ```
   git clone https://github.com/ShengJie666999/FA-Web-Technology.git
   cd FA-Web-Technology
   npm install
   ```
3. Create your environment file and fill it in:
   ```
   copy .env.example .env
   ```
   Open `.env` and set at least `DB_PASSWORD` (your MySQL root password; empty by default in XAMPP), `JWT_SECRET` (a long random string) and `ADMIN_PASSWORD` (the password you want for the admin account). To generate a secret:
   ```
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
4. Create the database. Either use the command line (Command Prompt, in the project folder):
   ```
   C:\xampp\mysql\bin\mysql.exe -u root -p < database.sql
   ```
   or open phpMyAdmin (http://localhost/phpmyadmin), choose the **Import** tab, select `database.sql` and click **Import**.
5. Create the admin account:
   ```
   npm run seed:admin
   ```
6. Start the server:
   ```
   npm start
   ```
7. Open http://localhost:3000 in your browser. Press `Ctrl + C` in the terminal to stop the server.

On macOS or Linux, use `cp .env.example .env` and `mysql -u root -p < database.sql`.

## Environment variables

All sensitive settings are loaded from a `.env` file using `require("dotenv").config()` in `config/db.js`. The source code only reads values such as `process.env.DB_PASSWORD` and `process.env.JWT_SECRET`; nothing sensitive is hardcoded. `.env` is listed in `.gitignore` and is never committed. `.env.example` documents every variable:

| Variable | Description |
|---|---|
| `PORT` | Server port (default 3000) |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL connection details |
| `DB_SSL` | Set to `true` if the cloud database requires SSL |
| `JWT_SECRET` | Secret used to sign login tokens |
| `JWT_EXPIRES_IN` | Token lifetime (default 2h) |
| `ADMIN_PASSWORD` | Password for the seeded admin account |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional, for order confirmation emails |

## Git workflow

```
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/ShengJie666999/FA-Web-Technology.git
git push -u origin main
```

After each milestone:

```
git add .
git commit -m "Describe the change"
git push
```

## Deploy to the cloud (Railway example)

1. Push the repository to GitHub (see above).
2. In Railway, choose **New Project → Deploy from GitHub repo** and select this repository. Railway runs `npm install` and `npm start`.
3. In the same project, click **New → Database → MySQL**.
4. Open the web service's **Variables** tab and set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` and `DB_NAME` from the MySQL service (Railway's variable references can fill these in). Also set `JWT_SECRET`, `ADMIN_PASSWORD`, and optionally `RESEND_API_KEY` and `EMAIL_FROM`. If the app reports an SSL error, add `DB_SSL=true`.
5. Create the tables in the cloud database. From your own computer the internal Railway host is not reachable, so use the MySQL service's **public** connection details (host, port, user, password, database from its Connect tab):
   - Temporarily put those values in your local `.env`.
   - Run `npm run db:init` (it runs `database_cloud.sql`), then `npm run seed:admin`.
   - Restore your normal local `.env` afterwards, and never commit it.
6. In the web service, open **Settings → Networking → Generate Domain** and open the URL.
7. **Continuous deployment:** every `git push` to `main` makes Railway rebuild and redeploy automatically.

Note: GitHub Pages cannot run this app because it only hosts static files and cannot run Node.js or MySQL.

## Security measures

- **Password hashing:** bcrypt with salt, cost factor 12; plaintext passwords are never stored
- **SQL injection prevention:** all queries use parameterized `?` placeholders, with whitelist validation on inputs
- **Input validation:** express-validator rules on every write endpoint (types, lengths, allowed categories, password strength)
- **Authentication and authorization:** JWT login; admin-only routes check the role on the server
- **Other:** helmet security headers, rate limiting on login and register, request size limits, output escaping against XSS, no raw database errors returned to clients

## Database design

Tables: `users`, `products`, `orders`, `order_items` and `reviews`.

- `order_items` links orders to products (deleting an order removes its items; deleting a product keeps the history with the product reference set to null)
- `reviews` links users and products, with a `UNIQUE (user_id, product_id)` rule (one review per user per product) and a `CHECK` rating from 1 to 5
- **Transactions:** placing an order locks the product rows (`FOR UPDATE`), checks stock, inserts the order and items, and decrements stock, committing everything together or rolling back; cancelling an order restores stock in a single transaction

## API summary

| Method | Path | Access |
|---|---|---|
| POST | `/api/register`, `/api/login` | public |
| GET | `/api/products`, `/api/products/:id` | public |
| POST / PUT / DELETE | `/api/products`, `/api/products/:id` | admin |
| POST | `/api/orders` | public (validated, transactional) |
| GET / DELETE | `/api/orders`, `/api/orders/:id` | admin |
| PUT | `/api/orders/:id/status` | admin (cancelling restores stock) |
| GET | `/api/products/:id/reviews` | public |
| POST | `/api/products/:id/reviews` | logged-in user |
| PUT | `/api/reviews/:id` | review owner |
| DELETE | `/api/reviews/:id` | review owner or admin |
| GET | `/api/gateway/products/:id/overview` | public |
| GET | `/api/gateway/holidays/:year`, `/api/gateway/rates` | public |

## Notes

- Product images are files inside `public/` and are referenced by file name in the Stock Management form (copy the image into `public/`, then type its exact file name).
- If an external API is unavailable, the product details panel still loads and shows what it could retrieve.
