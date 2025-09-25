/**
 * x402 Demo Client - 402→pay→200→verify flow
 */

interface PaymentRequired {
  type: string;
  status: number;
  requirements?: {
    scheme: string;
    network?: string;
    amount?: string;
  };
}

async function demonstrateX402Flow() {
  const serverUrl = 'http://localhost:8080/paid-content';

  console.log('🚀 Starting x402 demo flow...\n');

  // Step 1: Initial request (should return 402)
  console.log('📞 Step 1: Making initial request...');
  const response1 = await fetch(serverUrl);

  if (response1.status === 402) {
    console.log('✅ Got 402 Payment Required');
    const problem: PaymentRequired = await response1.json();
    console.log('💰 Payment requirements:', problem.requirements);
    console.log();

    // Step 2: Make payment and retry
    console.log('💳 Step 2: Simulating payment and retrying...');
    const mockPayment = JSON.stringify({
      payer: '0x1234567890123456789012345678901234567890',
      amount: problem.requirements?.amount || '1000000',
      network: problem.requirements?.network || 'base-mainnet',
      timestamp: Date.now(),
    });

    const response2 = await fetch(serverUrl, {
      headers: {
        'X-PAYMENT': mockPayment,
      },
    });

    if (response2.status === 200) {
      console.log('✅ Got 200 OK with content');

      // Step 3: Extract and display receipt
      const receipt = response2.headers.get('PEAC-Receipt');
      if (receipt) {
        console.log('🧾 Receipt received:', receipt.substring(0, 50) + '...');

        // Decode JWS payload (without verification for demo)
        const [header, payload, signature] = receipt.split('.');
        const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString());

        console.log('📄 Receipt payload:');
        console.log('  - Type:', decodedPayload.typ);
        console.log('  - Issuer:', decodedPayload.iss);
        console.log('  - Subject:', decodedPayload.sub);
        console.log('  - Payment scheme:', decodedPayload.payment?.scheme);
        console.log('  - Issued at:', new Date(decodedPayload.iat * 1000).toISOString());
      }

      // Display content
      const content = await response2.json();
      console.log('\n📝 Received content:');
      console.log(JSON.stringify(content, null, 2));
    } else {
      console.log('❌ Unexpected status:', response2.status);
      const errorBody = await response2.text();
      console.log('Error:', errorBody);
    }
  } else {
    console.log('❌ Expected 402, got:', response1.status);
    const body = await response1.text();
    console.log('Response:', body);
  }

  console.log('\n🎉 Demo complete!');
}

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateX402Flow().catch(console.error);
}

export { demonstrateX402Flow };
