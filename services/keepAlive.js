/**
 * Keep-alive service to prevent Railway from sleeping
 * Pings the server every 10 minutes to keep it active 24/7
 */

const axios = require('axios');

class KeepAliveService {
    constructor() {
        this.pingInterval = 10 * 60 * 1000; // 10 minutes
        this.healthUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
            ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/health`
            : `http://localhost:${process.env.PORT || 3000}/health`;
        this.isRunning = false;
        this.intervalId = null;
        this.startTime = Date.now();
        this.pingCount = 0;
        this.failedPings = 0;
    }

    /**
     * Start the keep-alive service
     */
    start() {
        if (this.isRunning) {
            console.log('⚠️ Keep-alive service is already running');
            return;
        }

        this.isRunning = true;
        console.log(`💗 Keep-alive service started`);
        console.log(`   Ping URL: ${this.healthUrl}`);
        console.log(`   Interval: ${this.pingInterval / 1000}s (${this.pingInterval / 60000}min)`);

        // Initial ping after 30 seconds
        setTimeout(() => this.ping(), 30000);

        // Start interval pings
        this.intervalId = setInterval(() => {
            this.ping();
        }, this.pingInterval);
    }

    /**
     * Stop the keep-alive service
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        console.log('💔 Keep-alive service stopped');
    }

    /**
     * Ping the health endpoint
     */
    async ping() {
        try {
            const startTime = Date.now();
            const response = await axios.get(this.healthUrl, {
                timeout: 10000, // 10 second timeout
                headers: {
                    'User-Agent': 'KeepAlive-Service/1.0'
                }
            });

            const responseTime = Date.now() - startTime;
            this.pingCount++;

            if (response.status === 200) {
                console.log(`💗 Keep-alive ping #${this.pingCount} successful (${responseTime}ms)`);
                
                // Reset failed pings on success
                this.failedPings = 0;
            } else {
                console.warn(`⚠️ Keep-alive ping #${this.pingCount} returned status ${response.status}`);
                this.failedPings++;
            }

            // Log stats every 10 pings (every ~100 minutes)
            if (this.pingCount % 10 === 0) {
                this.logStats();
            }
        } catch (error) {
            this.failedPings++;
            console.error(`❌ Keep-alive ping #${this.pingCount + 1} failed:`, error.message);

            // Alert if multiple consecutive failures
            if (this.failedPings >= 3) {
                console.error(`🚨 ALERT: ${this.failedPings} consecutive keep-alive failures!`);
            }
        }
    }

    /**
     * Log keep-alive statistics
     */
    logStats() {
        const uptime = Date.now() - this.startTime;
        const uptimeHours = (uptime / (1000 * 60 * 60)).toFixed(1);
        const successRate = this.pingCount > 0 
            ? ((this.pingCount - this.failedPings) / this.pingCount * 100).toFixed(1)
            : 0;

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('💗 Keep-Alive Stats:');
        console.log(`   Uptime: ${uptimeHours}h`);
        console.log(`   Total Pings: ${this.pingCount}`);
        console.log(`   Failed Pings: ${this.failedPings}`);
        console.log(`   Success Rate: ${successRate}%`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    /**
     * Get current statistics
     */
    getStats() {
        const uptime = Date.now() - this.startTime;
        return {
            isRunning: this.isRunning,
            uptime: uptime,
            uptimeHours: (uptime / (1000 * 60 * 60)).toFixed(1),
            pingCount: this.pingCount,
            failedPings: this.failedPings,
            successRate: this.pingCount > 0 
                ? ((this.pingCount - this.failedPings) / this.pingCount * 100).toFixed(1)
                : 0,
            healthUrl: this.healthUrl,
            pingInterval: this.pingInterval
        };
    }
}

// Export singleton instance
module.exports = new KeepAliveService();
