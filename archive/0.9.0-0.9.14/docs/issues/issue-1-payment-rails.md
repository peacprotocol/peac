# Issue: Payment Rails Conformance - Assert Retry-After Semantics End-to-End

**Label:** v0.9.13.3-next
**Type:** Enhancement

## Description

Ensure all payment rails (L402, x402, Stripe) properly implement and test Retry-After header semantics for 402 Payment Required responses.

## Current State

- Bridge returns Retry-After header on 402 responses
- Value mirrors payment provider timing
- Not all payment adapters validated for correct timing

## Requirements

1. **L402 Adapter**
   - Validate Lightning invoice expiry maps to Retry-After
   - Test macaroon expiration timing
   - Ensure consistent retry behavior

2. **x402 Adapter**
   - Verify stablecoin payment window timing
   - Test settlement confirmation delays
   - Map blockchain confirmation times to Retry-After

3. **Stripe Adapter**
   - Check PaymentIntent expiry timing
   - Test webhook retry windows
   - Ensure idempotency key expiration alignment

## Acceptance Criteria

- [ ] All three payment rails return appropriate Retry-After values
- [ ] Values match actual payment provider retry windows
- [ ] End-to-end tests validate retry timing
- [ ] Documentation updated with timing semantics per rail
- [ ] Performance impact < 1ms on 402 responses

## Technical Approach

1. Create test harness for payment timing validation
2. Mock payment providers with configurable retry windows
3. Assert Retry-After values match provider configuration
4. Add integration tests for each payment rail
5. Document timing behavior in adapter README files

## References

- RFC 7231 Section 7.1.3 (Retry-After)
- Bridge implementation: apps/bridge/src/routes/enforce.ts
- Payment adapters: packages/pay402/src/
