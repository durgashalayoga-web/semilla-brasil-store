# Guía rápida de publicación

1. Sube este proyecto a un servidor Node.js con HTTPS y disco persistente.
2. Ejecuta `npm install`.
3. Configura las variables de `.env`.
4. Ejecuta `npm start`.
5. Comprueba `/api/health`.
6. Configura los webhooks:
   - Stripe: `/api/webhooks/stripe`
   - Mercado Pago: `/api/webhooks/mercadopago`
7. Haz una compra de prueba.
8. Comprueba que el pedido aparece en `/api/admin/orders` con la clave Bearer.
9. Cambia credenciales de prueba por producción y vuelve a probar con una compra real de bajo importe.

Para un servidor con reverse proxy, apunta HTTPS a `localhost:3000`.
