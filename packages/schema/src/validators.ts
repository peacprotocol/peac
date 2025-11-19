/**
 * Zod validators for PEAC protocol types
 */
import { z } from "zod";
import { PEAC_WIRE_TYP, PEAC_ALG } from "./constants";

const httpsUrl = z.string().url().refine(u => u.startsWith("https://"), "must be https://");
const iso4217 = z.string().regex(/^[A-Z]{3}$/);
const uuidv7 = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

export const NormalizedPayment = z.object({
  rail: z.string().min(1),
  reference: z.string().min(1),
  amount: z.number().int().nonnegative(),
  currency: iso4217,
  asset: z.string().optional(),
  env: z.string().optional(),
  evidence: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
}).strict();

export const Subject = z.object({ uri: httpsUrl }).strict();

export const AIPREFSnapshot = z.object({
  url: httpsUrl,
  hash: z.string().min(8),
}).strict();

export const Extensions = z.object({
  aipref_snapshot: AIPREFSnapshot.optional(),
}).catchall(z.unknown());

export const JWSHeader = z.object({
  typ: z.literal(PEAC_WIRE_TYP),
  alg: z.literal(PEAC_ALG),
  kid: z.string().min(8),
}).strict();

export const ReceiptClaims = z.object({
  iss: httpsUrl,
  aud: httpsUrl,
  iat: z.number().int().nonnegative(),
  exp: z.number().int().optional(),
  rid: uuidv7,
  amt: z.number().int().nonnegative(),
  cur: iso4217,
  payment: NormalizedPayment,
  subject: Subject.optional(),
  ext: Extensions.optional(),
}).strict();

export const VerifyRequest = z.object({
  receipt_jws: z.string().min(16),
}).strict();
