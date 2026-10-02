import "dotenv/config";
import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import Stripe from "stripe";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");

const db = new Database(process.env.DB_PATH || path.join(__dirname, "orders.db"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  customer_notes TEXT,
  currency TEXT NOT NULL DEFAULT 'MXN',
  total_cents INTEGER NOT NULL,
  items_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_provider_reference ON orders(provider_reference);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
`);

const PRODUCTS = {
  1: { name: "Paquete promocional 4 meses", qty: "4 meses", price: 800 },
  2: { name: "Presentación Básica", qty: "10 semillas", price: 199 },
  3: { name: "Presentación Familiar", qty: "30 semillas", price: 449 }
};

function requireEnv(name) {
  if (!process.env[name]) throw new Error(`Falta configurar ${name}.`);
  return process.env[name];
}
function buildItems(cart) {
  if (!Array.isArray(cart) || cart.length === 0) throw new Error("El carrito está vacío.");
  return cart.map(item => {
    const p = PRODUCTS[Number(item.id)];
    const quantity = Number(item.qty);
    if (!p || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new Error("El carrito contiene un producto o cantidad inválida.");
    }
    return { id: String(item.id), name: p.name, qty: p.qty, price: p.price, quantity };
  });
}
function totalCents(items) {
  return items.reduce((sum, i) => sum + i.price * 100 * i.quantity, 0);
}
function now() { return new Date().toISOString(); }
function newOrderId() { return `SB-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`; }

const insertOrder = db.prepare(`
INSERT INTO orders
(id, provider, provider_reference, status, customer_name, customer_phone, customer_address, customer_notes, currency, total_cents, items_json, created_at, updated_at)
VALUES (@id,@provider,NULL,'pending',@name,@phone,@address,@notes,'MXN',@total,@items,@created,@updated)
`);
const updateProvider = db.prepare(`UPDATE orders SET provider_reference=?, updated_at=? WHERE id=?`);
const updateStatus = db.prepare(`UPDATE orders SET status=?, updated_at=? WHERE id=?`);
const getOrder = db.prepare(`SELECT * FROM orders WHERE id=?`);
const getByProvider = db.prepare(`SELECT * FROM orders WHERE provider=? AND provider_reference=?`);

function createLocalOrder(provider, customer, items) {
  const id = newOrderId();
  const timestamp = now();
  insertOrder.run({
    id, provider,
    name: String(customer?.name || "").slice(0,120),
    phone: String(customer?.phone || "").slice(0,40),
    address: String(customer?.address || "").slice(0,1000),
    notes: String(customer?.notes || "").slice(0,1000),
    total: totalCents(items),
    items: JSON.stringify(items),
    created: timestamp, updated: timestamp
  });
  return id;
}

function assertCustomer(customer) {
  if (!customer?.name || !customer?.phone || !customer?.address) {
    throw new Error("Faltan datos del comprador.");
  }
}

// Stripe Checkout
app.post("/api/checkout/stripe", express.json(), async (req, res) => {
  try {
    const items = buildItems(req.body.cart);
    assertCustomer(req.body.customer);
    const orderId = createLocalOrder("stripe", req.body.customer, items);
    const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency: "mxn",
      line_items: items.map(i => ({
        price_data: {
          currency: "mxn",
          product_data: { name: `${i.name} — ${i.qty}` },
          unit_amount: i.price * 100
        },
        quantity: i.quantity
      })),
      customer_creation: "always",
      client_reference_id: orderId,
      metadata: { order_id: orderId },
      success_url: `${BASE_URL}/?payment=stripe_success&order=${orderId}`,
      cancel_url: `${BASE_URL}/?payment=cancelled&order=${orderId}`
    });
    updateProvider.run(session.id, now(), orderId);
    res.json({ url: session.url, orderId });
  } catch (e) {
    console.error(e);
    res.status(400).json({error:e.message || "No se pudo crear el pago."});
  }
});

// Mercado Pago Orders API (Checkout Pro Orders)
app.post("/api/checkout/mercadopago", express.json(), async (req, res) => {
  try {
    const items = buildItems(req.body.cart);
    assertCustomer(req.body.customer);
    const orderId = createLocalOrder("mercadopago", req.body.customer, items);
    const token = requireEnv("MERCADOPAGO_ACCESS_TOKEN");
    const idempotency = crypto.randomUUID();
    const response = await fetch("https://api.mercadopago.com/v1/orders", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotency
      },
      body: JSON.stringify({
        type: "online",
        processing_mode: "automatic",
        total_amount: (totalCents(items)/100).toFixed(2),
        external_reference: orderId,
        description: "Pedido Semilla Brasil",
        payer: { email: req.body.customer.email || undefined },
        items: items.map(i => ({
          title: `${i.name} — ${i.qty}`,
          quantity: i.quantity,
          unit_price: i.price,
          total_amount: i.price * i.quantity,
          unit_measure: "unit"
        })),
        config: {
          redirect_urls: {
            success: `${BASE_URL}/?payment=mercadopago_success&order=${orderId}`,
            pending: `${BASE_URL}/?payment=mercadopago_pending&order=${orderId}`,
            failure: `${BASE_URL}/?payment=mercadopago_failure&order=${orderId}`
          }
        }
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Mercado Pago rechazó la orden.");
    const providerRef = data.id || data.order_id;
    const checkoutUrl = data.checkout_url || data.init_point;
    if (!providerRef || !checkoutUrl) throw new Error("Mercado Pago no devolvió una URL de checkout.");
    updateProvider.run(String(providerRef), now(), orderId);
    res.json({ url: checkoutUrl, orderId });
  } catch (e) {
    console.error(e);
    res.status(400).json({error:e.message || "No se pudo crear el pago."});
  }
});

// Stripe webhook — raw body must be preserved for signature verification.
app.post("/api/webhooks/stripe", express.raw({type:"application/json"}), (req,res) => {
  try {
    const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
    const event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      requireEnv("STRIPE_WEBHOOK_SECRET")
    );

    const session = event.data.object;
    const orderId = session.metadata?.order_id || session.client_reference_id;

    if (orderId) {
      if (event.type === "checkout.session.completed") {
        updateStatus.run("paid", now(), orderId);
      } else if (event.type === "checkout.session.async_payment_succeeded") {
        updateStatus.run("paid", now(), orderId);
      } else if (event.type === "checkout.session.async_payment_failed") {
        updateStatus.run("payment_failed", now(), orderId);
      }
    }
    res.sendStatus(200);
  } catch (e) {
    console.error("Stripe webhook:", e.message);
    res.status(400).send(`Webhook Error: ${e.message}`);
  }
});

// Mercado Pago webhook — validates x-signature and then queries the order.
app.post("/api/webhooks/mercadopago", express.json(), async (req,res) => {
  try {
    const secret = requireEnv("MERCADOPAGO_WEBHOOK_SECRET");
    const signature = String(req.headers["x-signature"] || "");
    const requestId = String(req.headers["x-request-id"] || "");
    const dataId = String(req.query["data.id"] || req.body?.data?.id || "").toLowerCase();

    const parts = Object.fromEntries(signature.split(",").map(p => {
      const [k,...v] = p.split("="); return [k, v.join("=")];
    }));
    const ts = parts.ts;
    const v1 = parts.v1;
    if (!ts || !v1 || !requestId || !dataId) return res.sendStatus(400);

    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1))) return res.sendStatus(401);

    const providerId = dataId;
    const token = requireEnv("MERCADOPAGO_ACCESS_TOKEN");
    const r = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(providerId)}`, {
      headers: {Authorization:`Bearer ${token}`}
    });
    if (!r.ok) return res.sendStatus(502);
    const order = await r.json();
    const local = getByProvider.get("mercadopago", providerId);

    if (local) {
      const status = String(order.status || "").toLowerCase();
      if (["processed","approved","completed"].includes(status)) updateStatus.run("paid", now(), local.id);
      else if (["cancelled","rejected","failed"].includes(status)) updateStatus.run("payment_failed", now(), local.id);
      else if (["pending","action_required","created"].includes(status)) updateStatus.run("pending", now(), local.id);
    }
    res.sendStatus(200);
  } catch (e) {
    console.error("Mercado Pago webhook:", e.message);
    res.sendStatus(400);
  }
});

app.get("/api/orders/:id", (req,res) => {
  const order = getOrder.get(req.params.id);
  if (!order) return res.sendStatus(404);
  // Do not expose address/phone publicly.
  res.json({
    id: order.id, provider: order.provider, status: order.status,
    total: order.total_cents/100, currency: order.currency,
    created_at: order.created_at
  });
});

// Minimal private order listing for the owner/admin.
app.get("/api/admin/orders", (req,res) => {
  const key = req.headers.authorization?.replace(/^Bearer\s+/i,"");
  if (!process.env.ADMIN_API_KEY || key !== process.env.ADMIN_API_KEY) return res.sendStatus(401);
  const rows = db.prepare(`SELECT id,provider,status,customer_name,customer_phone,customer_address,total_cents,currency,created_at,updated_at FROM orders ORDER BY created_at DESC LIMIT 200`).all();
  res.json(rows.map(r => ({...r,total:r.total_cents/100})));
});

app.get("/api/health", (_req,res) => res.json({
  ok:true,
  db:true,
  providers:{
    stripe:Boolean(process.env.STRIPE_SECRET_KEY),
    mercadopago:Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN)
  }
}));

app.use(express.static(path.join(__dirname,"public")));
app.get("*", (_req,res) => res.sendFile(path.join(__dirname,"public","index.html")));

app.listen(PORT, () => console.log(`Semilla Brasil: ${BASE_URL}`));
