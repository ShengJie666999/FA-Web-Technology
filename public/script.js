// ===== Application State & Storage =====
let products = [];
let cart = JSON.parse(localStorage.getItem("shopflow_cart")) || [];
let currentUser = JSON.parse(localStorage.getItem("shopflow_user")) || null;
let token = localStorage.getItem("shopflow_token");

// A user without a token is not really logged in
if (currentUser && !token) {
  currentUser = null;
  localStorage.removeItem("shopflow_user");
}

// Route guard (UX only; the server enforces real authorization with JWT roles)
if ((location.pathname.endsWith("stock.html") || location.pathname.endsWith("orders.html")) && currentUser?.role !== "admin") {
  location.href = "index.html";
}

function clearSession() {
  localStorage.removeItem("shopflow_user");
  localStorage.removeItem("shopflow_token");
  currentUser = null;
  token = null;
}

// ===== Navigation (role-aware) =====
function syncHeaderNavigation() {
  const nav = document.querySelector("header nav");
  if (!nav) return;

  const getLink = href => nav.querySelector(`a[href="${href}"]`);
  const isNotAdmin = currentUser?.role !== "admin";

  if (getLink("stock.html")) getLink("stock.html").style.display = isNotAdmin ? "none" : "";
  if (getLink("orders.html")) getLink("orders.html").style.display = isNotAdmin ? "none" : "";

  const loginLink = getLink("login.html");
  if (loginLink) {
    loginLink.textContent = currentUser ? `Logout (${currentUser.username})` : "Login";
    loginLink.href = currentUser ? "#" : "login.html";
    loginLink.onclick = currentUser ? (e) => {
      e.preventDefault();
      if (confirm(`Are you sure you want to log out, ${currentUser.username}?`)) {
        clearSession();
        location.href = "index.html";
      }
    } : null;
  }
}

// ===== Utilities =====
const saveCart = () => localStorage.setItem("shopflow_cart", JSON.stringify(cart));
const val = id => document.getElementById(id)?.value.trim();

// Fetch wrapper: sends the JWT and turns validation errors into readable messages
async function fetchApi(url, method = "GET", body = null) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();

  if (res.status === 401 && token) {
    clearSession();
    syncHeaderNavigation();
  }
  if (!res.ok) {
    const detail = data.details?.map(d => d.message).join(", ");
    throw new Error(detail || data.error || "Request failed");
  }
  return data;
}

// ===== Products =====
async function loadProducts() {
  try {
    products = await fetchApi("/api/products");
    renderProducts();
    renderStock();
    renderCart();
  } catch (err) { showMessage(err.message, true); }
}

function renderProducts() {
  const list = document.getElementById("productList");
  if (!list) return;

  const query = (val("search") || "").toLowerCase();
  const cat = val("categoryFilter");

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(query) && (!cat || p.category.toLowerCase() === cat.toLowerCase()));
  if (!filtered.length) return list.innerHTML = "<p>No products found matching your criteria.</p>";

  list.innerHTML = filtered.map(p => {
    const isOut = p.stock === 0;
    const isLow = p.stock > 0 && p.stock < 5;
    const badge = isOut ? '<span class="badge badge-out">Out of Stock</span>' : (isLow ? '<span class="badge badge-low">Low Stock</span>' : '');

    return `
      <article class="card product-card ${isOut ? 'out-of-stock' : ''}">
        <img src="${escapeHtml(p.image_url || 'default.jpg')}" alt="${escapeHtml(p.name)}" width="150">
        ${badge}
        <h3>${escapeHtml(p.name)}</h3>
        <p>${escapeHtml(p.category)}</p>
        <p class="price">RM ${Number(p.price).toFixed(2)}</p>
        <p>${p.stock} in stock</p>
        <div>
          <button onclick="addToCart(${p.id})" ${isOut ? "disabled" : ""}>${isOut ? "Out of Stock" : "Add to Cart"}</button>
          <button type="button" onclick="toggleDetails(${p.id})">Details &amp; Reviews</button>
        </div>
        <div id="details-${p.id}" hidden style="width:100%;margin-top:10px"></div>
      </article>`;
  }).join("");
}

document.getElementById("search")?.addEventListener("input", renderProducts);
document.getElementById("categoryFilter")?.addEventListener("change", renderProducts);

// ===== Details panel: gateway data (Task 1) + reviews (Task 2 feature) =====
async function toggleDetails(id) {
  const box = document.getElementById(`details-${id}`);
  if (!box) return;
  if (!box.hidden) { box.hidden = true; return; }
  box.hidden = false;
  box.textContent = "Loading...";
  try {
    const [rev, ov] = await Promise.all([
      fetchApi(`/api/products/${id}/reviews`),
      fetchApi(`/api/gateway/products/${id}/overview`).catch(() => null)
    ]);

    const others = ov ? Object.entries(ov.prices).filter(([k, v]) => /^[A-Z]{3}$/.test(k) && k !== "MYR" && typeof v === "number") : [];
    const gateway = ov ? `
      <p><strong>Also priced at:</strong> ${others.length ? others.map(([c, v]) => `${c} ${v.toFixed(2)}`).join(" | ") : "rates unavailable"}</p>
      <p><strong>Estimated delivery:</strong> ${ov.estimatedDelivery ? escapeHtml(ov.estimatedDelivery) : "unavailable"}</p>` : "";

    const reviewList = rev.reviews.length
      ? rev.reviews.map(r => `
          <p><strong>${escapeHtml(r.username)}</strong> - ${"&#9733;".repeat(r.rating)} (${r.rating}/5)<br>
          ${escapeHtml(r.comment || "")}
          ${currentUser && (currentUser.id === r.user_id || currentUser.role === "admin")
            ? `<br><button type="button" onclick="deleteReview(${r.id}, ${id})">Delete</button>` : ""}</p>`).join("")
      : "<p>No reviews yet.</p>";

    const form = currentUser ? `
      <div class="card" style="display:grid;gap:8px">
        <label for="rating-${id}">Your rating</label>
        <select id="rating-${id}">
          <option value="5">5 - Excellent</option><option value="4">4 - Good</option>
          <option value="3">3 - OK</option><option value="2">2 - Poor</option><option value="1">1 - Terrible</option>
        </select>
        <label for="comment-${id}">Comment (optional)</label>
        <input id="comment-${id}" maxlength="500" placeholder="Share your thoughts">
        <button type="button" onclick="submitReview(${id})">Submit Review</button>
      </div>` : "<p><a href='login.html'>Log in</a> to leave a review.</p>";

    box.innerHTML = `${gateway}
      <p><strong>Reviews:</strong> ${rev.average ? `${rev.average}/5 from ${rev.count} review(s)` : "none yet"}</p>
      ${reviewList}${form}`;
  } catch (err) {
    box.textContent = "";
    showMessage(err.message, true);
  }
}

async function submitReview(productId) {
  try {
    const data = await fetchApi(`/api/products/${productId}/reviews`, "POST", {
      rating: Number(val(`rating-${productId}`)),
      comment: val(`comment-${productId}`)
    });
    showMessage(data.message);
    document.getElementById(`details-${productId}`).hidden = true;
    toggleDetails(productId);
  } catch (err) { showMessage(err.message, true); }
}

async function deleteReview(reviewId, productId) {
  if (!confirm("Delete this review?")) return;
  try {
    const data = await fetchApi(`/api/reviews/${reviewId}`, "DELETE");
    showMessage(data.message);
    document.getElementById(`details-${productId}`).hidden = true;
    toggleDetails(productId);
  } catch (err) { showMessage(err.message, true); }
}

// ===== Cart =====
function addToCart(id) {
  const p = products.find(x => x.id === id);
  if (!p || p.stock <= 0) return showMessage(p ? `Sorry, ${p.name} is out of stock.` : "Product not found.", true);

  const item = cart.find(i => i.id === id);
  if ((item?.quantity || 0) + 1 > p.stock) return showMessage(`Cannot add more ${p.name}. Stock limit reached.`, true);

  item ? item.quantity++ : cart.push({ id, quantity: 1 });
  saveCart();
  renderCart();
  showMessage(`${p.name} added to cart!`);
}

function renderCart() {
  const box = document.getElementById("cartItems");
  const totalEl = document.getElementById("cartTotal");

  if (box && totalEl) {
    if (!cart.length) {
      box.innerHTML = "<p>Your cart is empty.</p>";
      totalEl.innerHTML = "<strong>Total: RM 0.00</strong>";
    } else {
      let total = 0;
      box.innerHTML = cart.map(i => {
        const p = products.find(x => x.id === i.id);
        if (!p) return "";
        total += Number(p.price) * i.quantity;
        return `<div class="card">
          <strong>${escapeHtml(p.name)}</strong> × ${i.quantity}
          <button type="button" onclick="changeQty(${p.id}, 1)">+</button>
          <button type="button" onclick="changeQty(${p.id}, -1)">−</button>
        </div>`;
      }).join("");
      totalEl.innerHTML = `<strong>Total: RM ${total.toFixed(2)}</strong>`;
    }
  }
  updateCartCount();
}

function updateCartCount() {
  const el = document.getElementById("cartCount");
  if (!el) return;
  const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);
  el.textContent = totalQty;
  el.style.display = totalQty > 0 ? "inline-flex" : "none";
}

function changeQty(id, amount) {
  const p = products.find(x => x.id === id);
  const item = cart.find(i => i.id === id);
  if (!item) return;

  if (amount > 0 && p && item.quantity + amount > p.stock) return showMessage(`Cannot exceed available stock of ${p.stock}.`, true);

  item.quantity += amount;
  if (item.quantity <= 0) cart = cart.filter(i => i.id !== id);

  saveCart();
  renderCart();
}

// ===== Authentication =====
document.getElementById("loginForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  try {
    const data = await fetchApi("/api/login", "POST", { username: val("username"), password: val("password") });
    currentUser = data.user;
    token = data.token;
    localStorage.setItem("shopflow_user", JSON.stringify(currentUser));
    localStorage.setItem("shopflow_token", token);
    showMessage(`Login successful! Welcome ${currentUser.username}.`);
    setTimeout(() => location.href = currentUser.role === "admin" ? "stock.html" : "index.html", 1000);
  } catch (err) { showMessage(err.message, true); }
});

// Adds a "Create Account" button to the login form without changing login.html
(function addRegisterButton() {
  const form = document.getElementById("loginForm");
  if (!form) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Create Account";
  btn.addEventListener("click", async () => {
    try {
      const data = await fetchApi("/api/register", "POST", { username: val("username"), password: val("password") });
      showMessage(`${data.message}. You can now log in.`);
    } catch (err) { showMessage(err.message, true); }
  });
  form.appendChild(btn);
})();

// ===== Checkout =====
document.getElementById("checkoutForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  if (!cart.length) return showMessage("Your cart is empty.", true);

  try {
    const data = await fetchApi("/api/orders", "POST", { customerName: val("customerName"), customerEmail: val("customerEmail"), items: cart });
    showMessage(`Order #${data.orderId} placed successfully! Total: RM ${Number(data.total).toFixed(2)}`);
    cart = [];
    saveCart();
    e.target.reset();
    renderCart();
    await loadProducts();
    if (currentUser?.role === "admin") loadOrders();
  } catch (err) { showMessage(err.message, true); }
});

// ===== Admin: product CRUD =====
const getFormData = () => ({
  name: val("productName"),
  category: val("category"),
  price: Number(val("price")),
  stock: Number(val("stock")),
  image_url: val("imageUrl")
});

const fillForm = (p = {}) => {
  document.getElementById("productId").value = p.id || "";
  document.getElementById("productName").value = p.name || "";
  document.getElementById("category").value = p.category || "";
  document.getElementById("price").value = p.price || "";
  document.getElementById("stock").value = p.stock ?? "";
  document.getElementById("imageUrl").value = p.image_url || "";
};

document.getElementById("productForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  try {
    const data = await fetchApi("/api/products", "POST", getFormData());
    showMessage(data.message);
    fillForm();
    await loadProducts();
  } catch (err) { showMessage(err.message, true); }
});

document.getElementById("readBtn")?.addEventListener("click", async () => {
  const id = val("productId");
  const name = (val("productName") || "").toLowerCase();
  try {
    const p = id ? await fetchApi(`/api/products/${id}`) : products.find(x => x.name.toLowerCase().includes(name));
    if (!p) throw new Error("Product not found.");
    fillForm(p);
    showMessage(`Product #${p.id} loaded into form.`);
  } catch (err) { showMessage(err.message, true); }
});

document.getElementById("updateBtn")?.addEventListener("click", async () => {
  const id = val("productId");
  if (!id) return showMessage("Select a Product ID to update.", true);
  try {
    const data = await fetchApi(`/api/products/${id}`, "PUT", getFormData());
    showMessage(data.message);
    fillForm();
    await loadProducts();
  } catch (err) { showMessage(err.message, true); }
});

document.getElementById("deleteBtn")?.addEventListener("click", () => deleteProduct(val("productId")));
document.getElementById("cancelEdit")?.addEventListener("click", () => { fillForm(); showMessage("Form cleared."); });

async function deleteProduct(id) {
  if (!id) return showMessage("Please specify a Product ID.", true);
  if (!confirm(`Delete product #${id}?`)) return;
  try {
    const data = await fetchApi(`/api/products/${id}`, "DELETE");
    showMessage(data.message);
    fillForm();
    await loadProducts();
  } catch (err) { showMessage(err.message, true); }
}

function renderStock() {
  const table = document.getElementById("stockTable");
  if (!table || currentUser?.role !== "admin") return;
  if (!products.length) return table.innerHTML = "<p>No products available.</p>";

  table.innerHTML = `
    <table>
      <thead><tr><th>ID</th><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Image</th><th>Actions</th></tr></thead>
      <tbody>
      ${products.map(p => `
        <tr>
          <td>#${p.id}</td><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.category)}</td>
          <td>RM ${Number(p.price).toFixed(2)}</td>
          <td>${p.stock} ${p.stock === 0 ? '<span class="badge badge-out">Out</span>' : (p.stock < 5 ? '<span class="badge badge-low">Low</span>' : '')}</td>
          <td>${escapeHtml(p.image_url || 'default.jpg')}</td>
          <td>
            <button type="button" onclick="editProduct(${p.id})">Edit</button>
            <button type="button" onclick="deleteProduct(${p.id})">Delete</button>
          </td>
        </tr>`).join("")}
      </tbody>
    </table>`;
}

function editProduct(id) {
  const p = products.find(x => x.id === id);
  if (p) { fillForm(p); showMessage(`Loaded product #${p.id}.`); }
}

// ===== Admin: orders =====
const ORDER_STATUSES = ["Pending", "Paid", "Shipped", "Completed", "Cancelled"];

async function loadOrders() {
  const table = document.getElementById("ordersTable");
  if (!table || currentUser?.role !== "admin") return;
  try {
    const orders = await fetchApi("/api/orders");
    if (!orders.length) return table.innerHTML = "<p>No orders recorded yet.</p>";

    table.innerHTML = `
      <table>
        <thead><tr><th>Order ID</th><th>Customer</th><th>Total</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
        <tbody>${orders.map(o => `<tr>
          <td>#${o.id}</td><td>${escapeHtml(o.customer_name)}</td>
          <td>RM ${Number(o.total).toFixed(2)}</td>
          <td>
            <select aria-label="Status for order ${o.id}" onchange="updateOrderStatus(${o.id}, this.value)">
              ${ORDER_STATUSES.map(s => `<option ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}
            </select>
          </td>
          <td>${new Date(o.created_at).toLocaleString()}</td>
          <td><button type="button" onclick="deleteOrder(${o.id})">Delete</button></td>
        </tr>`).join("")}</tbody>
      </table>`;
  } catch (err) { showMessage(err.message, true); }
}

async function updateOrderStatus(id, status) {
  try {
    const data = await fetchApi(`/api/orders/${id}/status`, "PUT", { status });
    showMessage(data.message);
    loadOrders();
  } catch (err) { showMessage(err.message, true); loadOrders(); }
}

async function deleteOrder(id) {
  if (!confirm(`Delete order #${id}?`)) return;
  try {
    const data = await fetchApi(`/api/orders/${id}`, "DELETE");
    showMessage(data.message);
    loadOrders();
  } catch (err) { showMessage(err.message, true); }
}

// ===== UI feedback & XSS protection =====
function showMessage(text, error = false) {
  const el = document.getElementById("message");
  if (!el) return;
  el.textContent = text;
  el.className = error ? "alert" : "success-message";
}

function escapeHtml(v) {
  return String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
}

// ===== Init =====
document.addEventListener("DOMContentLoaded", () => {
  syncHeaderNavigation();
  updateCartCount();
  loadProducts();
  if (currentUser?.role === "admin") loadOrders();
});
