# Semilla Brasil — tienda lista para producción

## Incluye

- Carrito y catálogo.
- Promoción de 4 meses por $800 MXN con envío incluido.
- WhatsApp: 55 7982 3911.
- Stripe Checkout.
- Mercado Pago Orders / Checkout.
- Base de datos SQLite para registrar pedidos.
- Estados `pending`, `paid` y `payment_failed`.
- Webhook de Stripe con validación de firma.
- Webhook de Mercado Pago con validación HMAC.
- Endpoint privado para consultar hasta 200 pedidos.
- Precios calculados en el servidor.

## 1. Requisitos

Node.js 20+ y un servidor que mantenga un proceso Node.js y almacenamiento persistente.

Instala dependencias:

```bash
npm install
```

Copia `.env.example` a `.env`.

Genera una clave de administración larga para `ADMIN_API_KEY`.

## 2. Stripe

Configura una clave secreta de producción `STRIPE_SECRET_KEY`.

En Stripe crea un endpoint webhook:

```text
https://TU-DOMINIO.COM/api/webhooks/stripe
```

Suscribe al menos:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`

Copia el signing secret del endpoint en:

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

El servidor usa `stripe.webhooks.constructEvent()` sobre el cuerpo raw para validar la firma antes de modificar un pedido.

## 3. Mercado Pago

En la aplicación de Mercado Pago configura el Webhook de producción:

```text
https://TU-DOMINIO.COM/api/webhooks/mercadopago
```

Configura las notificaciones de órdenes/pagos que correspondan a tu integración y copia el secreto de firma:

```env
MERCADOPAGO_WEBHOOK_SECRET=...
```

El servidor valida `x-signature` mediante HMAC y después consulta la Order en Mercado Pago antes de marcar el pedido como pagado.

## 4. Base de datos

SQLite crea automáticamente `orders.db`.

No subas `orders.db` a GitHub. En producción, asegúrate de que el directorio de datos sea persistente; de lo contrario, los pedidos se perderán cuando el servidor sea recreado.

La tabla almacena:

- ID interno
- proveedor de pago
- referencia del proveedor
- estado
- nombre
- teléfono
- dirección
- notas
- total
- productos
- fechas

## 5. Consultar pedidos

Endpoint privado:

```text
GET /api/admin/orders
Authorization: Bearer TU_ADMIN_API_KEY
```

No publiques esta clave en el navegador.

## 6. Arrancar

```bash
npm start
```

Health check:

```text
GET /api/health
```

Debe responder con `ok: true`.

## 7. Seguridad antes de publicar

- Usa HTTPS.
- Usa claves LIVE únicamente en producción y nunca las pongas en `public/`.
- Configura los secretos de webhook.
- No expongas `/api/admin/orders` sin `ADMIN_API_KEY`.
- Configura copias de seguridad de `orders.db`.
- Prueba primero con credenciales de prueba.
- Configura términos, privacidad, envíos y devoluciones reales.
- No marques un pedido como pagado por la URL de retorno: el estado de pago se actualiza por webhook después de verificar al proveedor.

## 8. Despliegue

Esta versión necesita un hosting que pueda ejecutar Node.js y conservar la base SQLite. Si el hosting usa almacenamiento efímero, cambia SQLite por PostgreSQL antes de producción.

Una opción sencilla es usar un servicio Node con disco persistente. Si quieres usar Vercel/Netlify, conviene migrar la base de datos a PostgreSQL/Supabase/Neon en lugar de SQLite.

## Nota sobre Mercado Pago

La documentación actual de Mercado Pago presenta Orders API como la vía recomendada para nuevas integraciones de Checkout API/Orders. La creación utiliza `X-Idempotency-Key`, y los Webhooks deben validar su firma HMAC antes de procesar el evento.
