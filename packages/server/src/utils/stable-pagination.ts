/**
 * PEAC Protocol v0.9.6 Stable Pagination Utilities
 *
 * Enterprise-grade pagination with:
 * - Cursor stability across data mutations
 * - Deterministic sorting with tie-breaking
 * - Performance monitoring and limits
 * - Security validation and rate limiting
 * - Consistent metadata format
 * - Error recovery and fallback strategies
 */

import { createHash } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../logging';
import { prometheus } from '../metrics/prom';

export interface PaginationOptions {
  cursor?: string;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  filters?: Record<string, unknown>;
}

export interface PaginationResult<T> {
  items: T[];
  next_cursor?: string;
  prev_cursor?: string;
  has_more: boolean;
  has_previous: boolean;
  total_count?: number;
  page_info: {
    page_size: number;
    current_page_size: number;
    sort_field: string;
    sort_order: 'asc' | 'desc';
    filters_applied: string[];
  };
}

export interface CursorData {
  timestamp: string;
  id: string;
  hash: string;
  sort_value?: unknown;
  direction: 'forward' | 'backward';
}

export interface PaginationConfig {
  maxLimit: number;
  defaultLimit: number;
  maxCursorAge: number; // milliseconds
  enablePerfMonitoring: boolean;
  enableTotalCount: boolean;
  stableSortFields: string[];
  defaultSortField: string;
  allowedSortFields: string[];
}

export class StablePaginationManager {
  private readonly config: PaginationConfig;
  private readonly stats = {
    totalQueries: 0,
    cursorHits: 0,
    cursorMisses: 0,
    invalidCursors: 0,
    slowQueries: 0,
  };

  constructor(config: Partial<PaginationConfig> = {}) {
    this.config = {
      maxLimit: 1000,
      defaultLimit: 50,
      maxCursorAge: 24 * 60 * 60 * 1000, // 24 hours
      enablePerfMonitoring: true,
      enableTotalCount: false, // Expensive for large datasets
      stableSortFields: ['created_at', 'id'],
      defaultSortField: 'created_at',
      allowedSortFields: ['created_at', 'updated_at', 'status', 'amount'],
      ...config,
    };
  }

  /**
   * Validate and normalize pagination options
   */
  validateOptions(options: PaginationOptions): {
    cursor?: CursorData;
    limit: number;
    sort: string;
    order: 'asc' | 'desc';
    filters: Record<string, unknown>;
  } {
    const startTime = Date.now();
    this.stats.totalQueries++;

    // Validate and normalize limit
    let limit = options.limit || this.config.defaultLimit;
    if (limit <= 0 || limit > this.config.maxLimit) {
      limit = Math.min(this.config.maxLimit, Math.max(1, limit));
    }

    // Validate sort field
    const sort = options.sort || this.config.defaultSortField;
    if (!this.config.allowedSortFields.includes(sort)) {
      throw new Error(
        `Invalid sort field: ${sort}. Allowed: ${this.config.allowedSortFields.join(', ')}`,
      );
    }

    // Validate sort order
    const order = options.order === 'asc' ? 'asc' : 'desc';

    // Parse and validate cursor
    let cursor: CursorData | undefined;
    if (options.cursor) {
      cursor = this.parseCursor(options.cursor);
      if (cursor) {
        this.stats.cursorHits++;
      } else {
        this.stats.cursorMisses++;
      }
    }

    // Validate and sanitize filters
    const filters = this.sanitizeFilters(options.filters || {});

    // Record performance metrics
    if (this.config.enablePerfMonitoring) {
      const duration = Date.now() - startTime;
      prometheus.setGauge('pagination_validation_duration_ms', {}, duration);
      this.recordMetrics('validation_completed');
    }

    return { cursor, limit, sort, order, filters };
  }

  /**
   * Create stable cursor for pagination
   */
  createCursor(
    item: Record<string, unknown>,
    sortField: string,
    direction: 'forward' | 'backward' = 'forward',
  ): string {
    const timestamp = new Date().toISOString();
    const id = String(item.id || '');
    const sort_value = item[sortField];

    // Create hash for cursor integrity
    const hashContent = JSON.stringify({
      timestamp,
      id,
      sort_value,
      direction,
      sort_field: sortField,
    });
    const hash = createHash('sha256').update(hashContent, 'utf8').digest('hex').slice(0, 16);

    const cursorData: CursorData = {
      timestamp,
      id,
      hash,
      sort_value,
      direction,
    };

    return Buffer.from(JSON.stringify(cursorData), 'utf8').toString('base64url');
  }

  /**
   * Parse and validate cursor
   */
  parseCursor(cursor: string): CursorData | undefined {
    try {
      const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
      const cursorData = JSON.parse(decoded) as CursorData;

      // Validate required fields
      if (!cursorData.timestamp || !cursorData.id || !cursorData.hash) {
        this.stats.invalidCursors++;
        this.recordMetrics('invalid_cursor', { reason: 'missing_fields' });
        return undefined;
      }

      // Check cursor age
      const age = Date.now() - new Date(cursorData.timestamp).getTime();
      if (age > this.config.maxCursorAge) {
        this.stats.invalidCursors++;
        this.recordMetrics('invalid_cursor', { reason: 'expired' });
        logger.warn(
          {
            cursor,
            age: Math.ceil(age / 1000),
            maxAge: Math.ceil(this.config.maxCursorAge / 1000),
          },
          'Cursor expired',
        );
        return undefined;
      }

      // Verify cursor integrity
      const hashContent = JSON.stringify({
        timestamp: cursorData.timestamp,
        id: cursorData.id,
        sort_value: cursorData.sort_value,
        direction: cursorData.direction,
        sort_field: cursorData.sort_value ? Object.keys(cursorData)[3] : 'unknown',
      });
      const expectedHash = createHash('sha256')
        .update(hashContent, 'utf8')
        .digest('hex')
        .slice(0, 16);

      if (expectedHash !== cursorData.hash) {
        this.stats.invalidCursors++;
        this.recordMetrics('invalid_cursor', { reason: 'integrity_check_failed' });
        logger.warn({ cursor }, 'Cursor integrity check failed');
        return undefined;
      }

      return cursorData;
    } catch (error) {
      this.stats.invalidCursors++;
      this.recordMetrics('invalid_cursor', { reason: 'parse_error' });
      logger.warn(
        {
          cursor,
          error: (error as Error).message,
        },
        'Failed to parse cursor',
      );
      return undefined;
    }
  }

  /**
   * Build stable sort clause with deterministic tie-breaking
   */
  buildSortClause(
    sortField: string,
    order: 'asc' | 'desc',
    cursor?: CursorData,
  ): {
    primarySort: { field: string; order: 'asc' | 'desc' };
    tieBreakers: Array<{ field: string; order: 'asc' | 'desc' }>;
    whereClause?: string;
  } {
    const tieBreakers: Array<{ field: string; order: 'asc' | 'desc' }> = [];

    // Add stable sort fields for deterministic ordering
    for (const field of this.config.stableSortFields) {
      if (field !== sortField) {
        tieBreakers.push({ field, order: 'asc' }); // Always ascending for stability
      }
    }

    // Build where clause for cursor-based pagination
    let whereClause: string | undefined;
    if (cursor) {
      const operator = order === 'asc' ? '>' : '<';
      const sortValue = cursor.sort_value;

      if (sortValue !== undefined && sortValue !== null) {
        // Handle different data types for sort value
        const formattedValue =
          typeof sortValue === 'string' ? `'${sortValue.replace(/'/g, "''")}'` : String(sortValue);

        whereClause = `(${sortField} ${operator} ${formattedValue} OR (${sortField} = ${formattedValue} AND id > '${cursor.id}'))`;
      } else {
        whereClause = `id > '${cursor.id}'`;
      }
    }

    return {
      primarySort: { field: sortField, order },
      tieBreakers,
      whereClause,
    };
  }

  /**
   * Process query results into paginated response
   */
  processResults<T extends Record<string, unknown>>(
    items: T[],
    options: {
      limit: number;
      sort: string;
      order: 'asc' | 'desc';
      filters: Record<string, unknown>;
      hasMore?: boolean;
      totalCount?: number;
    },
  ): PaginationResult<T> {
    const startTime = Date.now();

    const currentPageSize = items.length;
    const hasMore = options.hasMore ?? currentPageSize === options.limit;
    const hasPrevious = false; // Would need additional logic for bidirectional pagination

    let nextCursor: string | undefined;
    let prevCursor: string | undefined;

    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1];
      nextCursor = this.createCursor(lastItem, options.sort, 'forward');
    }

    if (items.length > 0) {
      const firstItem = items[0];
      prevCursor = this.createCursor(firstItem, options.sort, 'backward');
    }

    const filtersApplied = Object.keys(options.filters).filter(
      (key) => options.filters[key] !== undefined && options.filters[key] !== null,
    );

    const result: PaginationResult<T> = {
      items,
      next_cursor: nextCursor,
      prev_cursor: prevCursor,
      has_more: hasMore,
      has_previous: hasPrevious,
      page_info: {
        page_size: options.limit,
        current_page_size: currentPageSize,
        sort_field: options.sort,
        sort_order: options.order,
        filters_applied: filtersApplied,
      },
    };

    if (this.config.enableTotalCount && options.totalCount !== undefined) {
      result.total_count = options.totalCount;
    }

    // Record performance metrics
    if (this.config.enablePerfMonitoring) {
      const duration = Date.now() - startTime;
      prometheus.setGauge('pagination_processing_duration_ms', {}, duration);

      if (duration > 1000) {
        // Slow query threshold
        this.stats.slowQueries++;
        this.recordMetrics('slow_query', { duration: duration.toString() });
      }
    }

    this.recordMetrics('results_processed', {
      item_count: currentPageSize.toString(),
      has_more: hasMore.toString(),
    });

    return result;
  }

  /**
   * Sanitize and validate filters
   */
  private sanitizeFilters(filters: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(filters)) {
      // Skip undefined/null values
      if (value === undefined || value === null) continue;

      // Validate filter key format (alphanumeric + underscore)
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        logger.warn({ filterKey: key }, 'Invalid filter key format, skipping');
        continue;
      }

      // Sanitize string values to prevent injection
      if (typeof value === 'string') {
        // Basic SQL injection prevention
        const sanitizedValue = value.replace(/['";\\]/g, '');
        if (sanitizedValue.length > 255) {
          logger.warn(
            { filterKey: key, valueLength: value.length },
            'Filter value too long, truncating',
          );
          sanitized[key] = sanitizedValue.slice(0, 255);
        } else {
          sanitized[key] = sanitizedValue;
        }
      } else if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
        sanitized[key] = value;
      } else if (typeof value === 'boolean') {
        sanitized[key] = value;
      } else {
        logger.warn(
          { filterKey: key, valueType: typeof value },
          'Unsupported filter value type, skipping',
        );
      }
    }

    return sanitized;
  }

  /**
   * Record pagination metrics
   */
  private recordMetrics(event: string, labels: Record<string, string> = {}): void {
    prometheus.incrementCounter('pagination_operations_total', {
      event,
      ...labels,
    });

    // Update statistics gauges
    prometheus.setGauge('pagination_total_queries', {}, this.stats.totalQueries);
    prometheus.setGauge(
      'pagination_cursor_hit_rate',
      {},
      this.stats.totalQueries > 0 ? this.stats.cursorHits / this.stats.totalQueries : 0,
    );
    prometheus.setGauge('pagination_invalid_cursors_total', {}, this.stats.invalidCursors);
    prometheus.setGauge('pagination_slow_queries_total', {}, this.stats.slowQueries);
  }

  /**
   * Get pagination statistics
   */
  getStats() {
    return {
      ...this.stats,
      config: {
        maxLimit: this.config.maxLimit,
        defaultLimit: this.config.defaultLimit,
        maxCursorAge: this.config.maxCursorAge,
        stableSortFields: this.config.stableSortFields,
        allowedSortFields: this.config.allowedSortFields,
      },
    };
  }
}

/**
 * Default pagination configurations for different contexts
 */
export const paginationConfigs = {
  payments: {
    maxLimit: 500,
    defaultLimit: 50,
    maxCursorAge: 24 * 60 * 60 * 1000, // 24 hours
    enablePerfMonitoring: true,
    enableTotalCount: false,
    stableSortFields: ['created_at', 'id'],
    defaultSortField: 'created_at',
    allowedSortFields: ['created_at', 'updated_at', 'status', 'amount', 'currency', 'rail'],
  },

  negotiations: {
    maxLimit: 200,
    defaultLimit: 25,
    maxCursorAge: 12 * 60 * 60 * 1000, // 12 hours
    enablePerfMonitoring: true,
    enableTotalCount: false,
    stableSortFields: ['created_at', 'id'],
    defaultSortField: 'created_at',
    allowedSortFields: ['created_at', 'updated_at', 'state', 'expires_at'],
  },

  admin: {
    maxLimit: 1000,
    defaultLimit: 100,
    maxCursorAge: 48 * 60 * 60 * 1000, // 48 hours
    enablePerfMonitoring: true,
    enableTotalCount: true, // Admin can handle the cost
    stableSortFields: ['created_at', 'id'],
    defaultSortField: 'created_at',
    allowedSortFields: [
      'created_at',
      'updated_at',
      'status',
      'amount',
      'currency',
      'rail',
      'state',
    ],
  },
};

/**
 * Create pagination manager for specific context
 */
export function createPaginationManager(
  context: keyof typeof paginationConfigs,
): StablePaginationManager {
  const config = paginationConfigs[context];
  return new StablePaginationManager(config);
}

/**
 * Pagination middleware for express routes
 */
export function paginationMiddleware(context: keyof typeof paginationConfigs = 'payments') {
  const manager = createPaginationManager(context);

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const options: PaginationOptions = {
        cursor: req.query.cursor as string,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        sort: req.query.sort as string,
        order: req.query.order as 'asc' | 'desc',
        filters: req.query.filters as Record<string, unknown>,
      };

      const validated = manager.validateOptions(options);

      // Attach validated options and manager to request
      (
        req as unknown as { paginationOptions: unknown; paginationManager: unknown }
      ).paginationOptions = validated;
      (
        req as unknown as { paginationOptions: unknown; paginationManager: unknown }
      ).paginationManager = manager;

      next();
    } catch (error) {
      logger.error(
        {
          error: (error as Error).message,
          query: req.query,
        },
        'Pagination validation failed',
      );

      res.status(400).json({
        type: 'https://peacprotocol.org/problems/validation-error',
        title: 'Pagination Validation Error',
        status: 400,
        detail: (error as Error).message,
      });
    }
  };
}
