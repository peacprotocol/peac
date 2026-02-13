/**
 * Example: OpenTelemetry integration with PEAC receipts
 *
 * Demonstrates:
 * - Setting up OTel tracing with PEAC telemetry
 * - Privacy modes (strict, balanced)
 * - Receipt issuance with automatic span events
 */

import { trace, context } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
  ConsoleSpanExporter,
} from '@opentelemetry/sdk-trace-base';
import { issue } from '@peac/protocol';
import { generateKeypair } from '@peac/crypto';
import { setTelemetryProvider } from '@peac/telemetry';
import { createOtelProvider } from '@peac/telemetry-otel';

/**
 * Initialize OpenTelemetry
 */
function initOtel(): void {
  // Set up trace provider with console exporter (for demo)
  const tracerProvider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
  });
  trace.setGlobalTracerProvider(tracerProvider);

  console.log('[OTel] Tracing initialized with console exporter\n');
}

/**
 * Configure PEAC telemetry with OTel provider
 */
function initTelemetry(privacyMode: 'strict' | 'balanced'): void {
  const provider = createOtelProvider({
    serviceName: 'peac-telemetry-demo',
    privacyMode,
    // In strict mode, salt is used for hashing identifiers
    hashSalt: 'demo-salt-do-not-use-in-production',
  });

  setTelemetryProvider(provider);

  console.log(`[Telemetry] Provider configured with privacy mode: ${privacyMode}\n`);
}

/**
 * Issue a receipt within a traced span
 */
async function issueReceiptWithTracing(): Promise<void> {
  const tracer = trace.getTracer('peac-demo');

  // Generate key pair
  const { privateKey } = await generateKeypair();

  // Create a span for the operation
  await tracer.startActiveSpan('process-payment', async (span) => {
    try {
      console.log('[Demo] Issuing receipt...');

      const result = await issue({
        iss: 'https://api.example.com',
        aud: 'https://shop.example.com',
        amt: 1999, // $19.99 in cents
        cur: 'USD',
        rail: 'stripe',
        reference: 'pi_demo_12345',
        privateKey,
        kid: '2025-01-01',
      });

      console.log('[Demo] Receipt issued successfully');
      console.log(`[Demo] JWS length: ${result.jws.length} chars\n`);

      // Add custom span attributes
      span.setAttribute('payment.amount', 1999);
      span.setAttribute('payment.currency', 'USD');
    } catch (error) {
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Main demo
 */
async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('PEAC Telemetry + OpenTelemetry Demo');
  console.log('='.repeat(60) + '\n');

  // Initialize OpenTelemetry
  initOtel();

  // Demo 1: Strict privacy mode (hashes all identifiers)
  console.log('[Demo 1] Strict privacy mode (hashes identifiers)');
  console.log('-'.repeat(50));
  initTelemetry('strict');
  await issueReceiptWithTracing();

  // Demo 2: Balanced mode (includes payment details)
  console.log('\n[Demo 2] Balanced privacy mode (includes amounts)');
  console.log('-'.repeat(50));
  initTelemetry('balanced');
  await issueReceiptWithTracing();

  console.log('\n' + '='.repeat(60));
  console.log('Demo complete. Check console output for span events.');
  console.log('In production, use OTLP exporter to send to Jaeger/Honeycomb/etc.');
  console.log('='.repeat(60));
}

main().catch(console.error);
