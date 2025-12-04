const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const MultiUserBotManager = require('./services/multiUserBotManager');
const UserDataStore = require('./services/userDataStore');
const authService = require('./services/authService');
const { authenticate, authorize } = require('./middleware/auth');
const db = require('./database/db');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Initialize database
db.initialize().catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Multi-User Bot Manager and Data Store Instances
const userDataStore = new UserDataStore();
const botManager = new MultiUserBotManager(io, userDataStore);

// Health check endpoint (must respond quickly for Railway)
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Detailed status endpoint
app.get('/status', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        uptime: process.uptime(),
        sessions: botManager.getAllSessions().length,
        memory: process.memoryUsage()
    });
});

// Auth routes
app.post('/api/auth/register', async (req, res) => {
    try {
        const { tenantName, email, password, fullName } = req.body;
        
        if (!tenantName || !email || !password || !fullName) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const result = await authService.register(tenantName, email, password, fullName);
        res.json({ message: 'Registration successful', tenant: result.tenant, user: result.user });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'];

        const result = await authService.login(email, password, ipAddress, userAgent);
        res.json(result);
    } catch (error) {
        res.status(401).json({ error: error.message });
    }
});

app.post('/api/auth/logout', authenticate, async (req, res) => {
    try {
        await authService.logout(req.token);
        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/auth/me', authenticate, (req, res) => {
    res.json({
        user: req.user,
        tenant: req.tenant
    });
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Get all active sessions (protected)
app.get('/api/sessions', authenticate, async (req, res) => {
    try {
        const connections = await db.getWhatsAppConnectionsByTenantId(req.tenant.id);
        res.json({ sessions: connections });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get specific session status (protected)
app.get('/api/status/:sessionId', authenticate, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const connection = await db.getWhatsAppConnectionBySessionId(sessionId);
        
        if (!connection || connection.tenant_id !== req.tenant.id) {
            return res.json({ exists: false });
        }
        
        const session = botManager.getSession(sessionId);
        
        res.json({
            exists: true,
            isReady: session ? session.isReady : false,
            hasQR: session ? !!session.qrCode : false,
            isConnected: connection.is_connected
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start new session (protected)
app.post('/api/start', authenticate, async (req, res) => {
    try {
        const { config } = req.body;
        
        // Generate unique session ID for this tenant
        const sessionId = `tenant_${req.tenant.id}_${Date.now()}`;
        
        // Save WhatsApp connection to database
        await db.createWhatsAppConnection(
            req.tenant.id,
            sessionId,
            config?.businessData || null,
            config?.apiKey || null
        );
        
        // Start bot session
        await botManager.createSession(sessionId, config);
        
        res.json({ 
            message: 'Session started. Please scan QR code.', 
            sessionId 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Stop session (protected)
app.post('/api/stop', authenticate, async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }

        const connection = await db.getWhatsAppConnectionBySessionId(sessionId);
        if (!connection || connection.tenant_id !== req.tenant.id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        await botManager.stopSession(sessionId);
        await db.updateWhatsAppConnection(sessionId, { is_connected: false });
        
        res.json({ message: 'Session stopped successfully', sessionId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Clear session data (protected)
app.post('/api/clear', authenticate, async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }

        const connection = await db.getWhatsAppConnectionBySessionId(sessionId);
        if (!connection || connection.tenant_id !== req.tenant.id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        await botManager.clearSession(sessionId);
        await db.deleteWhatsAppConnection(sessionId);
        
        res.json({ message: 'Session cleared successfully', sessionId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Socket.IO for real-time updates
io.on('connection', (socket) => {
    console.log('👤 User connected:', socket.id);

    // User joins their own room
    socket.on('join', (userId) => {
        socket.join(userId);
        console.log(`👤 User ${userId} joined their room`);
        
        // Send their session status
        const session = botManager.getSession(userId);
        socket.emit('status', {
            exists: !!session,
            isReady: session ? session.isReady : false
        });
    });

    socket.on('disconnect', () => {
        console.log('👤 User disconnected:', socket.id);
    });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Web server running on http://0.0.0.0:${PORT}`);
    console.log(`📱 Open this URL in your browser to scan WhatsApp QR code`);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down server...');
    await botManager.cleanup();
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});
