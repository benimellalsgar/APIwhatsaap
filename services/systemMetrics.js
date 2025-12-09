/**
 * System Metrics and Monitoring
 * Tracks performance, memory usage, and system health
 */

class SystemMetrics {
    constructor() {
        this.metrics = {
            startTime: Date.now(),
            totalRequests: 0,
            totalErrors: 0,
            activeSessions: 0,
            totalMessages: 0,
            rateLimitHits: 0
        };
        
        // Start periodic metrics logging
        setInterval(() => this.logMetrics(), 300000); // Every 5 minutes
    }

    /**
     * Record a new request
     */
    recordRequest() {
        this.metrics.totalRequests++;
    }

    /**
     * Record an error
     */
    recordError() {
        this.metrics.totalErrors++;
    }

    /**
     * Record a message
     */
    recordMessage() {
        this.metrics.totalMessages++;
    }

    /**
     * Record rate limit hit
     */
    recordRateLimitHit() {
        this.metrics.rateLimitHits++;
    }

    /**
     * Update active sessions count
     */
    updateActiveSessions(count) {
        this.metrics.activeSessions = count;
    }

    /**
     * Get current memory usage
     */
    getMemoryUsage() {
        const usage = process.memoryUsage();
        return {
            rss: Math.round(usage.rss / 1024 / 1024), // MB
            heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
            heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
            external: Math.round(usage.external / 1024 / 1024), // MB
            heapUsedPercent: Math.round((usage.heapUsed / usage.heapTotal) * 100)
        };
    }

    /**
     * Get system uptime
     */
    getUptime() {
        const uptime = Date.now() - this.metrics.startTime;
        const hours = Math.floor(uptime / 3600000);
        const minutes = Math.floor((uptime % 3600000) / 60000);
        return { uptime, hours, minutes };
    }

    /**
     * Get all metrics
     */
    getAllMetrics() {
        const memory = this.getMemoryUsage();
        const uptime = this.getUptime();
        
        return {
            ...this.metrics,
            memory,
            uptime: uptime.uptime,
            uptimeFormatted: `${uptime.hours}h ${uptime.minutes}m`,
            errorRate: this.metrics.totalRequests > 0 
                ? Math.round((this.metrics.totalErrors / this.metrics.totalRequests) * 100) 
                : 0,
            avgMessagesPerSession: this.metrics.activeSessions > 0
                ? Math.round(this.metrics.totalMessages / this.metrics.activeSessions)
                : 0
        };
    }

    /**
     * Log metrics periodically
     */
    logMetrics() {
        const metrics = this.getAllMetrics();
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 SYSTEM METRICS');
        console.log('='.repeat(60));
        console.log(`⏱️  Uptime: ${metrics.uptimeFormatted}`);
        console.log(`👥 Active Sessions: ${metrics.activeSessions}`);
        console.log(`📨 Total Messages: ${metrics.totalMessages}`);
        console.log(`📊 Avg Messages/Session: ${metrics.avgMessagesPerSession}`);
        console.log(`🚫 Rate Limit Hits: ${metrics.rateLimitHits}`);
        console.log(`❌ Error Rate: ${metrics.errorRate}%`);
        console.log(`💾 Memory (RSS): ${metrics.memory.rss} MB`);
        console.log(`🧠 Heap Used: ${metrics.memory.heapUsed} MB (${metrics.memory.heapUsedPercent}%)`);
        console.log('='.repeat(60) + '\n');
        
        // Alert if memory usage is high
        if (metrics.memory.heapUsedPercent > 85) {
            console.warn('⚠️ WARNING: High memory usage detected! Consider restarting or scaling up.');
        }
        
        // Alert if error rate is high
        if (metrics.errorRate > 10) {
            console.warn('⚠️ WARNING: High error rate detected! Check logs for issues.');
        }
    }

    /**
     * Reset metrics (admin function)
     */
    reset() {
        const uptime = this.metrics.startTime;
        this.metrics = {
            startTime: uptime,
            totalRequests: 0,
            totalErrors: 0,
            activeSessions: 0,
            totalMessages: 0,
            rateLimitHits: 0
        };
        console.log('🔄 Metrics reset');
    }
}

module.exports = new SystemMetrics();
