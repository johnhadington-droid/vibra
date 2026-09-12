const FAUCETPAY_URL = process.env.FAUCETPAY_API_URL || "https://faucetpay.io/api/v1";

async function faucetPayRequest(endpoint, payload) {
    if (!process.env.FAUCETPAY_API_KEY) {
        throw new Error("Falta FAUCETPAY_API_KEY en las variables de entorno.");
    }

    const body = new URLSearchParams({
        api_key: process.env.FAUCETPAY_API_KEY,
        ...payload
    });
    const response = await fetch(`${FAUCETPAY_URL}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
    });
    const data = await response.json();

    if (!response.ok || data.success === false) {
        throw new Error(data.message || "FaucetPay rechazó la solicitud.");
    }

    return data;
}

async function sendPayout({ account, amount, currency, ipAddress }) {
    return faucetPayRequest("send", {
        to: account,
        amount: String(amount),
        currency,
        ip_address: ipAddress || "0.0.0.0"
    });
}

module.exports = { sendPayout };
