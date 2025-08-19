/**
 * PEAC Protocol v0.9.6 SLO Manager
 *
 * Enterprise SLO management system with:
 * - SLO compliance monitoring
 * - Error budget tracking and alerts
 * - Burn rate calculations
 * - Multi-window alerting
 * - Automated compliance reporting
 */

import { EventEmitter } from 'events';
import { logger } from '../logging';
import { prometheus } from '../metrics/prom';
import { slis, slos, type SLO, type SLI } from './definitions';

export interface SLOStatus {
  name: string;
  current: number;
  target: number;
  compliance: boolean;
  errorBudgetRemaining: number; // 0-1 (0% to 100%)
  burnRate: number;
  window: string;
  businessImpact: string;
  lastEvaluated: Date;
}

export interface ErrorBudgetAlert {
  sloName: string;
  remainingBudget: number; // percentage
  burnRate: number;
  window: string;
  severity: 'critical' | 'warning' | 'info';
  timestamp: Date;
}

export interface BurnRateAlert {
  sloName: string;
  currentBurnRate: number;
  thresholdBurnRate: number;
  window: string;
  severity: 'critical' | 'warning' | 'info';
  timestamp: Date;
}

export class SLOManager extends EventEmitter {
  private sloStatuses: Map<string, SLOStatus> = new Map();
  private monitoringInterval?: NodeJS.Timeout;
  private readonly evaluationIntervalMs: number;
  private readonly enabledSLOs: Set<string>;

  constructor(
    evaluationIntervalMs: number = 60000, // 1 minute default
    enabledSLOs?: string[],
  ) {
    super();
    this.evaluationIntervalMs = evaluationIntervalMs;
    this.enabledSLOs = new Set(enabledSLOs || Object.keys(slos));
    this.setupMetrics();
  }

  /**
   * Start SLO monitoring
   */
  start(): void {
    if (this.monitoringInterval) {
      logger.warn('SLO monitoring already started');
      return;
    }

    logger.info(
      {
        interval: this.evaluationIntervalMs,
        enabledSLOs: Array.from(this.enabledSLOs),
      },
      'Starting SLO monitoring',
    );

    // Initial evaluation
    this.evaluateAllSLOs().catch((error) => {
      logger.error({ error }, 'Failed initial SLO evaluation');
    });

    // Set up periodic evaluation
    this.monitoringInterval = setInterval(() => {
      this.evaluateAllSLOs().catch((error) => {
        logger.error({ error }, 'Failed periodic SLO evaluation');
      });
    }, this.evaluationIntervalMs);

    this.emit('monitoring-started');
  }

  /**
   * Stop SLO monitoring
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      logger.info('SLO monitoring stopped');
      this.emit('monitoring-stopped');
    }
  }

  /**
   * Evaluate all enabled SLOs
   */
  private async evaluateAllSLOs(): Promise<void> {
    const evaluationStart = Date.now();
    const evaluationPromises: Promise<void>[] = [];

    for (const sloName of this.enabledSLOs) {
      const slo = slos[sloName];
      if (slo) {
        evaluationPromises.push(this.evaluateSLO(sloName, slo));
      }
    }

    await Promise.allSettled(evaluationPromises);

    const evaluationDuration = Date.now() - evaluationStart;
    prometheus.setGauge('slo_evaluation_duration_ms', {}, evaluationDuration);
    prometheus.setGauge('slo_evaluation_count', {}, this.enabledSLOs.size);

    logger.debug(
      {
        duration: evaluationDuration,
        sloCount: this.enabledSLOs.size,
      },
      'SLO evaluation cycle completed',
    );
  }

  /**
   * Evaluate individual SLO
   */
  private async evaluateSLO(name: string, slo: SLO): Promise<void> {
    try {
      const sli = slis[slo.sli];
      if (!sli) {
        logger.error({ sloName: name, sliName: slo.sli }, 'SLI not found for SLO');
        return;
      }

      // Get current SLI value (simulated - in real implementation would query Prometheus)
      const currentValue = await this.getSLIValue(sli);

      // Calculate compliance and error budget
      const isLatencyObjective = sli.unit === 'milliseconds';
      const compliance = isLatencyObjective
        ? currentValue <= slo.objective
        : currentValue >= slo.objective;

      const errorBudget = this.calculateErrorBudget(slo, currentValue);
      const burnRate = this.calculateBurnRate(slo, currentValue);

      const status: SLOStatus = {
        name,
        current: currentValue,
        target: slo.objective,
        compliance,
        errorBudgetRemaining: errorBudget,
        burnRate,
        window: slo.window,
        businessImpact: slo.businessImpact,
        lastEvaluated: new Date(),
      };

      this.sloStatuses.set(name, status);

      // Update Prometheus metrics
      prometheus.setGauge(
        'slo_compliance',
        {
          slo_name: name,
          service: slo.service,
        },
        compliance ? 1 : 0,
      );

      prometheus.setGauge(
        'slo_current_value',
        {
          slo_name: name,
          service: slo.service,
        },
        currentValue,
      );

      prometheus.setGauge(
        'slo_target_value',
        {
          slo_name: name,
          service: slo.service,
        },
        slo.objective,
      );

      prometheus.setGauge(
        'slo_error_budget_remaining',
        {
          slo_name: name,
          service: slo.service,
        },
        errorBudget,
      );

      prometheus.setGauge(
        'slo_burn_rate',
        {
          slo_name: name,
          service: slo.service,
        },
        burnRate,
      );

      // Check for alerts
      await this.checkAlerts(name, slo, status);

      logger.debug(
        {
          slo: name,
          current: currentValue,
          target: slo.objective,
          compliance,
          errorBudget: Math.round(errorBudget * 100),
          burnRate: burnRate.toFixed(2),
        },
        'SLO evaluated',
      );
    } catch (error) {
      logger.error(
        {
          slo: name,
          error: (error as Error).message,
        },
        'Failed to evaluate SLO',
      );

      prometheus.incrementCounter('slo_evaluation_errors_total', {
        slo_name: name,
      });
    }
  }

  /**
   * Get SLI value (simulated - in real implementation would query Prometheus)
   */
  private async getSLIValue(sli: SLI): Promise<number> {
    // Simulate SLI values for demonstration
    // In production, this would execute the Prometheus query

    switch (sli.name) {
      case 'peac_availability':
        return 0.9995 + (Math.random() - 0.5) * 0.001; // Around 99.95%

      case 'peac_latency_p95':
        return 300 + Math.random() * 400; // 300-700ms

      case 'peac_latency_p99':
        return 800 + Math.random() * 500; // 800-1300ms

      case 'peac_payment_success_rate':
        return 0.997 + (Math.random() - 0.5) * 0.005; // Around 99.7%

      case 'peac_payment_latency':
        return 1500 + Math.random() * 1000; // 1.5-2.5s

      case 'peac_negotiation_acceptance_rate':
        return 0.75 + Math.random() * 0.2; // 75-95%

      case 'peac_webhook_delivery_success':
        return 0.995 + (Math.random() - 0.5) * 0.01; // Around 99.5%

      case 'peac_error_rate':
        return Math.random() * 0.05; // 0-5% error rate

      case 'peac_circuit_breaker_health':
        return 0.95 + Math.random() * 0.05; // 95-100% healthy

      default:
        return Math.random();
    }
  }

  /**
   * Calculate error budget remaining (0-1)
   */
  private calculateErrorBudget(slo: SLO, currentValue: number): number {
    const isLatencyObjective = slos[slo.name] && slis[slo.sli]?.unit === 'milliseconds';

    if (isLatencyObjective) {
      // For latency objectives, budget depletes as latency increases above target
      if (currentValue <= slo.objective) {
        return 1.0; // No budget consumed
      }

      // Simple linear model - in production would use more sophisticated calculation
      const overage = currentValue - slo.objective;
      const maxOverage = slo.objective; // 100% overage = 0% budget
      return Math.max(0, 1 - overage / maxOverage);
    } else {
      // For availability/success rate objectives
      if (currentValue >= slo.objective) {
        return 1.0; // No budget consumed
      }

      const deficit = slo.objective - currentValue;
      const maxDeficit = slo.objective; // Complete failure = 0% budget
      return Math.max(0, 1 - deficit / maxDeficit);
    }
  }

  /**
   * Calculate burn rate
   */
  private calculateBurnRate(slo: SLO, currentValue: number): number {
    const isLatencyObjective = slis[slo.sli]?.unit === 'milliseconds';

    if (isLatencyObjective) {
      // Burn rate based on how much we exceed the objective
      if (currentValue <= slo.objective) return 0;
      return (currentValue - slo.objective) / slo.objective;
    } else {
      // Burn rate based on error rate vs allowed error rate
      const allowedErrorRate = 1 - slo.objective;
      const actualErrorRate = 1 - currentValue;

      if (actualErrorRate <= allowedErrorRate) return 0;
      return actualErrorRate / allowedErrorRate;
    }
  }

  /**
   * Check for SLO alerts
   */
  private async checkAlerts(name: string, slo: SLO, status: SLOStatus): Promise<void> {
    // Check error budget alerts
    for (const budgetAlert of slo.alerting.errorBudgetRemaining) {
      if (status.errorBudgetRemaining * 100 < budgetAlert.threshold) {
        const alert: ErrorBudgetAlert = {
          sloName: name,
          remainingBudget: status.errorBudgetRemaining * 100,
          burnRate: status.burnRate,
          window: slo.window,
          severity: budgetAlert.severity,
          timestamp: new Date(),
        };

        this.emit('error-budget-alert', alert);

        prometheus.incrementCounter('slo_error_budget_alerts_total', {
          slo_name: name,
          severity: budgetAlert.severity,
        });

        logger.warn(
          {
            alert,
            slo: name,
          },
          'SLO error budget alert triggered',
        );
      }
    }

    // Check burn rate alerts
    for (const burnRateAlert of slo.alerting.burnRateWindows) {
      if (status.burnRate > burnRateAlert.burnRate) {
        const alert: BurnRateAlert = {
          sloName: name,
          currentBurnRate: status.burnRate,
          thresholdBurnRate: burnRateAlert.burnRate,
          window: burnRateAlert.window,
          severity: burnRateAlert.severity,
          timestamp: new Date(),
        };

        this.emit('burn-rate-alert', alert);

        prometheus.incrementCounter('slo_burn_rate_alerts_total', {
          slo_name: name,
          severity: burnRateAlert.severity,
          window: burnRateAlert.window,
        });

        logger.warn(
          {
            alert,
            slo: name,
          },
          'SLO burn rate alert triggered',
        );
      }
    }
  }

  /**
   * Get all SLO statuses
   */
  getSLOStatuses(): Map<string, SLOStatus> {
    return new Map(this.sloStatuses);
  }

  /**
   * Get specific SLO status
   */
  getSLOStatus(name: string): SLOStatus | undefined {
    return this.sloStatuses.get(name);
  }

  /**
   * Get compliance summary
   */
  getComplianceSummary(): {
    total: number;
    compliant: number;
    nonCompliant: number;
    criticalImpact: number;
    highImpact: number;
    overallCompliance: number;
  } {
    const statuses = Array.from(this.sloStatuses.values());
    const compliant = statuses.filter((s) => s.compliance);
    const criticalImpact = statuses.filter((s) => s.businessImpact === 'critical');
    const highImpact = statuses.filter((s) => s.businessImpact === 'high');

    return {
      total: statuses.length,
      compliant: compliant.length,
      nonCompliant: statuses.length - compliant.length,
      criticalImpact: criticalImpact.length,
      highImpact: highImpact.length,
      overallCompliance: statuses.length > 0 ? compliant.length / statuses.length : 1,
    };
  }

  /**
   * Generate compliance report
   */
  generateComplianceReport(): {
    timestamp: Date;
    summary: ReturnType<SLOManager['getComplianceSummary']>;
    details: SLOStatus[];
    alerts: Array<{
      type: 'error-budget' | 'burn-rate';
      slo: string;
      severity: string;
      description: string;
    }>;
  } {
    const summary = this.getComplianceSummary();
    const details = Array.from(this.sloStatuses.values());

    // Generate alert summary (simplified for demo)
    const alerts = details
      .filter((status) => !status.compliance || status.errorBudgetRemaining < 0.25)
      .map((status) => ({
        type: !status.compliance ? ('burn-rate' as const) : ('error-budget' as const),
        slo: status.name,
        severity: status.businessImpact === 'critical' ? 'critical' : 'warning',
        description: !status.compliance
          ? `SLO not meeting target (${(status.current * 100).toFixed(2)}% vs ${(status.target * 100).toFixed(2)}%)`
          : `Error budget low (${(status.errorBudgetRemaining * 100).toFixed(1)}% remaining)`,
      }));

    return {
      timestamp: new Date(),
      summary,
      details,
      alerts,
    };
  }

  /**
   * Setup Prometheus metrics for SLO monitoring
   */
  private setupMetrics(): void {
    // These metrics are created automatically when first used
    logger.debug('SLO Manager metrics configured');
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stop();
    this.removeAllListeners();
    this.sloStatuses.clear();
  }
}

/**
 * Create SLO manager with environment-specific configuration
 */
export function createSLOManager(
  environment: string = process.env.NODE_ENV || 'development',
): SLOManager {
  const configs = {
    production: {
      evaluationInterval: 30000, // 30 seconds
      enabledSLOs: Object.keys(slos), // All SLOs
    },
    staging: {
      evaluationInterval: 60000, // 1 minute
      enabledSLOs: Object.keys(slos).filter(
        (name) => slos[name].businessImpact === 'critical' || slos[name].businessImpact === 'high',
      ),
    },
    development: {
      evaluationInterval: 300000, // 5 minutes
      enabledSLOs: ['availability_monthly', 'payment_success_monthly'], // Limited set
    },
  };

  const config = configs[environment as keyof typeof configs] || configs.development;

  return new SLOManager(config.evaluationInterval, config.enabledSLOs);
}
