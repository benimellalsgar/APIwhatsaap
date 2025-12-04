const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

class Database {
    constructor() {
        if (!process.env.DATABASE_URL) {
            console.error('❌ DATABASE_URL is not set!');
            console.log('💡 Please add PostgreSQL database in Railway');
        }
        
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });

        this.pool.on('error', (err) => {
            console.error('Unexpected database error:', err);
        });
    }

    async initialize() {
        try {
            // Test connection
            const client = await this.pool.connect();
            console.log('✅ Database connected successfully');
            
            // Run schema
            const schemaPath = path.join(__dirname, 'schema.sql');
            const schema = await fs.readFile(schemaPath, 'utf8');
            await client.query(schema);
            console.log('✅ Database schema initialized');
            
            client.release();
            return true;
        } catch (error) {
            console.error('❌ Database initialization error:', error);
            return false;
        }
    }

    async query(text, params) {
        const start = Date.now();
        try {
            const res = await this.pool.query(text, params);
            const duration = Date.now() - start;
            console.log('Executed query', { text, duration, rows: res.rowCount });
            return res;
        } catch (error) {
            console.error('Database query error:', error);
            throw error;
        }
    }

    async getClient() {
        return await this.pool.connect();
    }

    async close() {
        await this.pool.end();
        console.log('✅ Database connection closed');
    }

    // Tenant operations
    async createTenant(name, email) {
        const query = `
            INSERT INTO tenants (name, email)
            VALUES ($1, $2)
            RETURNING *
        `;
        const result = await this.query(query, [name, email]);
        return result.rows[0];
    }

    async getTenantById(id) {
        const query = 'SELECT * FROM tenants WHERE id = $1';
        const result = await this.query(query, [id]);
        return result.rows[0];
    }

    async getTenantByEmail(email) {
        const query = 'SELECT * FROM tenants WHERE email = $1';
        const result = await this.query(query, [email]);
        return result.rows[0];
    }

    // User operations
    async createUser(tenantId, email, passwordHash, fullName, role = 'owner') {
        const query = `
            INSERT INTO users (tenant_id, email, password_hash, full_name, role)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, tenant_id, email, full_name, role, created_at
        `;
        const result = await this.query(query, [tenantId, email, passwordHash, fullName, role]);
        return result.rows[0];
    }

    async getUserByEmail(email) {
        const query = 'SELECT * FROM users WHERE email = $1 AND is_active = true';
        const result = await this.query(query, [email]);
        return result.rows[0];
    }

    async getUserById(id) {
        const query = 'SELECT * FROM users WHERE id = $1';
        const result = await this.query(query, [id]);
        return result.rows[0];
    }

    async updateUserLastLogin(userId) {
        const query = 'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1';
        await this.query(query, [userId]);
    }

    // WhatsApp connection operations
    async createWhatsAppConnection(tenantId, sessionId, businessData = null, apiKey = null) {
        const query = `
            INSERT INTO whatsapp_connections (tenant_id, session_id, business_data, api_key)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        const result = await this.query(query, [tenantId, sessionId, businessData, apiKey]);
        return result.rows[0];
    }

    async getWhatsAppConnectionBySessionId(sessionId) {
        const query = 'SELECT * FROM whatsapp_connections WHERE session_id = $1';
        const result = await this.query(query, [sessionId]);
        return result.rows[0];
    }

    async getWhatsAppConnectionsByTenantId(tenantId) {
        const query = 'SELECT * FROM whatsapp_connections WHERE tenant_id = $1';
        const result = await this.query(query, [tenantId]);
        return result.rows;
    }

    async updateWhatsAppConnection(sessionId, updates) {
        const fields = [];
        const values = [];
        let paramCount = 1;

        Object.keys(updates).forEach(key => {
            fields.push(`${key} = $${paramCount}`);
            values.push(updates[key]);
            paramCount++;
        });

        values.push(sessionId);
        const query = `
            UPDATE whatsapp_connections 
            SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE session_id = $${paramCount}
            RETURNING *
        `;
        
        const result = await this.query(query, values);
        return result.rows[0];
    }

    async deleteWhatsAppConnection(sessionId) {
        const query = 'DELETE FROM whatsapp_connections WHERE session_id = $1';
        await this.query(query, [sessionId]);
    }

    // Session operations
    async createSession(userId, tokenHash, ipAddress, userAgent, expiresAt) {
        const query = `
            INSERT INTO sessions (user_id, token_hash, ip_address, user_agent, expires_at)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        const result = await this.query(query, [userId, tokenHash, ipAddress, userAgent, expiresAt]);
        return result.rows[0];
    }

    async getActiveSession(tokenHash) {
        const query = `
            SELECT * FROM sessions 
            WHERE token_hash = $1 AND is_active = true AND expires_at > CURRENT_TIMESTAMP
        `;
        const result = await this.query(query, [tokenHash]);
        return result.rows[0];
    }

    async invalidateSession(tokenHash) {
        const query = 'UPDATE sessions SET is_active = false WHERE token_hash = $1';
        await this.query(query, [tokenHash]);
    }

    async invalidateAllUserSessions(userId) {
        const query = 'UPDATE sessions SET is_active = false WHERE user_id = $1';
        await this.query(query, [userId]);
    }
}

module.exports = new Database();
