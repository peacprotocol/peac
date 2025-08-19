/**
 * PEAC Protocol v0.9.6 SLO HTTP API
 *
 * REST API for SLO monitoring and reporting with:
 * - SLO status endpoints
 * - Compliance reporting
 * - Error budget monitoring
 * - Alert configuration
 */

import { Router, Request, Response } from 'express';
import { logger } from '../logging';
import { problemDetails } from '../http/problems';
import { rateLimitMiddleware } from '../middleware/rateLimit';
import { SLOManager } from './manager';
import { slos, slis, alertRules } from './definitions';

export function createSLORouter(sloManager: SLOManager): Router {
  const router = Router();

  // GET /slo/status - Get all SLO statuses
  router.get('/status', rateLimitMiddleware('standard'), async (_req: Request, res: Response) => {
    try {
      const statuses = sloManager.getSLOStatuses();
      const statusArray = Array.from(statuses.values());

      res.json({
        timestamp: new Date().toISOString(),
        slo_count: statusArray.length,
        statuses: statusArray,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get SLO statuses');
      problemDetails.send(res, 'internal_error', {
        detail: 'Failed to retrieve SLO statuses',
      });
    }
  });

  // GET /slo/status/:name - Get specific SLO status
  router.get(
    '/status/:name',
    rateLimitMiddleware('standard'),
    async (_req: Request, res: Response) => {
      try {
        const sloName = _req.params.name;
        const status = sloManager.getSLOStatus(sloName);

        if (!status) {
          return problemDetails.send(res, 'resource_not_found', {
            detail: `SLO '${sloName}' not found`,
          });
        }

        res.json({
          timestamp: new Date().toISOString(),
          status,
        });
      } catch (error) {
        logger.error({ error, sloName: _req.params.name }, 'Failed to get SLO status');
        problemDetails.send(res, 'internal_error', {
          detail: 'Failed to retrieve SLO status',
        });
      }
    },
  );

  // GET /slo/compliance - Get compliance summary
  router.get(
    '/compliance',
    rateLimitMiddleware('standard'),
    async (_req: Request, res: Response) => {
      try {
        const summary = sloManager.getComplianceSummary();

        res.json({
          timestamp: new Date().toISOString(),
          compliance_summary: summary,
          details: {
            overall_health:
              summary.overallCompliance >= 0.95
                ? 'healthy'
                : summary.overallCompliance >= 0.9
                  ? 'degraded'
                  : 'unhealthy',
            critical_slos_status: summary.criticalImpact > 0 ? 'monitored' : 'none',
            high_impact_slos_status: summary.highImpact > 0 ? 'monitored' : 'none',
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get compliance summary');
        problemDetails.send(res, 'internal_error', {
          detail: 'Failed to retrieve compliance summary',
        });
      }
    },
  );

  // GET /slo/report - Generate detailed compliance report
  router.get('/report', rateLimitMiddleware('standard'), async (_req: Request, res: Response) => {
    try {
      const report = sloManager.generateComplianceReport();

      // Add additional context
      const enhancedReport = {
        ...report,
        metadata: {
          report_version: '1.0',
          peac_version: '0.9.6',
          environment: process.env.NODE_ENV || 'development',
          generated_by: 'peac-slo-manager',
        },
        recommendations: generateRecommendations(report),
      };

      res.json(enhancedReport);
    } catch (error) {
      logger.error({ error }, 'Failed to generate compliance report');
      problemDetails.send(res, 'internal_error', {
        detail: 'Failed to generate compliance report',
      });
    }
  });

  // GET /slo/definitions - Get SLO definitions
  router.get(
    '/definitions',
    rateLimitMiddleware('standard'),
    async (_req: Request, res: Response) => {
      try {
        res.json({
          timestamp: new Date().toISOString(),
          slos: Object.entries(slos).map(([key, slo]) => ({
            key,
            ...slo,
          })),
          slis: Object.entries(slis).map(([key, sli]) => ({
            key,
            ...sli,
          })),
          alert_rules: alertRules.map((rule) => ({
            ...rule,
            id: `${rule.name.toLowerCase().replace(/\s+/g, '-')}`,
          })),
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get SLO definitions');
        problemDetails.send(res, 'internal_error', {
          detail: 'Failed to retrieve SLO definitions',
        });
      }
    },
  );

  // GET /slo/error-budget - Get error budget status
  router.get(
    '/error-budget',
    rateLimitMiddleware('standard'),
    async (_req: Request, res: Response) => {
      try {
        const statuses = sloManager.getSLOStatuses();
        const errorBudgets = Array.from(statuses.values()).map((status) => ({
          slo_name: status.name,
          error_budget_remaining: status.errorBudgetRemaining,
          error_budget_remaining_percent: Math.round(status.errorBudgetRemaining * 100),
          burn_rate: status.burnRate,
          window: status.window,
          business_impact: status.businessImpact,
          status:
            status.errorBudgetRemaining > 0.25
              ? 'healthy'
              : status.errorBudgetRemaining > 0.1
                ? 'warning'
                : 'critical',
          last_evaluated: status.lastEvaluated,
        }));

        // Sort by most critical first
        errorBudgets.sort((a, b) => a.error_budget_remaining - b.error_budget_remaining);

        res.json({
          timestamp: new Date().toISOString(),
          error_budgets: errorBudgets,
          summary: {
            total_slos: errorBudgets.length,
            healthy: errorBudgets.filter((b) => b.status === 'healthy').length,
            warning: errorBudgets.filter((b) => b.status === 'warning').length,
            critical: errorBudgets.filter((b) => b.status === 'critical').length,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get error budget status');
        problemDetails.send(res, 'internal_error', {
          detail: 'Failed to retrieve error budget status',
        });
      }
    },
  );

  // GET /slo/alerts/rules - Get alert rule configuration
  router.get(
    '/alerts/rules',
    rateLimitMiddleware('standard'),
    async (_req: Request, res: Response) => {
      try {
        const format = _req.query.format as string;

        if (format === 'prometheus') {
          // Return Prometheus alert rules format
          const prometheusRules = {
            groups: [
              {
                name: 'peac-slo-alerts',
                rules: alertRules.map((rule) => ({
                  alert: rule.name,
                  expr: rule.expr.trim(),
                  for: rule.for,
                  labels: rule.labels,
                  annotations: rule.annotations,
                })),
              },
            ],
          };

          res.set('Content-Type', 'application/yaml');
          res.send(
            `# PEAC Protocol SLO Alert Rules\n# Generated: ${new Date().toISOString()}\n\n${JSON.stringify(prometheusRules, null, 2)}`,
          );
        } else {
          // Return JSON format
          res.json({
            timestamp: new Date().toISOString(),
            alert_rules: alertRules,
            rule_count: alertRules.length,
            severity_breakdown: {
              critical: alertRules.filter((r) => r.severity === 'critical').length,
              warning: alertRules.filter((r) => r.severity === 'warning').length,
              info: alertRules.filter((r) => r.severity === 'info').length,
            },
          });
        }
      } catch (error) {
        logger.error({ error }, 'Failed to get alert rules');
        problemDetails.send(res, 'internal_error', {
          detail: 'Failed to retrieve alert rules',
        });
      }
    },
  );

  // GET /slo/health - SLO system health check
  router.get('/health', rateLimitMiddleware('standard'), async (_req: Request, res: Response) => {
    try {
      const summary = sloManager.getComplianceSummary();
      const isHealthy = summary.overallCompliance >= 0.95;

      const health = {
        status: isHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        slo_manager: {
          running: true, // In real implementation, check if manager is actually running
          total_slos: summary.total,
          compliant_slos: summary.compliant,
          overall_compliance: summary.overallCompliance,
        },
        alerts: {
          critical_count: 0, // Would be populated from alert manager in production
          warning_count: 0,
          info_count: 0,
        },
      };

      const statusCode = isHealthy ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error) {
      logger.error({ error }, 'Failed SLO health check');
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'SLO system error',
      });
    }
  });

  return router;
}

/**
 * Generate recommendations based on compliance report
 */
function generateRecommendations(
  report: ReturnType<typeof SLOManager.prototype.generateComplianceReport>,
): Array<{
  type: 'action' | 'investigation' | 'optimization';
  priority: 'high' | 'medium' | 'low';
  description: string;
  slo?: string;
}> {
  const recommendations: Array<{
    type: 'action' | 'investigation' | 'optimization';
    priority: 'high' | 'medium' | 'low';
    description: string;
    slo?: string;
  }> = [];

  // Check for critical SLO violations
  const criticalViolations = report.details.filter(
    (s) => !s.compliance && s.businessImpact === 'critical',
  );

  for (const violation of criticalViolations) {
    recommendations.push({
      type: 'action',
      priority: 'high',
      description: `Immediate action required: Critical SLO '${violation.name}' is not meeting target (${(violation.current * 100).toFixed(2)}% vs ${(violation.target * 100).toFixed(2)}%)`,
      slo: violation.name,
    });
  }

  // Check for low error budgets
  const lowBudgetSLOs = report.details.filter((s) => s.errorBudgetRemaining < 0.25);
  for (const slo of lowBudgetSLOs) {
    recommendations.push({
      type: 'investigation',
      priority: 'medium',
      description: `Error budget running low for '${slo.name}' (${(slo.errorBudgetRemaining * 100).toFixed(1)}% remaining)`,
      slo: slo.name,
    });
  }

  // Overall compliance recommendations
  if (report.summary.overallCompliance < 0.9) {
    recommendations.push({
      type: 'action',
      priority: 'high',
      description: `Overall SLO compliance is below 90% (${(report.summary.overallCompliance * 100).toFixed(1)}%). Review service reliability and consider emergency response.`,
    });
  } else if (report.summary.overallCompliance < 0.95) {
    recommendations.push({
      type: 'investigation',
      priority: 'medium',
      description: `Overall SLO compliance is below 95% (${(report.summary.overallCompliance * 100).toFixed(1)}%). Monitor trends and investigate root causes.`,
    });
  }

  // High performing SLOs - optimization opportunities
  const highPerformingSLOs = report.details.filter(
    (s) => s.compliance && s.errorBudgetRemaining > 0.8,
  );

  if (highPerformingSLOs.length > 0) {
    recommendations.push({
      type: 'optimization',
      priority: 'low',
      description: `${highPerformingSLOs.length} SLOs are performing well above target. Consider tightening objectives or investing error budget in feature development.`,
    });
  }

  return recommendations;
}
