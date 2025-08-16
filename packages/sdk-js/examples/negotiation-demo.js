/**
 * PEAC Protocol Negotiation Demo
 * Demonstrates programmatic negotiation
 * @license Apache-2.0
 */

const { UniversalParser, Negotiation } = require("../sdk");

async function main() {
  try {
    // Parse peac
    console.log("Parsing peac from publisher.example.com...");
    const parser = new UniversalParser();
    const peac = await parser.parseAll("publisher.example.com");

    console.log("✓ peac parsed successfully");
    console.log(
      `  Negotiation enabled: ${peac.peac?.negotiation?.enabled || false}`,
    );

    // Initialize negotiation
    const negotiation = new Negotiation(peac);

    // Example 1: Standard negotiation
    console.log("\n1. Standard AI training negotiation...");
    const result1 = await negotiation.negotiate({
      use_case: "ai_training",
      volume: "500GB",
      budget: 5000,
      duration: "30 days",
      attribution_commitment: true,
    });

    if (result1.accepted) {
      console.log("✓ Negotiation accepted!");
      console.log(`  Price: $${result1.terms.price}`);
      console.log(`  Payment link: ${result1.terms.payment_link}`);
    } else {
      console.log("✗ Negotiation not accepted");
      console.log(`  Reason: ${result1.reason}`);
      if (result1.counter_offer) {
        console.log(
          `  Suggested budget: $${result1.counter_offer.suggested_budget}`,
        );
      }
    }

    // Example 2: Academic discount
    console.log("\n2. Academic negotiation...");
    const result2 = await negotiation.negotiate({
      use_case: "ai_training",
      volume: "100GB",
      budget: 500,
      duration: "1 year",
      academic_verification: true,
      attribution_commitment: true,
    });

    console.log(
      result2.accepted
        ? "✓ Academic discount applied!"
        : "✗ Academic discount not available",
    );

    // Example 3: Bulk negotiation
    console.log("\n3. Bulk negotiation...");
    const result3 = await negotiation.negotiate({
      use_case: "ai_training",
      volume: "10TB",
      budget: 50000,
      duration: "1 year",
      attribution_commitment: true,
      framework: "langchain",
    });

    if (result3.accepted) {
      console.log("✓ Bulk negotiation accepted!");
      console.log(`  Volume: ${result3.terms.volume}`);
      console.log(`  Total price: $${result3.terms.price}`);
      console.log(
        `  Price per GB: $${(result3.terms.price / 10240).toFixed(4)}`,
      );
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Run demo if called directly
if (require.main === module) {
  main();
}

module.exports = main;
