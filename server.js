const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const MultiUserBotManager = require('./services/multiUserBotManager');
const UserDataStore = require('./services/userDataStore');
const authService = require('./services/authService');
const { authenticate, authorize } = require('./middleware/auth');
const db = require('./database/db');
const fileStorageService = require('./services/fileStorageService');
const cloudinaryService = require('./services/cloudinaryService');
const AIService = require('./services/aiService');
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

// Configure multer for file uploads (memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 25 * 1024 * 1024 // 25MB max file size
    }
});

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
        
        console.log('📝 Registration attempt:', { tenantName, email, fullName });
        
        if (!tenantName || !email || !password || !fullName) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const result = await authService.register(tenantName, email, password, fullName);
        res.json({ 
            message: 'Registration successful! Your account is pending admin approval. You will be notified when approved.', 
            needsApproval: true,
            tenant: result.tenant, 
            user: result.user 
        });
    } catch (error) {
        console.error('❌ Registration error:', error);
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

// Admin routes - Get pending users
app.get('/api/admin/pending-users', async (req, res) => {
    try {
        // Simple admin check - you can add proper admin authentication later
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== process.env.ADMIN_KEY) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const pendingUsers = await authService.getPendingUsers();
        res.json({ users: pendingUsers });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin routes - Approve user
app.post('/api/admin/approve-user/:userId', async (req, res) => {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== process.env.ADMIN_KEY) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { userId } = req.params;
        await authService.approveUser(parseInt(userId));
        res.json({ message: 'User approved successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin routes - Reject user
app.delete('/api/admin/reject-user/:userId', async (req, res) => {
    try {
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== process.env.ADMIN_KEY) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const { userId } = req.params;
        await authService.rejectUser(parseInt(userId));
        res.json({ message: 'User rejected successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
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

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
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

// File upload endpoint (protected) - Upload to Cloudinary
app.post('/api/upload', authenticate, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const tenantId = req.tenant.id;
        const { fileLabel } = req.body; // Optional label like "catalog", "pricelist", etc.
        
        // Determine file type
        let fileType = 'document';
        if (req.file.mimetype.startsWith('image/')) fileType = 'image';
        else if (req.file.mimetype.startsWith('audio/')) fileType = 'audio';
        else if (req.file.mimetype.startsWith('video/')) fileType = 'video';

        // Upload to Cloudinary
        const uploadResult = await cloudinaryService.uploadFile(
            req.file.buffer,
            `tenant_${tenantId}`,
            req.file.originalname,
            fileType
        );

        // Save to database
        const fileRecord = await db.createTenantFile(
            tenantId,
            req.file.originalname,
            fileLabel || req.file.originalname,
            uploadResult.url,
            uploadResult.publicId,
            fileType,
            req.file.size,
            req.file.mimetype
        );

        console.log(`📁 File uploaded to Cloudinary by tenant ${tenantId}:`, fileRecord.file_name);

        res.json({ 
            message: 'File uploaded successfully',
            file: {
                id: fileRecord.id,
                fileName: fileRecord.file_name,
                fileLabel: fileRecord.file_label,
                fileUrl: fileRecord.file_url,
                fileType: fileRecord.file_type,
                size: fileRecord.file_size
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get tenant files (protected)
app.get('/api/files', authenticate, async (req, res) => {
    try {
        const files = await db.getTenantFiles(req.tenant.id);
        res.json({ files });
    } catch (error) {
        console.error('Error fetching files:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete tenant file (protected)
app.delete('/api/files/:fileId', authenticate, async (req, res) => {
    try {
        const { fileId } = req.params;
        
        // Get file from database
        const files = await db.getTenantFiles(req.tenant.id);
        const file = files.find(f => f.id === parseInt(fileId));
        
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Delete from Cloudinary
        const resourceType = file.file_type === 'image' ? 'image' : 
                           file.file_type === 'video' || file.file_type === 'audio' ? 'video' : 'raw';
        
        await cloudinaryService.deleteFile(file.cloudinary_public_id, resourceType);

        // Delete from database
        await db.deleteTenantFile(file.id, req.tenant.id);

        res.json({ message: 'File deleted successfully' });
    } catch (error) {
        console.error('Delete error:', error);
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

// Start file cleanup job (runs every hour)
fileStorageService.startCleanupJob();

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Web server running on http://0.0.0.0:${PORT}`);
    console.log(`📱 Open this URL in your browser to scan WhatsApp QR code`);
    console.log(`🗑️ File cleanup job started (runs every hour)`);
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
