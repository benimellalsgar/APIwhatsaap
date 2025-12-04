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

            // Create owner user
            const user = await db.createUser(
                tenant.id,
                email,
                passwordHash,
                fullName,
                'owner'
            );

            console.log(`✅ New tenant registered: ${tenantName} (${email})`);

            return {
                tenant,
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.full_name,
                    role: user.role
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
            // Get user
            const user = await db.getUserByEmail(email);
            if (!user) {
                throw new Error('Invalid email or password');
            }

            // Verify password
            const validPassword = await bcrypt.compare(password, user.password_hash);
            if (!validPassword) {
                throw new Error('Invalid email or password');
            }

            // Get tenant
            const tenant = await db.getTenantById(user.tenant_id);
            if (!tenant || !tenant.is_active) {
                throw new Error('Account is inactive');
            }

            // Invalidate old sessions (single session enforcement)
            await db.invalidateAllUserSessions(user.id);

            // Create JWT token
            const token = jwt.sign(
                {
                    userId: user.id,
                    tenantId: user.tenant_id,
                    email: user.email,
                    role: user.role
                },
                JWT_SECRET,
                { expiresIn: JWT_EXPIRES_IN }
            );

            // Hash token for storage
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

            // Create session record
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7); // 7 days
            
            await db.createSession(user.id, tokenHash, ipAddress, userAgent, expiresAt);

            // Update last login
            await db.updateUserLastLogin(user.id);

            console.log(`✅ User logged in: ${email}`);

            return {
                token,
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
}

module.exports = new AuthService();
