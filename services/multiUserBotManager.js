const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const AIService = require('./aiService');

class MultiUserBotManager {
    constructor(io) {
        this.io = io;
        this.sessions = new Map(); // userId -> client
        this.aiService = new AIService();
    }

    // Create new session for a user
    async createSession(userId) {
        if (this.sessions.has(userId)) {
            throw new Error('Session already exists for this user');
        }

        console.log(`🚀 Creating session for user: ${userId}`);

        try {
            const client = new Client({
                authStrategy: new LocalAuth({
                    clientId: `user_${userId}`
                }),
                puppeteer: {
                    headless: true,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-gpu',
                        '--disable-software-rasterizer',
                        '--disable-dev-tools',
                        '--no-first-run',
                        '--no-zygote',
                        '--single-process',
                        '--disable-extensions',
                        '--disable-background-networking',
                        '--disable-default-apps',
                        '--mute-audio',
                        '--no-default-browser-check',
                        '--disable-hang-monitor',
                        '--disable-prompt-on-repost',
                        '--disable-sync',
                        '--metrics-recording-only',
                        '--safebrowsing-disable-auto-update',
                        '--disable-background-timer-throttling',
                        '--disable-renderer-backgrounding',
                        '--disable-backgrounding-occluded-windows',
                        '--disable-ipc-flooding-protection',
                        '--password-store=basic',
                        '--use-mock-keychain'
                    ]
                }
            });

            // Store session info
            const sessionInfo = {
                client: client,
                isReady: false,
                userId: userId,
                qrCode: null
            };

            this.sessions.set(userId, sessionInfo);
            this.setupEventHandlers(userId, client);
            
            // Initialize without awaiting to prevent blocking
            client.initialize().catch(error => {
                console.error(`❌ [${userId}] Failed to initialize:`, error);
                this.sessions.delete(userId);
                this.io.to(userId).emit('error', { 
                    userId,
                    message: 'Failed to initialize WhatsApp client',
                    error: error.message 
                });
            });
            
            return sessionInfo;
        } catch (error) {
            console.error(`❌ [${userId}] Error creating session:`, error);
            this.sessions.delete(userId);
            throw error;
        }
    }

    setupEventHandlers(userId, client) {
        // Loading
        client.on('loading_screen', (percent, message) => {
            console.log(`⏳ [${userId}] Loading: ${percent}% - ${message}`);
            this.io.to(userId).emit('loading', { userId, percent, message });
        });

        // QR Code
        client.on('qr', async (qr) => {
            console.log(`📱 [${userId}] QR Code generated - Scan with WhatsApp on your phone`);
            
            try {
                const qrDataURL = await qrcode.toDataURL(qr);
                const sessionInfo = this.sessions.get(userId);
                if (sessionInfo) {
                    sessionInfo.qrCode = qrDataURL;
                }
                
                this.io.to(userId).emit('qr', { userId, qrCode: qrDataURL });
            } catch (error) {
                console.error(`Error generating QR code for ${userId}:`, error);
            }
        });

        // Ready
        client.on('ready', () => {
            console.log(`✅ [${userId}] WhatsApp connected and ready!`);
            const sessionInfo = this.sessions.get(userId);
            if (sessionInfo) {
                sessionInfo.isReady = true;
                sessionInfo.qrCode = null;
            }
            
            this.io.to(userId).emit('ready', { 
                userId,
                message: 'Your bot is ready! You can now receive messages.' 
            });
        });

        // Messages
        client.on('message', async (message) => {
            await this.handleMessage(userId, message);
        });

        // Disconnected
        client.on('disconnected', (reason) => {
            console.log(`❌ [${userId}] Disconnected:`, reason);
            this.sessions.delete(userId);
            this.io.to(userId).emit('disconnected', { userId, reason });
        });

        // Authentication
        client.on('authenticated', () => {
            console.log(`🔐 [${userId}] Authenticated successfully!`);
            this.io.to(userId).emit('authenticated', { userId });
        });

        client.on('auth_failure', (message) => {
            console.error(`❌ [${userId}] Auth failed:`, message);
            this.io.to(userId).emit('authFailure', { userId, error: message });
        });

        // Remote session saved
        client.on('remote_session_saved', () => {
            console.log(`💾 [${userId}] Session saved remotely`);
        });

        // State change
        client.on('change_state', (state) => {
            console.log(`🔄 [${userId}] State changed to:`, state);
        });
    }

    async handleMessage(userId, message) {
        try {
            // Ignore status and own messages
            if (message.from === 'status@broadcast' || message.fromMe) {
                return;
            }

            const chat = await message.getChat();
            const messageBody = message.body;
            const senderName = message._data.notifyName || message.from.split('@')[0];

            console.log(`\n📩 [${userId}] From ${senderName}: ${messageBody}`);

            // Emit to user's web interface
            this.io.to(userId).emit('messageReceived', {
                userId,
                from: senderName,
                message: messageBody,
                timestamp: new Date().toISOString()
            });

            // Typing indicator
            await chat.sendStateTyping();

            // Get AI response
            const aiResponse = await this.aiService.generateResponse(messageBody, {
                senderName: senderName,
                chatId: `${userId}_${message.from}`
            });

            // Send response
            await message.reply(aiResponse);
            console.log(`✅ [${userId}] Replied: ${aiResponse}`);

            // Emit to user's web interface
            this.io.to(userId).emit('messageSent', {
                userId,
                to: senderName,
                message: aiResponse,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error(`❌ [${userId}] Error:`, error.message);
            
            try {
                await message.reply('Sorry, I encountered an error. Please try again.');
            } catch (e) {}

            this.io.to(userId).emit('error', { 
                userId,
                message: 'Error processing message',
                error: error.message 
            });
        }
    }

    async stopSession(userId) {
        const sessionInfo = this.sessions.get(userId);
        if (!sessionInfo) {
            throw new Error('Session not found');
        }

        console.log(`🛑 [${userId}] Stopping session...`);

        try {
            if (sessionInfo.client) {
                // Just destroy without logout to avoid file locking issues
                await sessionInfo.client.destroy();
                
                // Give time for files to be released
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.log(`⚠️ [${userId}] Error during cleanup (non-critical):`, error.message);
        }

        this.sessions.delete(userId);
        this.io.to(userId).emit('sessionStopped', { userId });
        console.log(`✅ [${userId}] Session stopped`);
    }

    async clearSession(userId) {
        const fs = require('fs').promises;
        const path = require('path');
        
        // First stop the session if it's running
        if (this.sessions.has(userId)) {
            await this.stopSession(userId);
        }

        console.log(`🗑️ [${userId}] Clearing saved session data...`);

        try {
            // Delete the saved session folder
            const sessionPath = path.join(process.cwd(), '.wwebjs_auth', `session-user_${userId}`);
            
            try {
                await fs.rm(sessionPath, { recursive: true, force: true });
                console.log(`✅ [${userId}] Session data cleared`);
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    console.log(`⚠️ [${userId}] No saved session found or already cleared`);
                }
            }

            this.io.to(userId).emit('sessionCleared', { userId });
        } catch (error) {
            console.error(`❌ [${userId}] Error clearing session:`, error.message);
            throw error;
        }
    }

    getSession(userId) {
        return this.sessions.get(userId);
    }

    getAllSessions() {
        return Array.from(this.sessions.entries()).map(([userId, info]) => ({
            userId,
            isReady: info.isReady,
            hasQR: !!info.qrCode
        }));
    }

    async cleanup() {
        console.log('🧹 Cleaning up all sessions...');
        for (const [userId, sessionInfo] of this.sessions) {
            try {
                if (sessionInfo.client) {
                    await sessionInfo.client.destroy();
                }
            } catch (error) {
                console.log(`⚠️ [${userId}] Cleanup error:`, error.message);
            }
        }
        this.sessions.clear();
    }
}

module.exports = MultiUserBotManager;
