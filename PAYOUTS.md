# Pagos

La integración de FaucetPay está preparada para `BTC` y `LTC`.

## Configuración

Copia `.env.example` a `.env` y completa:

```env
FAUCETPAY_API_KEY=...
FAUCETPAY_ADMIN_SECRET=...
FAUCETPAY_CURRENCIES=BTC,LTC
```

El proceso Node debe recibir esas variables de entorno. Nunca pongas la API key en `public/` ni en el navegador.

## Endpoint protegido

`POST /api/payouts/faucetpay`

Headers:

```text
x-admin-secret: el_secreto_configurado
```

Body:

```json
{
  "account": "correo-o-cuenta-de-FaucetPay",
  "amount": 0.00001,
  "currency": "BTC"
}
```

El endpoint acepta únicamente `BTC` y `LTC` y reenvía el pago a FaucetPay. Antes de usarlo en producción hay que añadir autenticación de sesión, límites de retiro, historial de transacciones y validación del saldo ganado.

## Transferencias bancarias

FaucetPay no procesa transferencias bancarias. Para esa opción se necesita un proveedor separado, por ejemplo Stripe Connect o Mercado Pago, además de verificación de identidad y reglas de retiro. No se deben guardar números de cuenta o tarjetas directamente en `users.json`.
