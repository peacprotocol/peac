/**
 * @peac/mappings-ucp - UCP to PEAC receipt mapping
 *
 * Maps UCP order data to PEAC receipt claims.
 * Amounts are in minor units (cents), NOT micros.
 */

import type { UcpOrder, MapUcpOrderOptions, MappedReceiptClaims, MinorUnits } from './types.js';
import { ErrorCodes, ucpError } from './errors.js';

/**
 * Generate a unique receipt ID.
 * Uses timestamp + random suffix for uniqueness.
 */
function generateReceiptId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `rcpt_${timestamp}_${random}`;
}

/**
 * Derive order status from line items.
 */
function deriveOrderStatus(order: UcpOrder): 'completed' | 'partial' | 'processing' {
  const lineItems = order.line_items;

  if (lineItems.length === 0) {
    return 'processing';
  }

  const allFulfilled = lineItems.every((li) => li.status === 'fulfilled');
  const someFulfilled = lineItems.some(
    (li) => li.status === 'fulfilled' || li.status === 'partial'
  );

  if (allFulfilled) {
    return 'completed';
  }
  if (someFulfilled) {
    return 'partial';
  }
  return 'processing';
}

/**
 * Extract totals by type from UCP order.
 */
function extractTotals(order: UcpOrder): Record<string, MinorUnits> {
  const result: Record<string, MinorUnits> = {};

  for (const total of order.totals) {
    result[total.type] = total.amount;
  }

  return result;
}

/**
 * Validate UCP order has required fields.
 */
function validateOrder(order: UcpOrder): void {
  if (!order.id) {
    throw ucpError(ErrorCodes.ORDER_MISSING_ID, 'Order must have an id');
  }

  if (!order.line_items || !Array.isArray(order.line_items)) {
    throw ucpError(ErrorCodes.ORDER_MISSING_LINE_ITEMS, 'Order must have line_items array');
  }

  if (!order.totals || !Array.isArray(order.totals)) {
    throw ucpError(ErrorCodes.ORDER_MISSING_TOTALS, 'Order must have totals array');
  }

  // Find the total amount
  const totalEntry = order.totals.find((t) => t.type === 'total');
  if (!totalEntry) {
    throw ucpError(ErrorCodes.ORDER_MISSING_TOTALS, 'Order totals must include a "total" entry');
  }
}

/**
 * Map a UCP order to PEAC receipt claims.
 *
 * @param options - Mapping options
 * @returns PEAC receipt claims (ready for signing)
 *
 * @example
 * ```ts
 * const claims = mapUcpOrderToReceipt({
 *   order: ucpOrder,
 *   issuer: 'https://merchant.example.com',
 *   subject: 'agent:shopper-bot-123',
 *   currency: 'USD',
 * });
 *
 * // Sign with @peac/protocol
 * const receipt = await issue(claims, privateKey, kid);
 * ```
 */
export function mapUcpOrderToReceipt(options: MapUcpOrderOptions): MappedReceiptClaims {
  const { order, issuer, subject, currency, receipt_id, issued_at } = options;

  // Validate order
  validateOrder(order);

  // Get the total amount (in minor units)
  const totalEntry = order.totals.find((t) => t.type === 'total')!;
  const amount = totalEntry.amount;

  // Derive status
  const orderStatus = deriveOrderStatus(order);

  // Map to payment status
  const paymentStatus = orderStatus === 'processing' ? 'pending' : 'completed';

  // Extract all totals
  const totals = extractTotals(order);

  // Build receipt claims
  const claims: MappedReceiptClaims = {
    jti: receipt_id ?? generateReceiptId(),
    iss: issuer,
    sub: subject,
    iat: issued_at
      ? Math.floor(new Date(issued_at).getTime() / 1000)
      : Math.floor(Date.now() / 1000),
    payment: {
      rail: 'ucp',
      currency,
      amount,
      status: paymentStatus,
      evidence: {
        order_id: order.id,
        ...(order.checkout_id && { checkout_id: order.checkout_id }),
        line_items: order.line_items.length,
        totals,
      },
    },
    ext: {
      'dev.ucp/order_id': order.id,
      ...(order.checkout_id && { 'dev.ucp/checkout_id': order.checkout_id }),
      'dev.ucp/order_status': orderStatus,
      ...(order.permalink_url && { 'dev.ucp/permalink': order.permalink_url }),
    },
  };

  return claims;
}

/**
 * Extract line item summary for evidence.
 */
export function extractLineItemSummary(order: UcpOrder): Array<{
  id: string;
  title: string;
  quantity: number;
  price: MinorUnits;
  status: string;
}> {
  return order.line_items.map((li) => ({
    id: li.id,
    title: li.item.title,
    quantity: li.quantity.total,
    price: li.item.price,
    status: li.status,
  }));
}

/**
 * Calculate order summary statistics.
 */
export function calculateOrderStats(order: UcpOrder): {
  total_items: number;
  fulfilled_items: number;
  pending_items: number;
  total_quantity: number;
  fulfilled_quantity: number;
} {
  let totalItems = 0;
  let fulfilledItems = 0;
  let pendingItems = 0;
  let totalQuantity = 0;
  let fulfilledQuantity = 0;

  for (const li of order.line_items) {
    totalItems++;
    totalQuantity += li.quantity.total;
    fulfilledQuantity += li.quantity.fulfilled;

    if (li.status === 'fulfilled') {
      fulfilledItems++;
    } else {
      pendingItems++;
    }
  }

  return {
    total_items: totalItems,
    fulfilled_items: fulfilledItems,
    pending_items: pendingItems,
    total_quantity: totalQuantity,
    fulfilled_quantity: fulfilledQuantity,
  };
}
