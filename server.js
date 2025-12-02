const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const MultiUserBotManager = require('./services/multiUserBotManager');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Multi-User Bot Manager Instance
const botManager = new MultiUserBotManager(io);

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Get all active sessions
app.get('/api/sessions', (req, res) => {
    const sessions = botManager.getAllSessions();
    res.json({ sessions });
});

// Get specific user session status
app.get('/api/status/:userId', (req, res) => {
    const { userId } = req.params;
    const session = botManager.getSession(userId);
    
    if (!session) {
        return res.json({ exists: false });
    }
    
    res.json({
        exists: true,
        isReady: session.isReady,
        hasQR: !!session.qrCode
    });
});

// Start new session for a user
app.post('/api/start', async (req, res) => {
    const { userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
    }

    try {
        await botManager.createSession(userId);
        res.json({ message: 'Session started. Please scan QR code.', userId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Stop user session
app.post('/api/stop', async (req, res) => {
    const { userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
    }

    try {
        await botManager.stopSession(userId);
        res.json({ message: 'Session stopped successfully.', userId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Clear user session data (logout and delete saved session)
app.post('/api/clear', async (req, res) => {
    const { userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
    }

    try {
        await botManager.clearSession(userId);
        res.json({ message: 'Session cleared successfully. User will need to scan QR code again.', userId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
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
server.listen(PORT, () => {
    console.log(`🌐 Web server running on http://localhost:${PORT}`);
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
