/**
 * PEAC Protocol v0.9.6 SLO Module
 *
 * Enterprise SLO system with comprehensive monitoring and alerting
 */

export { SLOManager, createSLOManager } from './manager';
export { createSLORouter } from './http';
export { slis, slos, alertRules, dashboardConfig } from './definitions';
export type { SLI, SLO, AlertRule } from './definitions';
export type { SLOStatus, ErrorBudgetAlert, BurnRateAlert } from './manager';
export type { SLOManager as SLOManagerType } from './manager';
