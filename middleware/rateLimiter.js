/**
 * Rate Limiting Middleware for Multi-Tenant WhatsApp Bot
 * Prevents abuse and ensures fair resource distribution
 */

class RateLimiter {
    constructor() {
        // Store request counts per user
        this.requestCounts = new Map(); // userId -> { count, resetTime, blocked }
        this.globalCount = { count: 0, resetTime: Date.now() + 60000 };
        
        // Limits
        this.limits = {
            perUser: {
                requests: 100, // 100 messages per minute per user
                window: 60000, // 1 minute
                blockDuration: 300000 // 5 minutes block if exceeded
            },
            global: {
                requests: 1000, // 1000 total messages per minute (all users)
                window: 60000
            }
        };
        
        // Cleanup old entries every 5 minutes
        setInterval(() => this.cleanup(), 300000);
    }

    /**
     * Check if user is rate limited
     * @param {string} userId - User identifier
     * @returns {object} { allowed: boolean, retryAfter: number, reason: string }
     */
    checkLimit(userId) {
        const now = Date.now();
        
        // Check global rate limit
        if (now > this.globalCount.resetTime) {
            this.globalCount = { count: 0, resetTime: now + this.limits.global.window };
        }
        
        if (this.globalCount.count >= this.limits.global.requests) {
            const retryAfter = Math.ceil((this.globalCount.resetTime - now) / 1000);
            return {
                allowed: false,
                retryAfter,
                reason: 'Global rate limit exceeded. System is at capacity.'
            };
        }
        
        // Check user-specific rate limit
        let userLimit = this.requestCounts.get(userId);
        
        // Check if user is blocked
        if (userLimit && userLimit.blocked && now < userLimit.blockedUntil) {
            const retryAfter = Math.ceil((userLimit.blockedUntil - now) / 1000);
            return {
                allowed: false,
                retryAfter,
                reason: 'Rate limit exceeded. Please wait before sending more messages.'
            };
        }
        
        // Initialize or reset user limit
        if (!userLimit || now > userLimit.resetTime) {
            userLimit = {
                count: 0,
                resetTime: now + this.limits.perUser.window,
                blocked: false,
                blockedUntil: 0
            };
            this.requestCounts.set(userId, userLimit);
        }
        
        // Check if user exceeded limit
        if (userLimit.count >= this.limits.perUser.requests) {
            // Block user
            userLimit.blocked = true;
            userLimit.blockedUntil = now + this.limits.perUser.blockDuration;
            
            console.warn(`⚠️ [Rate Limit] User ${userId} exceeded limit - blocked for 5 minutes`);
            
            const retryAfter = Math.ceil((userLimit.blockedUntil - now) / 1000);
            return {
                allowed: false,
                retryAfter,
                reason: 'Too many messages. Please wait 5 minutes.'
            };
        }
        
        // Allow request
        userLimit.count++;
        this.globalCount.count++;
        
        return {
            allowed: true,
            remaining: this.limits.perUser.requests - userLimit.count,
            resetIn: Math.ceil((userLimit.resetTime - now) / 1000)
        };
    }

    /**
     * Cleanup old entries to prevent memory leaks
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [userId, limit] of this.requestCounts.entries()) {
            // Remove entries that are reset and not blocked
            if (now > limit.resetTime && !limit.blocked) {
                this.requestCounts.delete(userId);
                cleaned++;
            }
            // Remove old blocks
            else if (limit.blocked && now > limit.blockedUntil) {
                this.requestCounts.delete(userId);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`🧹 [Rate Limit] Cleaned ${cleaned} old entries`);
        }
    }

    /**
     * Get current stats
     */
    getStats() {
        return {
            activeUsers: this.requestCounts.size,
            globalCount: this.globalCount.count,
            blockedUsers: Array.from(this.requestCounts.values()).filter(l => l.blocked).length
        };
    }

    /**
     * Reset limit for specific user (admin function)
     */
    resetUser(userId) {
        this.requestCounts.delete(userId);
        console.log(`🔓 [Rate Limit] Reset limit for user ${userId}`);
    }
}

module.exports = new RateLimiter();
