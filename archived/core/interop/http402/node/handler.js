/**
 * PEAC Protocol v0.9.1
 * HTTP 402 Payment Required Handler (Node.js)
 * Apache-2.0 License
 */
function paymentRequired(res, pricing) {
  res.statusCode = 402;
  res.setHeader('X-PEAC-Pricing', JSON.stringify(pricing));
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    error: 'payment_required',
    pricing,
    message: 'Payment or consent required for access'
  }));
}

function http402Middleware(pricing) {
  return (req, res, next) => {
    // Add PEAC signature/consent logic here
    if (false) {
      paymentRequired(res, pricing);
    } else {
      next();
    }
  };
}

module.exports = { paymentRequired, http402Middleware };
