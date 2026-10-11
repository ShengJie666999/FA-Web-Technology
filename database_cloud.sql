-- ShopFlow schema for a cloud database (no CREATE DATABASE / USE / DROP).
-- Create the tables with: npm run db:init

-- Users: passwords are stored as bcrypt hashes. New accounts default to 'customer'.
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'customer'
);
-- The admin account is created by:  npm run seed:admin   (uses ADMIN_PASSWORD from .env)

CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  image_url VARCHAR(255) DEFAULT 'default.jpg',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_price CHECK (price > 0),
  CONSTRAINT chk_stock CHECK (stock >= 0)
);

CREATE TABLE orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_name VARCHAR(100) NOT NULL,
  customer_email VARCHAR(120) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- order_items.product_id is SET NULL on product delete so order history is preserved
CREATE TABLE order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

-- NEW FEATURE: product reviews
CREATE TABLE reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  user_id INT NOT NULL,
  rating TINYINT NOT NULL,
  comment VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT uq_user_product UNIQUE (user_id, product_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO products (name, category, price, stock, image_url) VALUES
('Wireless Headphones', 'Electronics', 129.90, 20, 'Wireless Headphones.jpg'),
('Smart Watch', 'Electronics', 199.90, 15, 'Smart Watch.png'),
('Backpack', 'Fashion', 79.90, 25, 'Backpack.jpg'),
('USB-C Cable', 'Accessories', 29.90, 40, 'USB-C Cable.jpg'),
('Running Shoes', 'Sports', 159.90, 12, 'Running Shoes.jpg');
