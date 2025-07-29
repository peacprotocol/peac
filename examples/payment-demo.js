/**
 * PEAC Protocol Payment Demo
 * Shows how to parse a pact and process payments
 */

const { Parser, Payments } = require('../sdk');

async function demo() {
  console.log('PEAC Protocol Payment Demo\n');
  
  try {
    // 1. Parse pact from domain
    const parser = new Parser();
    const pact = await parser.parse('example.com');
    console.log('✓ Parsed pact from example.com');
    console.log(`  Version: ${pact.version}`);
    console.log(`  Pricing: ${pact.pact.economics.pricing}`);
    
    // 2. Initialize payment handler
    const payments = new Payments(pact);
    
    // 3. Process a payment
    console.log('\nProcessing payment...');
    const paymentResult = await payments.processPayment({
      amount: 10.00,
      currency: 'usd',
      purpose: 'ai_training',
      processor: 'stripe'
    });
    
    console.log('✓ Payment initiated');
    console.log(`  Payment ID: ${paymentResult.payment_id}`);
    console.log(`  Amount: $${paymentResult.amount}`);
    console.log(`  Status: ${paymentResult.status}`);
    
    // 4. Create payment link
    const paymentLink = await payments.createPaymentLink(10.00, 'ai_training');
    console.log(`\n✓ Payment link: ${paymentLink}`);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run demo if called directly
if (require.main === module) {
  demo();
}

module.exports = demo;