/**
 * @peac/mappings-ucp - Mapper tests
 */

import { describe, it, expect } from 'vitest';
import {
  mapUcpOrderToReceipt,
  extractLineItemSummary,
  calculateOrderStats,
} from '../src/mapper.js';
import type { UcpOrder } from '../src/types.js';

const createMockOrder = (overrides?: Partial<UcpOrder>): UcpOrder => ({
  id: 'order_abc123',
  checkout_id: 'checkout_xyz789',
  permalink_url: 'https://business.com/orders/abc123',
  line_items: [
    {
      id: 'li_shoes',
      item: { id: 'prod_shoes', title: 'Running Shoes', price: 3000 },
      quantity: { total: 3, fulfilled: 3 },
      status: 'fulfilled',
    },
    {
      id: 'li_shirts',
      item: { id: 'prod_shirts', title: 'Cotton T-Shirt', price: 2000 },
      quantity: { total: 2, fulfilled: 0 },
      status: 'processing',
    },
  ],
  totals: [
    { type: 'subtotal', amount: 13000 },
    { type: 'shipping', amount: 1200 },
    { type: 'tax', amount: 1142 },
    { type: 'total', amount: 15342 },
  ],
  ...overrides,
});

describe('mapUcpOrderToReceipt', () => {
  it('maps a UCP order to PEAC receipt claims', () => {
    const order = createMockOrder();
    const claims = mapUcpOrderToReceipt({
      order,
      issuer: 'https://platform.example.com',
      subject: 'buyer:123',
      currency: 'USD',
    });

    expect(claims.iss).toBe('https://platform.example.com');
    expect(claims.sub).toBe('buyer:123');
    expect(claims.jti).toMatch(/^rcpt_/);
    expect(claims.iat).toBeGreaterThan(0);

    // Payment claims
    expect(claims.payment.rail).toBe('ucp');
    expect(claims.payment.currency).toBe('USD');
    expect(claims.payment.amount).toBe(15342); // Minor units (cents)
    expect(claims.payment.status).toBe('completed'); // Some items fulfilled

    // Evidence
    expect(claims.payment.evidence.order_id).toBe('order_abc123');
    expect(claims.payment.evidence.checkout_id).toBe('checkout_xyz789');
    expect(claims.payment.evidence.line_items).toBe(2);
    expect(claims.payment.evidence.totals.total).toBe(15342);
    expect(claims.payment.evidence.totals.subtotal).toBe(13000);

    // Extensions
    expect(claims.ext['dev.ucp/order_id']).toBe('order_abc123');
    expect(claims.ext['dev.ucp/checkout_id']).toBe('checkout_xyz789');
    expect(claims.ext['dev.ucp/order_status']).toBe('partial'); // Mix of fulfilled/processing
    expect(claims.ext['dev.ucp/permalink']).toBe('https://business.com/orders/abc123');
  });

  it('uses custom receipt_id when provided', () => {
    const order = createMockOrder();
    const claims = mapUcpOrderToReceipt({
      order,
      issuer: 'https://platform.example.com',
      subject: 'buyer:123',
      currency: 'USD',
      receipt_id: 'custom_receipt_id',
    });

    expect(claims.jti).toBe('custom_receipt_id');
  });

  it('uses custom issued_at when provided', () => {
    const order = createMockOrder();
    const claims = mapUcpOrderToReceipt({
      order,
      issuer: 'https://platform.example.com',
      subject: 'buyer:123',
      currency: 'USD',
      issued_at: '2026-01-13T12:00:00Z',
    });

    expect(claims.iat).toBe(Math.floor(new Date('2026-01-13T12:00:00Z').getTime() / 1000));
  });

  it('handles fully fulfilled order', () => {
    const order = createMockOrder({
      line_items: [
        {
          id: 'li_shoes',
          item: { id: 'prod_shoes', title: 'Running Shoes', price: 3000 },
          quantity: { total: 1, fulfilled: 1 },
          status: 'fulfilled',
        },
      ],
    });

    const claims = mapUcpOrderToReceipt({
      order,
      issuer: 'https://platform.example.com',
      subject: 'buyer:123',
      currency: 'USD',
    });

    expect(claims.ext['dev.ucp/order_status']).toBe('completed');
    expect(claims.payment.status).toBe('completed');
  });

  it('handles processing-only order', () => {
    const order = createMockOrder({
      line_items: [
        {
          id: 'li_shoes',
          item: { id: 'prod_shoes', title: 'Running Shoes', price: 3000 },
          quantity: { total: 1, fulfilled: 0 },
          status: 'processing',
        },
      ],
    });

    const claims = mapUcpOrderToReceipt({
      order,
      issuer: 'https://platform.example.com',
      subject: 'buyer:123',
      currency: 'USD',
    });

    expect(claims.ext['dev.ucp/order_status']).toBe('processing');
    expect(claims.payment.status).toBe('pending');
  });

  it('omits optional fields when not present', () => {
    const order: UcpOrder = {
      id: 'order_abc123',
      line_items: [
        {
          id: 'li_shoes',
          item: { id: 'prod_shoes', title: 'Running Shoes', price: 3000 },
          quantity: { total: 1, fulfilled: 1 },
          status: 'fulfilled',
        },
      ],
      totals: [{ type: 'total', amount: 3000 }],
    };

    const claims = mapUcpOrderToReceipt({
      order,
      issuer: 'https://platform.example.com',
      subject: 'buyer:123',
      currency: 'USD',
    });

    expect(claims.payment.evidence.checkout_id).toBeUndefined();
    expect(claims.ext['dev.ucp/checkout_id']).toBeUndefined();
    expect(claims.ext['dev.ucp/permalink']).toBeUndefined();
  });

  it('throws on missing order id', () => {
    const order = createMockOrder({ id: '' });

    expect(() =>
      mapUcpOrderToReceipt({
        order,
        issuer: 'https://platform.example.com',
        subject: 'buyer:123',
        currency: 'USD',
      })
    ).toThrow();
  });

  it('throws on missing line_items', () => {
    const order = createMockOrder({ line_items: undefined as unknown as [] });

    expect(() =>
      mapUcpOrderToReceipt({
        order,
        issuer: 'https://platform.example.com',
        subject: 'buyer:123',
        currency: 'USD',
      })
    ).toThrow();
  });

  it('throws on missing totals', () => {
    const order = createMockOrder({ totals: undefined as unknown as [] });

    expect(() =>
      mapUcpOrderToReceipt({
        order,
        issuer: 'https://platform.example.com',
        subject: 'buyer:123',
        currency: 'USD',
      })
    ).toThrow();
  });

  it('throws when totals has no total entry', () => {
    const order = createMockOrder({
      totals: [{ type: 'subtotal', amount: 3000 }],
    });

    expect(() =>
      mapUcpOrderToReceipt({
        order,
        issuer: 'https://platform.example.com',
        subject: 'buyer:123',
        currency: 'USD',
      })
    ).toThrow();
  });
});

describe('extractLineItemSummary', () => {
  it('extracts line item summary', () => {
    const order = createMockOrder();
    const summary = extractLineItemSummary(order);

    expect(summary).toHaveLength(2);
    expect(summary[0]).toEqual({
      id: 'li_shoes',
      title: 'Running Shoes',
      quantity: 3,
      price: 3000,
      status: 'fulfilled',
    });
    expect(summary[1]).toEqual({
      id: 'li_shirts',
      title: 'Cotton T-Shirt',
      quantity: 2,
      price: 2000,
      status: 'processing',
    });
  });
});

describe('calculateOrderStats', () => {
  it('calculates order statistics', () => {
    const order = createMockOrder();
    const stats = calculateOrderStats(order);

    expect(stats.total_items).toBe(2);
    expect(stats.fulfilled_items).toBe(1);
    expect(stats.pending_items).toBe(1);
    expect(stats.total_quantity).toBe(5); // 3 + 2
    expect(stats.fulfilled_quantity).toBe(3);
  });

  it('handles empty order', () => {
    const order = createMockOrder({ line_items: [] });
    const stats = calculateOrderStats(order);

    expect(stats.total_items).toBe(0);
    expect(stats.fulfilled_items).toBe(0);
    expect(stats.pending_items).toBe(0);
    expect(stats.total_quantity).toBe(0);
    expect(stats.fulfilled_quantity).toBe(0);
  });
});
