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
            
            // Run migrations
            try {
                const migrationPath = path.join(__dirname, 'migrate.sql');
                const migration = await fs.readFile(migrationPath, 'utf8');
                await client.query(migration);
                console.log('✅ Database migrations applied');
            } catch (migrationError) {
                console.log('⚠️ Migration already applied or not needed');
            }
            
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

    async updateTenant(tenantId, updates) {
        const fields = [];
        const values = [];
        let paramCount = 1;

        Object.keys(updates).forEach(key => {
            fields.push(`${key} = $${paramCount}`);
            values.push(updates[key]);
            paramCount++;
        });

        values.push(tenantId);
        const query = `
            UPDATE tenants 
            SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramCount}
            RETURNING *
        `;
        
        const result = await this.query(query, values);
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

    // Tenant files operations
    async createTenantFile(tenantId, fileName, fileLabel, fileUrl, cloudinaryPublicId, fileType, fileSize, mimeType) {
        const query = `
            INSERT INTO tenant_files (tenant_id, file_name, file_label, file_url, cloudinary_public_id, file_type, file_size, mime_type)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `;
        const result = await this.query(query, [tenantId, fileName, fileLabel, fileUrl, cloudinaryPublicId, fileType, fileSize, mimeType]);
        return result.rows[0];
    }

    async getTenantFiles(tenantId) {
        const query = 'SELECT * FROM tenant_files WHERE tenant_id = $1 ORDER BY created_at DESC';
        const result = await this.query(query, [tenantId]);
        return result.rows;
    }

    async getTenantFileByLabel(tenantId, fileLabel) {
        const query = 'SELECT * FROM tenant_files WHERE tenant_id = $1 AND LOWER(file_label) = LOWER($2)';
        const result = await this.query(query, [tenantId, fileLabel]);
        return result.rows[0];
    }

    async deleteTenantFile(fileId, tenantId) {
        const query = 'DELETE FROM tenant_files WHERE id = $1 AND tenant_id = $2 RETURNING *';
        const result = await this.query(query, [fileId, tenantId]);
        return result.rows[0];
    }

    // Customer order operations
    async createOrder(tenantId, customerPhone, orderDetails = null) {
        const query = `
            INSERT INTO customer_orders (tenant_id, customer_phone, order_details, order_state)
            VALUES ($1, $2, $3, 'initiated')
            RETURNING *
        `;
        const result = await this.query(query, [tenantId, customerPhone, orderDetails]);
        return result.rows[0];
    }

    async getActiveOrder(tenantId, customerPhone) {
        const query = `
            SELECT * FROM customer_orders 
            WHERE tenant_id = $1 AND customer_phone = $2 
            AND order_state IN ('initiated', 'awaiting_payment', 'awaiting_info')
            ORDER BY created_at DESC
            LIMIT 1
        `;
        const result = await this.query(query, [tenantId, customerPhone]);
        return result.rows[0];
    }

    async updateOrder(orderId, updates) {
        const fields = [];
        const values = [];
        let paramCount = 1;

        Object.keys(updates).forEach(key => {
            fields.push(`${key} = $${paramCount}`);
            values.push(updates[key]);
            paramCount++;
        });

        values.push(orderId);
        const query = `
            UPDATE customer_orders 
            SET ${fields.join(', ')}
            WHERE id = $${paramCount}
            RETURNING *
        `;
        
        const result = await this.query(query, values);
        return result.rows[0];
    }

    async completeOrder(orderId) {
        const query = `
            UPDATE customer_orders 
            SET order_state = 'completed', completed_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
        `;
        const result = await this.query(query, [orderId]);
        return result.rows[0];
    }
}

module.exports = new Database();
