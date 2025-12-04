const authService = require('../services/authService');

/**
 * Middleware to verify JWT token
 */
async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.substring(7); // Remove 'Bearer '
        
        const { user, tenant } = await authService.verifyToken(token);
        
        // Attach to request
        req.user = user;
        req.tenant = tenant;
        req.token = token;
        
        next();
    } catch (error) {
        return res.status(401).json({ error: error.message });
    }
}

/**
 * Middleware to check user role
 */
function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        next();
    };
}

module.exports = { authenticate, authorize };
