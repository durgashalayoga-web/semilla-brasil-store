PUBLICAR EN RENDER SIN PAGAR EL SERVICIO WEB

1) En Render crea el Web Service desde GitHub.
2) Language: Node.
3) Branch: main.
4) Root Directory: vacío.
5) Build Command: npm install
6) Start Command: npm start
7) Compute: Free ($0/month).
8) En Advanced / Environment Variables agrega las variables de .env.example.

BASE_URL se pone después de conocer la URL de Render.

BASE DE DATOS
1) En Render: New -> Postgres.
2) Selecciona Free.
3) Crea la base de datos.
4) Copia su Internal Database URL.
5) En el Web Service agrega DATABASE_URL con ese valor.
6) Haz un nuevo deploy.

IMPORTANTE SOBRE EL PLAN GRATIS
Render indica que el Web Service gratuito puede dormir tras 15 minutos sin tráfico y tarda aproximadamente un minuto en despertar. También indica que los archivos locales se pierden al reiniciar/redeployar. El Postgres gratuito tiene 1 GB y expira a los 30 días. Por eso esta configuración sirve para pruebas o para poner la página a funcionar sin pagar ahora, pero no debe considerarse almacenamiento permanente para una tienda real.

PAGOS
Después de tener la URL pública, configura:
Mercado Pago webhook: https://TU-URL/api/webhooks/mercadopago
Stripe webhook: https://TU-URL/api/webhooks/stripe

No pegues claves secretas en GitHub ni en capturas. Ponlas únicamente en Render > Environment Variables.
