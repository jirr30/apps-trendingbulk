/**
 * Client untuk berkomunikasi dengan payments.trendingbulk.top (Payment Server)
 * apps.trendingbulk.top TIDAK menyentuh Midtrans langsung.
 * Semua request pembayaran dikirim ke payment server via REST API.
 */

const BASE_URL  = process.env.PAYMENTS_API_URL || 'https://payments.trendingbulk.top';
const API_KEY   = process.env.PAYMENTS_API_KEY;
const APPS_URL  = process.env.APPS_URL || 'https://apps.trendingbulk.top';

async function apiRequest(method, path, body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY
    }
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, options);
  const json = await res.json();

  if (!res.ok) {
    const err = new Error(json.message || `HTTP ${res.status}`);
    err.statusCode = res.status;
    err.response = json;
    throw err;
  }
  return json;
}

/**
 * Buat payment link via payment server
 */
async function createPayment({ orderId, customerName, customerEmail, customerPhone, amount, description }) {
  return apiRequest('POST', '/api/payment/create', {
    orderId, customerName, customerEmail, customerPhone, amount, description,
    source: 'apps',
    callbackUrl: `${APPS_URL}/api/payment-callback`
  });
}

/**
 * Cek status pembayaran dari payment server
 */
async function getPaymentStatus(orderId) {
  return apiRequest('GET', `/api/payment/${orderId}/status`);
}

/**
 * Generate URL portal customer di payments server
 * (untuk tombol "Buka Portal Customer" di admin apps)
 */
function getPortalUrl(customerEmail) {
  if (!customerEmail) return `${BASE_URL}/portal/login`;
  return `${BASE_URL}/portal/login?email=${encodeURIComponent(customerEmail)}`;
}

module.exports = { createPayment, getPaymentStatus, getPortalUrl };
