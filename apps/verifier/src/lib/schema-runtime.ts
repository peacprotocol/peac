/**
 * Disables Zod's just-in-time validator compilation for the whole application.
 *
 * Zod's default fast path constructs a validator with the Function constructor, gated by a
 * capability probe that itself calls `Function("")`. Under the verifier's Content-Security-Policy
 * (`script-src 'self'`, no `unsafe-eval`) that call is refused, which both raises a policy
 * violation and defeats the intent of a closed, offline surface. Jitless mode uses the
 * interpreted validator and performs no dynamic code construction.
 *
 * The probe fires at schema construction, so this must run before any schema is built. It is
 * imported for its side effect as the first import of every application and test entry point.
 */
import { config } from 'zod';

config({ jitless: true });
