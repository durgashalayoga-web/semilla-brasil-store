// =============================
// CONFIGURACIÓN DE LA TIENDA
// Los precios reales se validan también en el servidor.
// =============================
const products = [
  { id: 1, name: "Paquete promocional 4 meses", qty: "4 meses", price: 800, emoji: "🌰", description: "Promoción especial con envío incluido." },
  { id: 2, name: "Presentación Básica", qty: "10 semillas", price: 199, emoji: "🌰", description: "Presentación individual." },
  { id: 3, name: "Presentación Familiar", qty: "30 semillas", price: 449, emoji: "🌰", description: "Más unidades para tu compra." }
];

let cart = JSON.parse(localStorage.getItem("semillaBrasilCart") || "[]");
const $ = (s) => document.querySelector(s);
const money = (n) => new Intl.NumberFormat("es-MX", {style:"currency", currency:"MXN"}).format(n);

function save(){ localStorage.setItem("semillaBrasilCart", JSON.stringify(cart)); renderCart(); }
function getProduct(id){ return products.find(p => p.id === id); }
function count(){ return cart.reduce((sum, item) => sum + item.qty, 0); }
function total(){ return cart.reduce((sum, item) => sum + getProduct(item.id).price * item.qty, 0); }

function renderProducts(){
  $("#products").innerHTML = products.map(p => `
    <article class="product">
      <div class="product-img">${p.emoji}</div>
      <span class="eyebrow">${p.qty}</span>
      <h3>${p.name}</h3><p>${p.description}</p>
      <div class="price">${money(p.price)}</div>
      <button class="btn primary" onclick="addToCart(${p.id})">Agregar al carrito</button>
    </article>`).join("");
}

function addToCart(id){
  const existing = cart.find(i => i.id === id);
  if(existing) existing.qty++;
  else cart.push({id, qty:1});
  save(); openCart(); toast("Producto agregado al carrito");
}
function changeQty(id, delta){
  const item = cart.find(i => i.id === id);
  if(!item) return;
  item.qty += delta;
  if(item.qty <= 0) cart = cart.filter(i => i.id !== id);
  save();
}
function removeItem(id){ cart = cart.filter(i => i.id !== id); save(); }

function renderCart(){
  $("#cartCount").textContent = count();
  if(!cart.length){
    $("#cartItems").innerHTML = `<div class="empty">Tu carrito está vacío.<br><br>Agrega una presentación para comenzar.</div>`;
  } else {
    $("#cartItems").innerHTML = cart.map(item => {
      const p=getProduct(item.id);
      return `<div class="cart-item">
        <div class="cart-thumb">${p.emoji}</div>
        <div><h4>${p.name}</h4><div class="qty">
          <button onclick="changeQty(${p.id},-1)">−</button><span>${item.qty}</span><button onclick="changeQty(${p.id},1)">+</button>
        </div></div>
        <div><strong>${money(p.price * item.qty)}</strong><br><button class="remove" onclick="removeItem(${p.id})">Eliminar</button></div>
      </div>`;
    }).join("");
  }
  $("#cartTotal").textContent = money(total());
}

function openCart(){ $("#cartPanel").classList.add("open"); $("#overlay").classList.add("show"); }
function closeCart(){ $("#cartPanel").classList.remove("open"); $("#overlay").classList.remove("show"); }

function openCheckout(){
  if(!cart.length){ toast("Agrega al menos un producto"); return; }
  closeCart();
  $("#orderSummary").innerHTML = cart.map(item => {
    const p=getProduct(item.id);
    return `<div class="summary-line"><span>${p.name} × ${item.qty}</span><strong>${money(p.price*item.qty)}</strong></div>`;
  }).join("") + `<div class="summary-line summary-total"><span>Total</span><strong>${money(total())}</strong></div>`;
  $("#checkoutModal").classList.add("show");
}

function closeCheckout(){ $("#checkoutModal").classList.remove("show"); }

async function pay(provider){
  if(!cart.length){ toast("El carrito está vacío"); return; }
  const data = Object.fromEntries(new FormData($("#orderForm")).entries());
  if(!data.name || !data.phone || !data.address){
    $("#orderForm").reportValidity();
    return;
  }

  const button = provider === "mercadopago" ? $("#mpButton") : $("#stripeButton");
  button.disabled = true;
  button.textContent = "Preparando pago…";

  try {
    const response = await fetch(`/api/checkout/${provider}`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        cart,
        customer: { name:data.name, phone:data.phone, address:data.address, notes:data.notes || "" }
      })
    });
    const result = await response.json();
    if(!response.ok) throw new Error(result.error || "No se pudo iniciar el pago.");
    if(!result.url) throw new Error("El proveedor no devolvió una URL de pago.");
    window.location.href = result.url;
  } catch (err) {
    toast(err.message);
    button.disabled = false;
    button.textContent = provider === "mercadopago" ? "Pagar con Mercado Pago" : "Pagar con Stripe";
  }
}

function toast(message){
  const el=$("#toast"); el.textContent=message; el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"),2800);
}

$("#openCart").addEventListener("click", openCart);
$("#closeCart").addEventListener("click", closeCart);
$("#overlay").addEventListener("click", closeCart);
$("#checkoutBtn").addEventListener("click", openCheckout);
$("#closeModal").addEventListener("click", closeCheckout);
$("#mpButton").addEventListener("click", () => pay("mercadopago"));
$("#stripeButton").addEventListener("click", () => pay("stripe"));

$("#orderForm").addEventListener("submit", (e) => e.preventDefault());
$("#whatsappButton").addEventListener("click", () => {
  const data = Object.fromEntries(new FormData($("#orderForm")).entries());
  const lines = cart.map(item => {
    const p=getProduct(item.id);
    return `• ${p.name} (${p.qty}) x${item.qty} = ${money(p.price*item.qty)}`;
  }).join("\n");
  const msg = `Hola, quiero hacer este pedido:\n\n${lines}\n\nTotal: ${money(total())}\n\nNombre: ${data.name}\nTeléfono: ${data.phone}\nDirección: ${data.address}\nNotas: ${data.notes || "Sin notas"}`;
  toast("Para WhatsApp, configura tu número en el frontend.");
  window.open(`https://wa.me/525579823911?text=${encodeURIComponent(msg)}`, "_blank");
});


const paymentStatus = new URLSearchParams(location.search).get("payment");
if (paymentStatus === "stripe_success" || paymentStatus === "mercadopago_success") {
  localStorage.removeItem("semillaBrasilCart");
  cart = [];
  setTimeout(() => toast("Solicitud de pago enviada. La confirmación se actualizará al validar el pago."), 300);
}
if (paymentStatus === "cancelled" || paymentStatus === "mercadopago_failure") {
  setTimeout(() => toast("El pago no se completó. Tu carrito se mantiene."), 300);
}

renderProducts();
renderCart();
