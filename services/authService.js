const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';
const JWT_EXPIRES_IN = '7d'; // 7 days

class AuthService {
    /**
     * Register a new tenant with owner user
     */
    async register(tenantName, email, password, fullName) {
        try {
            // Check if email already exists
            const existingUser = await db.getUserByEmail(email);
            if (existingUser) {
                throw new Error('Email already registered');
            }

            // Hash password
            const passwordHash = await bcrypt.hash(password, 10);

            // Create tenant
            const tenant = await db.createTenant(tenantName, email);

            // Create owner user (inactive by default - needs admin approval)
            const user = await db.createUser(
                tenant.id,
                email,
                passwordHash,
                fullName,
                'owner'
            );

            // Set tenant as inactive (needs approval)
            await db.query('UPDATE tenants SET is_active = false WHERE id = $1', [tenant.id]);
            await db.query('UPDATE users SET is_active = false WHERE id = $1', [user.id]);

            console.log(`✅ New tenant registered (pending approval): ${tenantName} (${email})`);

            return {
                tenant,
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.full_name,
                    role: user.role,
                    needsApproval: true
                }
            };
        } catch (error) {
            console.error('Registration error:', error);
            throw error;
        }
    }

    /**
     * Login user and create session
     */
    async login(email, password, ipAddress, userAgent) {
        try {
            // Get user (include inactive users for better error message)
            const user = await db.query('SELECT * FROM users WHERE email = $1', [email]);
            if (!user.rows[0]) {
                throw new Error('Invalid email or password');
            }
            const userRecord = user.rows[0];

            // Check if user is active (approved)
            if (!userRecord.is_active) {
                throw new Error('Your account is pending approval. Please wait for admin activation.');
            }

            // Verify password
            const validPassword = await bcrypt.compare(password, userRecord.password_hash);
            if (!validPassword) {
                throw new Error('Invalid email or password');
            }

            // Get tenant
            const tenant = await db.getTenantById(userRecord.tenant_id);
            if (!tenant || !tenant.is_active) {
                throw new Error('Your account is pending approval. Please wait for admin activation.');
            }

            // Invalidate old sessions (single session enforcement)
            await db.invalidateAllUserSessions(userRecord.id);

            // Create JWT token
            const token = jwt.sign(
                {
                    userId: userRecord.id,
                    tenantId: userRecord.tenant_id,
                    email: userRecord.email,
                    role: userRecord.role
                },
                JWT_SECRET,
                { expiresIn: JWT_EXPIRES_IN }
            );

            // Hash token for storage
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

            // Create session record
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7); // 7 days
            
            await db.createSession(userRecord.id, tokenHash, ipAddress, userAgent, expiresAt);

            // Update last login
            await db.updateUserLastLogin(userRecord.id);

            console.log(`✅ User logged in: ${email}`);

            return {
                token,
                user: {
                    id: userRecord.id,
                    email: userRecord.email,
                    fullName: userRecord.full_name,
                    role: userRecord.role,
                    tenantId: userRecord.tenant_id
                },
                tenant: {
                    id: tenant.id,
                    name: tenant.name,
                    plan: tenant.plan
                }
            };
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    /**
     * Verify JWT token and check session
     */
    async verifyToken(token) {
        try {
            // Verify JWT
            const decoded = jwt.verify(token, JWT_SECRET);

            // Hash token to check session
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

            // Check if session is active
            const session = await db.getActiveSession(tokenHash);
            if (!session) {
                throw new Error('Session expired or invalid');
            }

            // Get user
            const user = await db.getUserById(decoded.userId);
            if (!user || !user.is_active) {
                throw new Error('User not found or inactive');
            }

            // Get tenant
            const tenant = await db.getTenantById(user.tenant_id);
            if (!tenant || !tenant.is_active) {
                throw new Error('Tenant not found or inactive');
            }

            return {
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.full_name,
                    role: user.role,
                    tenantId: user.tenant_id
                },
                tenant: {
                    id: tenant.id,
                    name: tenant.name,
                    plan: tenant.plan
                }
            };
        } catch (error) {
            throw new Error('Invalid or expired token');
        }
    }

    /**
     * Logout user
     */
    async logout(token) {
        try {
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            await db.invalidateSession(tokenHash);
            console.log('✅ User logged out');
        } catch (error) {
            console.error('Logout error:', error);
            throw error;
        }
    }

    /**
     * Get all pending users (admin only)
     */
    async getPendingUsers() {
        try {
            const result = await db.query(`
                SELECT u.id, u.email, u.full_name, u.created_at, t.name as tenant_name, t.id as tenant_id
                FROM users u
                JOIN tenants t ON u.tenant_id = t.id
                WHERE u.is_active = false
                ORDER BY u.created_at DESC
            `);
            return result.rows;
        } catch (error) {
            console.error('Error fetching pending users:', error);
            throw error;
        }
    }

    /**
     * Approve user (admin only)
     */
    async approveUser(userId) {
        try {
            // Activate user
            await db.query('UPDATE users SET is_active = true WHERE id = $1', [userId]);
            
            // Activate tenant
            const user = await db.getUserById(userId);
            await db.query('UPDATE tenants SET is_active = true WHERE id = $1', [user.tenant_id]);
            
            console.log(`✅ User approved: ${user.email}`);
            return true;
        } catch (error) {
            console.error('Error approving user:', error);
            throw error;
        }
    }

    /**
     * Reject/Delete user (admin only)
     */
    async rejectUser(userId) {
        try {
            const user = await db.getUserById(userId);
            const tenantId = user.tenant_id;
            
            // Delete user
            await db.query('DELETE FROM users WHERE id = $1', [userId]);
            
            // Delete tenant if no other users
            const otherUsers = await db.query('SELECT id FROM users WHERE tenant_id = $1', [tenantId]);
            if (otherUsers.rows.length === 0) {
                await db.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
            }
            
            console.log(`❌ User rejected: ${user.email}`);
            return true;
        } catch (error) {
            console.error('Error rejecting user:', error);
            throw error;
        }
    }
}

module.exports = new AuthService();
