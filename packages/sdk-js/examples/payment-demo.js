/**
 * PEAC Protocol Payment Demo
 * Demonstrates payment processing with multiple providers
 * @license Apache-2.0
 */

const { UniversalParser, Payments } = require("../sdk");

async function main() {
  try {
    // Parse peac from a domain
    console.log("Parsing peac from example.com...");
    const parser = new UniversalParser();
    const peac = await parser.parseAll("example.com");

    console.log("✓ peac parsed successfully");
    console.log(`  Version: ${peac.version}`);
    console.log(
      `  Available processors: ${Object.keys(peac.peac?.economics?.payment_processors || {}).join(", ")}`,
    );

    // Initialize payments
    const payments = new Payments(peac);

    // Example 1: Stripe payment
    console.log("\n1. Processing Stripe payment...");
    const stripeResult = await payments.processPayment({
      amount: 10.0,
      currency: "usd",
      purpose: "ai_training",
      processor: "stripe",
    });
    console.log("✓ Stripe payment initiated");
    console.log(`  Payment ID: ${stripeResult.payment_id}`);
    console.log(`  Status: ${stripeResult.status}`);

    // Example 2: Bridge payment (stablecoin)
    console.log("\n2. Processing Bridge payment...");
    const bridgeResult = await payments.processPayment({
      amount: 50.0,
      currency: "usd",
      purpose: "api_access",
      processor: "bridge",
    });
    console.log("✓ Bridge payment initiated");
    console.log(`  Payment ID: ${bridgeResult.payment_id}`);
    console.log(`  Destination: USDB`);

    // Example 3: Create payment link
    console.log("\n3. Creating payment link...");
    const paymentLink = await payments.createPaymentLink(
      100.0,
      "commercial_use",
      { processor: "stripe" },
    );
    console.log("✓ Payment link created");
    console.log(`  Link: ${paymentLink}`);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Run demo if called directly
if (require.main === module) {
  main();
}

module.exports = main;
