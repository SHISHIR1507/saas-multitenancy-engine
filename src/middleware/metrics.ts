/**
 * Metrics Collection System
 * 
 * Tracks request volume, error rates, and response times for monitoring.
 * Metrics are stored in-memory and can be exposed via an endpoint.
 */

export interface MetricData {
  requestCount: number;
  errorCount: number;
  responseTimes: number[]; // Store last N response times for percentile calculations
  lastReset: Date;
}

export interface TenantMetrics {
  [tenantId: string]: MetricData;
}

export interface AggregatedMetrics {
  totalRequests: number;
  totalErrors: number;
  errorRate: number; // Percentage
  avgResponseTime: number; // Milliseconds
  p50ResponseTime: number; // Median
  p95ResponseTime: number; // 95th percentile
  p99ResponseTime: number; // 99th percentile
}

// In-memory metrics storage
// In production, this could be replaced with a time-series database or metrics service
const metrics: TenantMetrics = {};

// Maximum number of response times to keep per tenant (for percentile calculations)
const MAX_RESPONSE_TIMES = 1000;

/**
 * Initialize metrics for a tenant if not already initialized
 */
function initializeTenantMetrics(tenantId: string): void {
  if (!metrics[tenantId]) {
    metrics[tenantId] = {
      requestCount: 0,
      errorCount: 0,
      responseTimes: [],
      lastReset: new Date(),
    };
  }
}

/**
 * Record a request for metrics tracking
 */
export function recordRequest(tenantId: string, responseTimeMs: number, isError: boolean = false): void {
  initializeTenantMetrics(tenantId);
  
  const tenantMetrics = metrics[tenantId];
  tenantMetrics.requestCount++;
  
  if (isError) {
    tenantMetrics.errorCount++;
  }
  
  // Add response time, keeping only the last MAX_RESPONSE_TIMES
  tenantMetrics.responseTimes.push(responseTimeMs);
  if (tenantMetrics.responseTimes.length > MAX_RESPONSE_TIMES) {
    tenantMetrics.responseTimes.shift(); // Remove oldest
  }
}

/**
 * Calculate percentile from sorted array
 */
function calculatePercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) return 0;
  
  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, index)];
}

/**
 * Get aggregated metrics for a tenant
 */
export function getTenantMetrics(tenantId: string): AggregatedMetrics {
  initializeTenantMetrics(tenantId);
  
  const tenantMetrics = metrics[tenantId];
  const { requestCount, errorCount, responseTimes } = tenantMetrics;
  
  // Calculate error rate
  const errorRate = requestCount > 0 ? (errorCount / requestCount) * 100 : 0;
  
  // Calculate response time statistics
  const avgResponseTime = responseTimes.length > 0
    ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
    : 0;
  
  // Sort for percentile calculations
  const sortedTimes = [...responseTimes].sort((a, b) => a - b);
  const p50ResponseTime = calculatePercentile(sortedTimes, 50);
  const p95ResponseTime = calculatePercentile(sortedTimes, 95);
  const p99ResponseTime = calculatePercentile(sortedTimes, 99);
  
  return {
    totalRequests: requestCount,
    totalErrors: errorCount,
    errorRate: Math.round(errorRate * 100) / 100, // Round to 2 decimal places
    avgResponseTime: Math.round(avgResponseTime * 100) / 100,
    p50ResponseTime,
    p95ResponseTime,
    p99ResponseTime,
  };
}

/**
 * Get metrics for all tenants
 */
export function getAllMetrics(): Record<string, AggregatedMetrics> {
  const allMetrics: Record<string, AggregatedMetrics> = {};
  
  for (const tenantId in metrics) {
    allMetrics[tenantId] = getTenantMetrics(tenantId);
  }
  
  return allMetrics;
}

/**
 * Reset metrics for a tenant
 */
export function resetTenantMetrics(tenantId: string): void {
  metrics[tenantId] = {
    requestCount: 0,
    errorCount: 0,
    responseTimes: [],
    lastReset: new Date(),
  };
}

/**
 * Reset all metrics
 */
export function resetAllMetrics(): void {
  // Clear all keys from the metrics object
  for (const tenantId in metrics) {
    delete metrics[tenantId];
  }
}

/**
 * Get raw metrics data (for testing)
 */
export function getRawMetrics(): TenantMetrics {
  return metrics;
}
