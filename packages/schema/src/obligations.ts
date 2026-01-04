/**
 * PEAC Obligations Extension Types (v0.9.26+)
 *
 * Defines credit and contribution obligations for receipts,
 * aligned with Creative Commons Signals framework.
 *
 * The `peac/obligations` extension allows content owners to specify
 * requirements for credit/attribution and contribution models.
 *
 * @see https://creativecommons.org/signals/ for CC Signals background
 */
import { z } from 'zod';

// =============================================================================
// CREDIT METHOD (v0.9.26+)
// =============================================================================

/**
 * How credit/attribution should be provided.
 *
 * - 'inline': Credit appears inline with the generated content
 * - 'references': Credit appears in a references/sources section
 * - 'model-card': Credit appears in model documentation/card
 */
export const CreditMethodSchema = z.enum(['inline', 'references', 'model-card']);
export type CreditMethod = z.infer<typeof CreditMethodSchema>;

/**
 * Array of valid credit methods for runtime checks.
 */
export const CREDIT_METHODS = ['inline', 'references', 'model-card'] as const;

// =============================================================================
// CONTRIBUTION TYPE (v0.9.26+)
// =============================================================================

/**
 * Type of contribution model.
 *
 * - 'direct': Direct payment to content owner
 * - 'ecosystem': Contribution to ecosystem fund/coalition
 * - 'open': Freely usable (no payment required)
 */
export const ContributionTypeSchema = z.enum(['direct', 'ecosystem', 'open']);
export type ContributionType = z.infer<typeof ContributionTypeSchema>;

/**
 * Array of valid contribution types for runtime checks.
 */
export const CONTRIBUTION_TYPES = ['direct', 'ecosystem', 'open'] as const;

// =============================================================================
// CREDIT OBLIGATION (v0.9.26+)
// =============================================================================

/**
 * CreditObligation - specifies attribution/credit requirements.
 *
 * Content owners can require credit when their content is used,
 * specifying where and how the credit should appear.
 *
 * @example
 * ```typescript
 * const credit: CreditObligation = {
 *   required: true,
 *   citation_url: 'https://publisher.example/collection',
 *   method: 'references',
 * };
 * ```
 */
export const CreditObligationSchema = z
  .object({
    /** Whether credit is required (REQUIRED) */
    required: z.boolean(),

    /** URL for citation/attribution (OPTIONAL) */
    citation_url: z.string().url().max(2048).optional(),

    /** How credit should be provided (OPTIONAL, defaults to implementation choice) */
    method: CreditMethodSchema.optional(),

    /** Human-readable credit text template (OPTIONAL) */
    credit_text: z.string().max(1024).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    // If credit is required, at least one of citation_url, credit_text, or method must be specified
    if (data.required && !data.citation_url && !data.credit_text && !data.method) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'When credit is required, at least one of citation_url, credit_text, or method must be specified',
        path: ['required'],
      });
    }
  });
export type CreditObligation = z.infer<typeof CreditObligationSchema>;

// =============================================================================
// CONTRIBUTION OBLIGATION (v0.9.26+)
// =============================================================================

/**
 * ContributionObligation - specifies contribution/payment model.
 *
 * Aligned with CC Signals reciprocity framework:
 * - direct: Payment goes directly to content owner
 * - ecosystem: Payment goes to shared ecosystem fund
 * - open: Content is freely usable
 *
 * @example
 * ```typescript
 * const contribution: ContributionObligation = {
 *   type: 'ecosystem',
 *   destination: 'https://fund.creativecommons.org',
 * };
 * ```
 */
export const ContributionObligationSchema = z
  .object({
    /** Type of contribution (REQUIRED) */
    type: ContributionTypeSchema,

    /** Destination for contributions (OPTIONAL, e.g., fund URL, wallet address) */
    destination: z.string().max(2048).optional(),

    /** Minimum contribution amount in minor units (OPTIONAL) */
    min_amount: z.number().int().min(0).optional(),

    /** Currency for min_amount (OPTIONAL, ISO 4217 or crypto symbol like USDC) */
    currency: z
      .string()
      .min(3)
      .max(8)
      .regex(/^[A-Z0-9]{3,8}$/)
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    // If type is 'direct' or 'ecosystem', destination is required
    if ((data.type === 'direct' || data.type === 'ecosystem') && !data.destination) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Destination is required when contribution type is '${data.type}'`,
        path: ['destination'],
      });
    }
    // min_amount requires currency
    if (data.min_amount !== undefined && !data.currency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Currency is required when min_amount is specified',
        path: ['currency'],
      });
    }
  });
export type ContributionObligation = z.infer<typeof ContributionObligationSchema>;

// =============================================================================
// OBLIGATIONS EXTENSION (v0.9.26+)
// =============================================================================

/**
 * Extension key for obligations
 */
export const OBLIGATIONS_EXTENSION_KEY = 'peac/obligations' as const;

/**
 * ObligationsExtension - the full obligations extension block.
 *
 * This extension is added to receipt extensions under the key `peac/obligations`.
 *
 * @example
 * ```typescript
 * const receipt = {
 *   // ... receipt fields ...
 *   extensions: {
 *     'peac/obligations': {
 *       credit: {
 *         required: true,
 *         citation_url: 'https://publisher.example/collection',
 *         method: 'references',
 *       },
 *       contribution: {
 *         type: 'ecosystem',
 *         destination: 'https://fund.example.org',
 *       },
 *     },
 *   },
 * };
 * ```
 */
export const ObligationsExtensionSchema = z
  .object({
    /** Credit/attribution obligations (OPTIONAL) */
    credit: CreditObligationSchema.optional(),

    /** Contribution/payment model (OPTIONAL) */
    contribution: ContributionObligationSchema.optional(),
  })
  .strict();
export type ObligationsExtension = z.infer<typeof ObligationsExtensionSchema>;

// =============================================================================
// VALIDATION HELPERS (v0.9.26+)
// =============================================================================

/**
 * Validate a CreditObligation.
 *
 * @param data - Unknown data to validate
 * @returns Result with validated obligation or error message
 */
export function validateCreditObligation(
  data: unknown
): { ok: true; value: CreditObligation } | { ok: false; error: string } {
  const result = CreditObligationSchema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, error: result.error.message };
}

/**
 * Validate a ContributionObligation.
 *
 * @param data - Unknown data to validate
 * @returns Result with validated obligation or error message
 */
export function validateContributionObligation(
  data: unknown
): { ok: true; value: ContributionObligation } | { ok: false; error: string } {
  const result = ContributionObligationSchema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, error: result.error.message };
}

/**
 * Validate an ObligationsExtension.
 *
 * @param data - Unknown data to validate
 * @returns Result with validated extension or error message
 *
 * @example
 * ```typescript
 * const result = validateObligationsExtension(data);
 * if (result.ok) {
 *   if (result.value.credit?.required) {
 *     console.log('Credit required:', result.value.credit.citation_url);
 *   }
 * }
 * ```
 */
export function validateObligationsExtension(
  data: unknown
): { ok: true; value: ObligationsExtension } | { ok: false; error: string } {
  const result = ObligationsExtensionSchema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, error: result.error.message };
}

/**
 * Extract obligations extension from a receipt's extensions object.
 *
 * @param extensions - Extensions object from receipt
 * @returns Validated obligations or undefined if not present
 */
export function extractObligationsExtension(
  extensions: Record<string, unknown> | undefined
): ObligationsExtension | undefined {
  if (!extensions || !(OBLIGATIONS_EXTENSION_KEY in extensions)) {
    return undefined;
  }

  const result = validateObligationsExtension(extensions[OBLIGATIONS_EXTENSION_KEY]);
  if (result.ok) {
    return result.value;
  }
  return undefined;
}

/**
 * Check if credit is required based on obligations.
 *
 * @param obligations - Obligations extension
 * @returns True if credit is explicitly required
 */
export function isCreditRequired(obligations: ObligationsExtension | undefined): boolean {
  return obligations?.credit?.required === true;
}

/**
 * Check if contribution is required (non-open type).
 *
 * @param obligations - Obligations extension
 * @returns True if contribution type is 'direct' or 'ecosystem'
 */
export function isContributionRequired(obligations: ObligationsExtension | undefined): boolean {
  const type = obligations?.contribution?.type;
  return type === 'direct' || type === 'ecosystem';
}

/**
 * Create a credit-only obligations extension.
 *
 * @param params - Credit parameters
 * @returns ObligationsExtension with credit only
 */
export function createCreditObligation(params: {
  required: boolean;
  citation_url?: string;
  method?: CreditMethod;
  credit_text?: string;
}): ObligationsExtension {
  const credit: CreditObligation = { required: params.required };
  if (params.citation_url) credit.citation_url = params.citation_url;
  if (params.method) credit.method = params.method;
  if (params.credit_text) credit.credit_text = params.credit_text;
  return { credit };
}

/**
 * Create a contribution-only obligations extension.
 *
 * @param params - Contribution parameters
 * @returns ObligationsExtension with contribution only
 */
export function createContributionObligation(params: {
  type: ContributionType;
  destination?: string;
  min_amount?: number;
  currency?: string;
}): ObligationsExtension {
  const contribution: ContributionObligation = { type: params.type };
  if (params.destination) contribution.destination = params.destination;
  if (params.min_amount !== undefined) contribution.min_amount = params.min_amount;
  if (params.currency) contribution.currency = params.currency;
  return { contribution };
}

/**
 * Create a full obligations extension with both credit and contribution.
 *
 * @param credit - Credit obligation parameters
 * @param contribution - Contribution obligation parameters
 * @returns Full ObligationsExtension
 */
export function createObligationsExtension(
  credit?: {
    required: boolean;
    citation_url?: string;
    method?: CreditMethod;
    credit_text?: string;
  },
  contribution?: {
    type: ContributionType;
    destination?: string;
    min_amount?: number;
    currency?: string;
  }
): ObligationsExtension {
  const result: ObligationsExtension = {};

  if (credit) {
    result.credit = { required: credit.required };
    if (credit.citation_url) result.credit.citation_url = credit.citation_url;
    if (credit.method) result.credit.method = credit.method;
    if (credit.credit_text) result.credit.credit_text = credit.credit_text;
  }

  if (contribution) {
    result.contribution = { type: contribution.type };
    if (contribution.destination) result.contribution.destination = contribution.destination;
    if (contribution.min_amount !== undefined)
      result.contribution.min_amount = contribution.min_amount;
    if (contribution.currency) result.contribution.currency = contribution.currency;
  }

  return result;
}
