function handlePayment({ method }) {
  if (method === 'stripe') return { pricing_proof: 'stub-uri' };
  return { pricing_proof: 'unknown-method' };
}

function handlePaymentReal({ amount, currency }) {
  return { payment_link: `https://stripe.com/pay/${amount}-${currency}` };
}

module.exports = { handlePayment, handlePaymentReal };
