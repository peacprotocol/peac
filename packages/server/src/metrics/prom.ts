import { Request, Response } from 'express';
import { storeManager } from '../config/stores';
import { config } from '../config';
import { logger } from '../logging';

export interface Counter {
  name: string;
  help: string;
  labels: Record<string, string>;
  value: number;
}

export interface Gauge {
  name: string;
  help: string;
  labels: Record<string, string>;
  value: number;
}

class PrometheusMetrics {
  private counters: Map<string, Counter> = new Map();
  private gauges: Map<string, Gauge> = new Map();
  private enabled: boolean;

  constructor() {
    this.enabled = config.gates.metricsEnabled || config.peac.metricsEnabled;
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    // Initialize core counters
    this.addCounter('http_requests_total', 'Total HTTP requests', {});
    this.addCounter('rate_limit_exceeded_total', 'Total rate limit violations', {});
    this.addCounter('idempotency_replay_total', 'Total idempotency replays', {});
    this.addCounter('payments_initiated_total', 'Total payments initiated', {});
    this.addCounter('payments_succeeded_total', 'Total payments succeeded', {});
    this.addCounter('payments_failed_total', 'Total payments failed', {});
    this.addCounter('webhook_valid_total', 'Total valid webhooks received', {});
    this.addCounter('webhook_invalid_total', 'Total invalid webhooks received', {});

    // Initialize core gauges
    this.addGauge('inflight_requests', 'Current inflight requests', {}, 0);
    this.addGauge('negotiations_open_total', 'Total open negotiations', {}, 0);
  }

  private addCounter(name: string, help: string, labels: Record<string, string>, value = 0): void {
    const key = this.createKey(name, labels);
    this.counters.set(key, { name, help, labels, value });
  }

  private addGauge(name: string, help: string, labels: Record<string, string>, value = 0): void {
    const key = this.createKey(name, labels);
    this.gauges.set(key, { name, help, labels, value });
  }

  private createKey(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels)
      .sort()
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${name}{${labelStr}}`;
  }

  incrementCounter(name: string, labels: Record<string, string> = {}, value = 1): void {
    if (!this.enabled) return;

    const key = this.createKey(name, labels);
    const existing = this.counters.get(key);

    if (existing) {
      existing.value += value;
    } else {
      this.addCounter(name, `Auto-generated counter for ${name}`, labels, value);
    }
  }

  setGauge(name: string, labels: Record<string, string> = {}, value: number): void {
    if (!this.enabled) return;

    const key = this.createKey(name, labels);
    const existing = this.gauges.get(key);

    if (existing) {
      existing.value = value;
    } else {
      this.addGauge(name, `Auto-generated gauge for ${name}`, labels, value);
    }
  }

  incrementGauge(name: string, labels: Record<string, string> = {}, delta = 1): void {
    if (!this.enabled) return;

    const key = this.createKey(name, labels);
    const existing = this.gauges.get(key);

    if (existing) {
      existing.value += delta;
    } else {
      this.addGauge(name, `Auto-generated gauge for ${name}`, labels, delta);
    }
  }

  async updateDynamicGauges(): Promise<void> {
    if (!this.enabled) return;

    try {
      // Update negotiations count by state
      const negotiationStore = storeManager.getNegotiationStore();

      // Get counts for each state
      const states = ['proposed', 'accepted', 'rejected'] as const;
      for (const state of states) {
        const result = await negotiationStore.list({ state, limit: 1 });
        // This is a simplified approach; in production you'd want a count method
        this.setGauge('negotiations_total', { state }, result.items.length);
      }

      // Count open (proposed) negotiations
      const openResult = await negotiationStore.list({ state: 'proposed', limit: 100 });
      this.setGauge('negotiations_open_total', {}, openResult.items.length);
    } catch (error) {
      logger.warn({ error }, 'Failed to update dynamic gauges');
    }
  }

  generatePrometheusText(): string {
    if (!this.enabled) {
      return '# Metrics disabled\n';
    }

    const lines: string[] = [];
    const processedMetrics = new Set<string>();

    // Generate counter metrics
    for (const counter of this.counters.values()) {
      if (!processedMetrics.has(counter.name)) {
        lines.push(`# HELP ${counter.name} ${counter.help}`);
        lines.push(`# TYPE ${counter.name} counter`);
        processedMetrics.add(counter.name);
      }

      const labelStr = Object.entries(counter.labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      const labels = labelStr ? `{${labelStr}}` : '';
      lines.push(`${counter.name}${labels} ${counter.value}`);
    }

    // Generate gauge metrics
    for (const gauge of this.gauges.values()) {
      if (!processedMetrics.has(gauge.name)) {
        lines.push(`# HELP ${gauge.name} ${gauge.help}`);
        lines.push(`# TYPE ${gauge.name} gauge`);
        processedMetrics.add(gauge.name);
      }

      const labelStr = Object.entries(gauge.labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      const labels = labelStr ? `{${labelStr}}` : '';
      lines.push(`${gauge.name}${labels} ${gauge.value}`);
    }

    return lines.join('\n') + '\n';
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getStats() {
    return {
      enabled: this.enabled,
      counters: this.counters.size,
      gauges: this.gauges.size,
    };
  }
}

export const prometheus = new PrometheusMetrics();

export async function handleMetrics(_req: Request, res: Response): Promise<void> {
  try {
    if (!prometheus.isEnabled()) {
      res.status(404).send('Metrics not enabled');
      return;
    }

    // Update dynamic gauges before generating output
    await prometheus.updateDynamicGauges();

    const metrics = prometheus.generatePrometheusText();

    res.set({
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });

    res.send(metrics);
  } catch (error) {
    logger.error({ error }, 'Failed to generate metrics');
    res.status(500).send('Internal server error');
  }
}
