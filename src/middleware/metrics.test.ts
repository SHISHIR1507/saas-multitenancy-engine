import { describe, test, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  recordRequest,
  getTenantMetrics,
  getAllMetrics,
  resetTenantMetrics,
  resetAllMetrics,
  getRawMetrics,
} from './metrics';

describe('Metrics Collection', () => {
  beforeEach(() => {
    // Reset all metrics before each test
    resetAllMetrics();
  });

  /**
   * Property 41: Metrics tracking
   * 
   * For any request processed, the system should update metrics for request volume,
   * and if an error occurs, should update error rate metrics.
   * 
   * **Validates: Requirements 10.2**
   */
  test('Property 41: Metrics tracking', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }), // tenantId
        fc.array(
          fc.record({
            responseTime: fc.integer({ min: 1, max: 5000 }), // 1ms to 5s
            isError: fc.boolean(),
          }),
          { minLength: 1, maxLength: 50 }
        ), // requests
        async (tenantId, requests) => {
          // Record all requests
          for (const req of requests) {
            recordRequest(tenantId, req.responseTime, req.isError);
          }

          // Get metrics
          const metrics = getTenantMetrics(tenantId);

          // Verify request count
          expect(metrics.totalRequests).toBe(requests.length);

          // Verify error count
          const expectedErrors = requests.filter(r => r.isError).length;
          expect(metrics.totalErrors).toBe(expectedErrors);

          // Verify error rate
          const expectedErrorRate = (expectedErrors / requests.length) * 100;
          expect(metrics.errorRate).toBeCloseTo(expectedErrorRate, 2);

          // Verify average response time
          const totalResponseTime = requests.reduce((sum, r) => sum + r.responseTime, 0);
          const expectedAvg = totalResponseTime / requests.length;
          expect(metrics.avgResponseTime).toBeCloseTo(expectedAvg, 2);

          // Verify percentiles are within valid range
          expect(metrics.p50ResponseTime).toBeGreaterThanOrEqual(0);
          expect(metrics.p95ResponseTime).toBeGreaterThanOrEqual(metrics.p50ResponseTime);
          expect(metrics.p99ResponseTime).toBeGreaterThanOrEqual(metrics.p95ResponseTime);
        }
      ),
      { numRuns: 20 }
    );
  });

  test('Record single request updates metrics', () => {
    const tenantId = 'tenant-123';
    
    recordRequest(tenantId, 100, false);
    
    const metrics = getTenantMetrics(tenantId);
    expect(metrics.totalRequests).toBe(1);
    expect(metrics.totalErrors).toBe(0);
    expect(metrics.errorRate).toBe(0);
    expect(metrics.avgResponseTime).toBe(100);
  });

  test('Record error request updates error count', () => {
    const tenantId = 'tenant-123';
    
    recordRequest(tenantId, 100, false);
    recordRequest(tenantId, 200, true);
    recordRequest(tenantId, 150, false);
    
    const metrics = getTenantMetrics(tenantId);
    expect(metrics.totalRequests).toBe(3);
    expect(metrics.totalErrors).toBe(1);
    expect(metrics.errorRate).toBeCloseTo(33.33, 2);
  });

  test('Response time percentiles are calculated correctly', () => {
    const tenantId = 'tenant-123';
    
    // Record requests with known response times
    const times = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    for (const time of times) {
      recordRequest(tenantId, time, false);
    }
    
    const metrics = getTenantMetrics(tenantId);
    
    // P50 should be around 50-60 (median)
    expect(metrics.p50ResponseTime).toBeGreaterThanOrEqual(50);
    expect(metrics.p50ResponseTime).toBeLessThanOrEqual(60);
    
    // P95 should be around 95-100
    expect(metrics.p95ResponseTime).toBeGreaterThanOrEqual(90);
    expect(metrics.p95ResponseTime).toBeLessThanOrEqual(100);
    
    // P99 should be around 99-100
    expect(metrics.p99ResponseTime).toBeGreaterThanOrEqual(90);
    expect(metrics.p99ResponseTime).toBeLessThanOrEqual(100);
  });

  test('Metrics are isolated per tenant', () => {
    const tenant1 = 'tenant-1';
    const tenant2 = 'tenant-2';
    
    recordRequest(tenant1, 100, false);
    recordRequest(tenant1, 200, true);
    
    recordRequest(tenant2, 50, false);
    recordRequest(tenant2, 75, false);
    recordRequest(tenant2, 100, false);
    
    const metrics1 = getTenantMetrics(tenant1);
    const metrics2 = getTenantMetrics(tenant2);
    
    expect(metrics1.totalRequests).toBe(2);
    expect(metrics1.totalErrors).toBe(1);
    
    expect(metrics2.totalRequests).toBe(3);
    expect(metrics2.totalErrors).toBe(0);
  });

  test('Get all metrics returns all tenants', () => {
    recordRequest('tenant-1', 100, false);
    recordRequest('tenant-2', 200, false);
    recordRequest('tenant-3', 150, true);
    
    const allMetrics = getAllMetrics();
    
    expect(Object.keys(allMetrics)).toHaveLength(3);
    expect(allMetrics['tenant-1']).toBeDefined();
    expect(allMetrics['tenant-2']).toBeDefined();
    expect(allMetrics['tenant-3']).toBeDefined();
  });

  test('Reset tenant metrics clears data', () => {
    const tenantId = 'tenant-123';
    
    recordRequest(tenantId, 100, false);
    recordRequest(tenantId, 200, true);
    
    let metrics = getTenantMetrics(tenantId);
    expect(metrics.totalRequests).toBe(2);
    
    resetTenantMetrics(tenantId);
    
    metrics = getTenantMetrics(tenantId);
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.totalErrors).toBe(0);
  });

  test('Reset all metrics clears all tenants', () => {
    recordRequest('tenant-1', 100, false);
    recordRequest('tenant-2', 200, false);
    
    resetAllMetrics();
    
    const allMetrics = getAllMetrics();
    expect(Object.keys(allMetrics)).toHaveLength(0);
  });

  test('Zero requests returns zero metrics', () => {
    const tenantId = 'tenant-empty';
    
    const metrics = getTenantMetrics(tenantId);
    
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.totalErrors).toBe(0);
    expect(metrics.errorRate).toBe(0);
    expect(metrics.avgResponseTime).toBe(0);
    expect(metrics.p50ResponseTime).toBe(0);
    expect(metrics.p95ResponseTime).toBe(0);
    expect(metrics.p99ResponseTime).toBe(0);
  });

  test('Response times buffer is limited', () => {
    const tenantId = 'tenant-123';
    
    // Record more than MAX_RESPONSE_TIMES (1000) requests
    for (let i = 0; i < 1500; i++) {
      recordRequest(tenantId, i, false);
    }
    
    const rawMetrics = getRawMetrics();
    const tenantMetrics = rawMetrics[tenantId];
    
    // Should only keep last 1000 response times
    expect(tenantMetrics.responseTimes.length).toBe(1000);
    
    // Should have kept the most recent ones (500-1499)
    expect(tenantMetrics.responseTimes[0]).toBeGreaterThanOrEqual(500);
  });

  test('Error rate is 100% when all requests fail', () => {
    const tenantId = 'tenant-123';
    
    recordRequest(tenantId, 100, true);
    recordRequest(tenantId, 200, true);
    recordRequest(tenantId, 150, true);
    
    const metrics = getTenantMetrics(tenantId);
    expect(metrics.errorRate).toBe(100);
  });

  test('Error rate is 0% when no requests fail', () => {
    const tenantId = 'tenant-123';
    
    recordRequest(tenantId, 100, false);
    recordRequest(tenantId, 200, false);
    recordRequest(tenantId, 150, false);
    
    const metrics = getTenantMetrics(tenantId);
    expect(metrics.errorRate).toBe(0);
  });
});
