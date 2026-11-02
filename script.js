
/* =====================================================
   DESHI BAZAR — FRONTEND
   Product catalogue + order placement
   Order tracking intentionally removed.
===================================================== */

const CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycby8zIcyTj2r95dAPilF0u6XjpWgWhEDp_31s7KzoW0uaw-xv-3DhWluCENs9mIOrvLo_g/exec",
  REQUEST_TIMEOUT: 25000
};

const state = {
  products: [],
  selectedProduct: null,
  submitting: false
};

const $ = (selector, root = document) =>
  root.querySelector(selector);


/* =====================================================
   COMMON HELPERS
===================================================== */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function toEnglishDigits(value) {
  return String(value ?? "").replace(/[০-৯]/g, digit =>
    "০১২৩৪৫৬৭৮৯".indexOf(digit)
  );
}

function formatMoney(value) {
  const amount = Number(value) || 0;

  return "৳" + new Intl.NumberFormat("bn-BD", {
    maximumFractionDigits: 2
  }).format(amount);
}

function safeImageURL(value) {
  const url = String(value || "").trim();

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return "https://images.unsplash.com/photo-1604495772376-9657f0035eb5?auto=format&fit=crop&w=900&q=80";
}

function makeRequestId() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return "db-" + Date.now() + "-" +
    Math.random().toString(36).slice(2, 12);
}


/* =====================================================
   API
===================================================== */

const DeshiAPI = {

  async request(url, options = {}) {

    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      CONFIG.REQUEST_TIMEOUT
    );

    try {

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        redirect: "follow"
      });

      const text = await response.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch (error) {
        throw new Error(
          "সার্ভার থেকে সঠিক উত্তর পাওয়া যায়নি। Apps Script deployment পরীক্ষা করুন।"
        );
      }

      if (!response.ok || data.success === false) {
        throw new Error(
          data.message || "অনুরোধটি সম্পন্ন করা যায়নি।"
        );
      }

      return data;

    } catch (error) {

      if (error.name === "AbortError") {
        throw new Error(
          "অনুরোধের সময় শেষ হয়েছে। আবার চেষ্টা করুন।"
        );
      }

      throw error;

    } finally {
      clearTimeout(timer);
    }
  },


  async getProducts() {

    return this.request(
      CONFIG.API_URL + "?action=products",
      {
        method: "GET",
        cache: "no-store"
      }
    );
  },


  async createOrder(order) {

    return this.request(
      CONFIG.API_URL,
      {
        method: "POST",

        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },

        body: JSON.stringify({
          action: "createOrder",
          order: order
        })
      }
    );
  }

};


/* =====================================================
   PRODUCT FUNCTIONS
===================================================== */

function normalizeProduct(raw) {

  return {
    name: String(raw.product_name || "").trim(),

    price: Number(raw.price_per_kg) || 0,

    minimum: Number(raw.minimum_kg) || 0.5,

    dhakaDelivery: Number(raw.dhaka_delivery) || 0,

    outsideDelivery: Number(raw.outside_dhaka_delivery) || 0,

    description: String(raw.short_description || "").trim(),

    image: safeImageURL(raw.image_url),

    sortOrder: Number(raw.sort_order) || 9999
  };
}


async function loadProducts() {

  const result = await DeshiAPI.getProducts();

  state.products = (result.products || [])
    .map(normalizeProduct)
    .filter(product => product.name && product.price > 0);

  return state.products;
}


function showCatalogError(message) {

  const status = $("#catalogStatus");

  if (!status) return;

  status.textContent = message;
  status.classList.add("is-error");
}


function productCard(product) {

  const href = "product.html?product=" +
    encodeURIComponent(product.name);

  return `
    <article class="product-card">

      <a class="product-card-image" href="${href}">
        <img
          src="${escapeHTML(product.image)}"
          alt="${escapeHTML(product.name)}"
          loading="lazy">

        <span class="card-image-label">দেশি বাজার</span>
      </a>

      <div class="product-card-body">

        <span class="card-kicker">বাছাইকৃত পণ্য</span>

        <h3>
          <a href="${href}">
            ${escapeHTML(product.name)}
          </a>
        </h3>

        <p>
          ${escapeHTML(
            product.description ||
            "মানসম্মত দেশি পণ্য। বিস্তারিত দেখে অর্ডার করুন।"
          )}
        </p>

        <div class="card-bottom">

          <strong>
            ${formatMoney(product.price)}
            <small>/ কেজি</small>
          </strong>

          <a class="card-link" href="${href}">
            বিস্তারিত →
          </a>

        </div>

      </div>

    </article>
  `;
}


function renderHomeProducts() {

  const grid = $("#productGrid");

  if (!grid) return;

  const status = $("#catalogStatus");

  if (!state.products.length) {
    showCatalogError(
      "এই মুহূর্তে কোনো পণ্য পাওয়া যাচ্ছে না। পরে আবার দেখুন।"
    );
    return;
  }

  if (status) {
    status.hidden = true;
  }

  grid.innerHTML = state.products
    .map(productCard)
    .join("");
}


/* =====================================================
   PRODUCT DETAILS
===================================================== */

function getSelectedProductFromURL() {

  const requested = new URLSearchParams(
    location.search
  ).get("product");

  if (!requested) return null;

  return state.products.find(product =>
    product.name.toLowerCase() ===
    requested.trim().toLowerCase()
  ) || null;
}


function getQuantity() {

  const input = $("#quantity");

  return Math.max(
    0,
    Number(input?.value) || 0
  );
}


function getDeliveryCharge(product) {

  return $("#deliveryArea")?.value === "outside"
    ? product.outsideDelivery
    : product.dhakaDelivery;
}


function updateOrderSummary() {

  const product = state.selectedProduct;

  if (!product) return;

  const quantity = getQuantity();

  const subtotal = product.price * quantity;

  const delivery = getDeliveryCharge(product);

  const total = subtotal + delivery;

  $("#summarySubtotal").textContent =
    formatMoney(subtotal);

  $("#summaryDelivery").textContent =
    formatMoney(delivery);

  $("#summaryTotal").textContent =
    formatMoney(total);

  $("#minimumNote").textContent =
    `ন্যূনতম অর্ডার ${product.minimum} কেজি। পরিমাণ ০.৫ কেজির ধাপে দিতে হবে।`;
}


function showOrderMessage(message, type = "success") {

  const box = $("#orderMessage");

  if (!box) return;

  box.textContent = message;

  box.className =
    "form-message " +
    (type === "error" ? "is-error" : "is-success");

  box.hidden = false;
}


function renderProductPage() {

  const product = getSelectedProductFromURL();

  const status = $("#productStatus");

  if (!product) {

    if (status) {
      status.textContent =
        "পণ্যটি পাওয়া যায়নি। পণ্যের তালিকা থেকে আবার নির্বাচন করুন।";

      status.classList.add("is-error");
    }

    return;
  }

  state.selectedProduct = product;

  if (status) status.hidden = true;

  $("#productPageContent").hidden = false;

  $("#detailImage").src = product.image;

  $("#detailImage").alt = product.name;

  $("#detailName").textContent = product.name;

  $("#detailDescription").textContent =
    product.description || "দেশি বাজারের বাছাইকৃত মানসম্মত পণ্য।";

  $("#detailPrice").innerHTML =
    `${formatMoney(product.price)} <small>/ কেজি</small>`;

  $("#detailProductInfo").innerHTML = `
    <span>ন্যূনতম অর্ডার: <b>${product.minimum} কেজি</b></span>
    <span>ঢাকার ডেলিভারি: <b>${formatMoney(product.dhakaDelivery)}</b></span>
    <span>ঢাকার বাইরে: <b>${formatMoney(product.outsideDelivery)}</b></span>
  `;

  $("#breadcrumbProduct").textContent = product.name;

  document.title = product.name + " | দেশি বাজার";

  const quantityInput = $("#quantity");

  quantityInput.min = String(product.minimum);
  quantityInput.step = "0.5";

  quantityInput.value = String(
    Math.ceil(Math.max(product.minimum, 1) * 2) / 2
  );

  $("#relatedProducts").innerHTML = state.products
    .filter(item => item.name !== product.name)
    .slice(0, 3)
    .map(productCard)
    .join("");

  quantityInput.addEventListener(
    "input",
    updateOrderSummary
  );

  $("#deliveryArea").addEventListener(
    "change",
    updateOrderSummary
  );

  $("#qtyMinus").addEventListener("click", () => {

    quantityInput.value = Math.max(
      product.minimum,
      getQuantity() - 0.5
    );

    updateOrderSummary();
  });

  $("#qtyPlus").addEventListener("click", () => {

    quantityInput.value = Math.min(
      100,
      getQuantity() + 0.5
    );

    updateOrderSummary();
  });

  $("#orderForm").addEventListener(
    "submit",
    handleOrderSubmit
  );

  updateOrderSummary();
}


/* =====================================================
   ORDER SUBMISSION
===================================================== */

async function handleOrderSubmit(event) {

  event.preventDefault();

  if (state.submitting || !state.selectedProduct) {
    return;
  }

  const product = state.selectedProduct;

  const quantity = getQuantity();

  const name = $("#customerName").value.trim();

  const phone = toEnglishDigits(
    $("#customerPhone").value.trim()
  ).replace(/\D/g, "");

  const address = $("#customerAddress").value.trim();

  const area = $("#deliveryArea").value;

  const website = $("#website").value.trim();

  if (website) return;

  if (
    quantity < product.minimum ||
    quantity > 100 ||
    Math.abs(quantity * 2 - Math.round(quantity * 2)) > 0.000001
  ) {

    showOrderMessage(
      `পরিমাণ কমপক্ষে ${product.minimum} কেজি এবং ০.৫ কেজির ধাপে হতে হবে।`,
      "error"
    );

    return;
  }

  if (name.length < 2) {

    showOrderMessage(
      "আপনার সম্পূর্ণ নাম লিখুন।",
      "error"
    );

    $("#customerName").focus();

    return;
  }

  if (!/^01[3-9]\d{8}$/.test(phone)) {

    showOrderMessage(
      "সঠিক ১১ ডিজিটের বাংলাদেশি মোবাইল নম্বর দিন।",
      "error"
    );

    $("#customerPhone").focus();

    return;
  }

  if (address.length < 10) {

    showOrderMessage(
      "আপনার সম্পূর্ণ ঠিকানা লিখুন।",
      "error"
    );

    $("#customerAddress").focus();

    return;
  }

  const button = $("#submitOrder");

  state.submitting = true;

  button.disabled = true;

  button.textContent = "অর্ডার জমা হচ্ছে...";

  $("#orderMessage").hidden = true;

  $("#orderConfirmation").hidden = true;


  const order = {

    clientRequestId: makeRequestId(),

    name: name,

    phone: phone,

    address: address,

    area: area,

    productName: product.name,

    quantity: quantity,

    website: website

  };


  try {

    const result = await DeshiAPI.createOrder(order);

    if (!result.orderId) {
      throw new Error(
        "অর্ডার নম্বর পাওয়া যায়নি। অনুগ্রহ করে অর্ডার তালিকা যাচাই করুন।"
      );
    }

    const confirmation = $("#orderConfirmation");

    confirmation.innerHTML = `
      <div class="confirmation-icon">✓</div>

      <h3>অর্ডার সফলভাবে গ্রহণ করা হয়েছে!</h3>

      <p>আপনার অর্ডার নম্বর</p>

      <strong>${escapeHTML(result.orderId)}</strong>

      <p>
        পণ্যের মূল্য: ${formatMoney(result.subtotal)}
      </p>

      <p>
        ডেলিভারি চার্জ: ${formatMoney(result.delivery)}
      </p>

      <p>
        সর্বমোট: <b>${formatMoney(result.total)}</b>
      </p>

      <small>
        আপনার অর্ডারটি আমাদের কাছে জমা হয়েছে।
        প্রয়োজনে আমাদের প্রতিনিধি আপনার সঙ্গে যোগাযোগ করবেন।
      </small>
    `;

    confirmation.hidden = false;

    confirmation.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    showOrderMessage(
      "আপনার অর্ডার সফলভাবে জমা হয়েছে।",
      "success"
    );

    $("#orderForm").reset();

    $("#quantity").value = String(
      Math.ceil(Math.max(product.minimum, 1) * 2) / 2
    );

    updateOrderSummary();

  } catch (error) {

    showOrderMessage(
      error.message || "অর্ডার জমা দেওয়া যায়নি। আবার চেষ্টা করুন।",
      "error"
    );

  } finally {

    state.submitting = false;

    button.disabled = false;

    button.innerHTML =
      'অর্ডার নিশ্চিত করুন →';
  }
}


/* =====================================================
   NAVIGATION
===================================================== */

function setupNavigation() {

  const toggle = $("#menuToggle");

  const nav = $("#mainNav");

  if (toggle && nav) {

    toggle.addEventListener("click", () => {
      nav.classList.toggle("is-open");
    });

    nav.querySelectorAll("a").forEach(link => {

      link.addEventListener("click", () => {
        nav.classList.remove("is-open");
      });

    });
  }

  const year = $("#currentYear");

  if (year) {
    year.textContent = new Date().getFullYear();
  }
}


/* =====================================================
   INITIALIZATION
===================================================== */

document.addEventListener("DOMContentLoaded", async () => {

  setupNavigation();

  try {

    await loadProducts();

    renderHomeProducts();

    if ($("#productPageContent")) {
      renderProductPage();
    }

  } catch (error) {

    if ($("#productGrid")) {
      showCatalogError(
        error.message || "পণ্য লোড করা যায়নি।"
      );
    }

    if ($("#productStatus")) {

      $("#productStatus").textContent =
        error.message || "পণ্যের তথ্য লোড করা যায়নি।";

      $("#productStatus").classList.add("is-error");
    }

  }

});
