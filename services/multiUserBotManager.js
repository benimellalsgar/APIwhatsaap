const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const AIService = require('./aiService');
const fileStorageService = require('./fileStorageService');

class MultiUserBotManager {
    constructor(io, userDataStore = null) {
        this.io = io;
        this.sessions = new Map(); // userId -> {client, config, aiService}
        this.defaultAIService = new AIService();
        this.userDataStore = userDataStore;
    }

    // Create new session for a user
    async createSession(userId, userConfig = {}) {
        if (this.sessions.has(userId)) {
            throw new Error('Session already exists for this user');
        }

        console.log(`🚀 Creating session for user: ${userId}`);
        
        // Load saved user data if available and config not provided
        if (this.userDataStore && !userConfig.businessData) {
            const savedData = await this.userDataStore.loadUserData(userId);
            if (savedData) {
                userConfig = {
                    businessData: savedData.businessData,
                    apiKey: userConfig.apiKey || savedData.apiKey
                };
                console.log(`📂 Loaded saved data for user: ${userId}`);
            }
        }
        
        if (userConfig.apiKey) {
            console.log(`🔑 User ${userId} provided their own API key`);
        }

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
                        '--disable-extensions',
                        '--no-zygote',
                        '--single-process'
                    ],
                    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
                    timeout: 60000 // 60 second timeout
                },
                webVersionCache: {
                    type: 'remote',
                    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
                }
            });

            // Create user-specific AI service with their business data
            let aiService;
            if (userConfig.businessData || userConfig.apiKey) {
                aiService = new AIService(
                    userConfig.apiKey || null,
                    userConfig.businessData || null
                );
            } else {
                aiService = this.defaultAIService;
            }

            // Store session info
            const sessionInfo = {
                client: client,
                isReady: false,
                userId: userId,
                qrCode: null,
                config: userConfig,
                aiService: aiService
            };

            this.sessions.set(userId, sessionInfo);
            this.setupEventHandlers(userId, client);
            
            // Initialize with retry logic
            this.initializeWithRetry(userId, client, 3);
            
            return sessionInfo;
        } catch (error) {
            console.error(`❌ [${userId}] Error creating session:`, error);
            this.sessions.delete(userId);
            throw error;
        }
    }

    async initializeWithRetry(userId, client, maxRetries) {
        let attempt = 0;
        
        while (attempt < maxRetries) {
            try {
                attempt++;
                console.log(`🔄 [${userId}] Initialization attempt ${attempt}/${maxRetries}`);
                
                await client.initialize();
                console.log(`✅ [${userId}] Initialized successfully`);
                return;
                
            } catch (error) {
                console.error(`❌ [${userId}] Attempt ${attempt} failed:`, error.message);
                
                if (attempt >= maxRetries) {
                    console.error(`❌ [${userId}] All attempts failed`);
                    this.sessions.delete(userId);
                    this.io.to(userId).emit('error', { 
                        userId,
                        message: 'Failed to initialize WhatsApp after multiple attempts. Please refresh and try again.',
                        error: error.message 
                    });
                    return;
                }
                
                // Wait before retry (exponential backoff)
                const waitTime = 2000 * attempt;
                console.log(`⏳ [${userId}] Waiting ${waitTime}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
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

            // Check if message has media
            let fileInfo = null;
            if (message.hasMedia) {
                console.log(`📎 [${userId}] Message contains media, downloading...`);
                
                try {
                    const media = await message.downloadMedia();
                    
                    if (media) {
                        // Save the media file
                        fileInfo = await fileStorageService.downloadWhatsAppMedia(media, userId);
                        console.log(`✅ [${userId}] Media saved: ${fileInfo.mimeType}, ${(fileInfo.size / 1024).toFixed(2)}KB`);
                        
                        // Emit to user's web interface
                        this.io.to(userId).emit('mediaReceived', {
                            userId,
                            from: senderName,
                            fileInfo: {
                                mimeType: fileInfo.mimeType,
                                size: fileInfo.size,
                                category: fileInfo.category
                            },
                            message: messageBody || '[Media file]',
                            timestamp: new Date().toISOString()
                        });
                    }
                } catch (mediaError) {
                    console.error(`❌ [${userId}] Error downloading media:`, mediaError.message);
                    // Continue processing without the media
                }
            }

            // Emit to user's web interface
            this.io.to(userId).emit('messageReceived', {
                userId,
                from: senderName,
                message: messageBody || (fileInfo ? '[Media file]' : ''),
                hasMedia: !!fileInfo,
                timestamp: new Date().toISOString()
            });

            // Typing indicator
            await chat.sendStateTyping();

            // Get user's AI service
            const sessionInfo = this.sessions.get(userId);
            const aiService = sessionInfo.aiService || this.defaultAIService;

            // Get AI response with file info if available
            const aiResponse = await aiService.generateResponse(messageBody || '', {
                senderName: senderName,
                chatId: `${userId}_${message.from}`,
                fileInfo: fileInfo
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
