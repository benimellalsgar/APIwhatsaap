const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const AIService = require('./aiService');

class WhatsAppBotManager {
    constructor(io) {
        this.io = io;
        this.client = null;
        this.aiService = new AIService();
        this.sessionActive = false;
        this.isClientReady = false;
        this.currentQR = null;
    }

    isSessionActive() {
        return this.sessionActive;
    }

    isReady() {
        return this.isClientReady;
    }

    hasQRCode() {
        return this.currentQR !== null;
    }

    startSession() {
        if (this.sessionActive) {
            throw new Error('Session already active');
        }

        console.log('🚀 Starting new WhatsApp session...');
        this.sessionActive = true;
        this.isClientReady = false;
        this.currentQR = null;

        // Create new WhatsApp client
        this.client = new Client({
            authStrategy: new LocalAuth({
                clientId: 'web-session'
            }),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        });

        this.setupEventHandlers();
        this.client.initialize();

        // Emit session started
        this.io.emit('sessionStarted');
    }

    setupEventHandlers() {
        // QR Code Generation
        this.client.on('qr', async (qr) => {
            console.log('📱 QR Code generated');
            this.currentQR = qr;

            // Generate QR code as data URL
            try {
                const qrDataURL = await qrcode.toDataURL(qr);
                this.io.emit('qr', { qrCode: qrDataURL });
            } catch (error) {
                console.error('Error generating QR code:', error);
            }
        });

        // Ready Event
        this.client.on('ready', () => {
            console.log('✅ WhatsApp Bot is ready!');
            this.isClientReady = true;
            this.currentQR = null;
            this.io.emit('ready', { 
                message: 'Bot is ready! You can now receive and send messages.' 
            });
        });

        // Message Handler
        this.client.on('message', async (message) => {
            await this.handleMessage(message);
        });

        // Disconnected Event
        this.client.on('disconnected', (reason) => {
            console.log('❌ WhatsApp Bot disconnected:', reason);
            this.sessionActive = false;
            this.isClientReady = false;
            this.io.emit('disconnected', { reason });
        });

        // Authentication Events
        this.client.on('authenticated', () => {
            console.log('🔐 Authentication successful!');
            this.io.emit('authenticated');
        });

        this.client.on('auth_failure', (message) => {
            console.error('❌ Authentication failed:', message);
            this.sessionActive = false;
            this.io.emit('authFailure', { error: message });
        });
    }

    async handleMessage(message) {
        try {
            // Ignore messages from status broadcast
            if (message.from === 'status@broadcast') {
                return;
            }

            // Ignore own messages
            if (message.fromMe) {
                return;
            }

            // Get message info - using safer methods
            const chat = await message.getChat();
            const messageBody = message.body;
            
            // Get sender info from message object directly (more reliable)
            const senderName = message._data.notifyName || message.from.split('@')[0];
            const chatId = message.from;

            console.log(`\n📩 Message from ${senderName}: ${messageBody}`);

            // Emit to web interface
            this.io.emit('messageReceived', {
                from: senderName,
                message: messageBody,
                timestamp: new Date().toISOString()
            });

            // Show typing indicator
            await chat.sendStateTyping();

            // Get AI response
            const aiResponse = await this.aiService.generateResponse(messageBody, {
                senderName: senderName,
                chatId: chatId
            });

            // Send response
            await message.reply(aiResponse);
            console.log(`✅ Replied: ${aiResponse}`);

            // Emit to web interface
            this.io.emit('messageSent', {
                to: senderName,
                message: aiResponse,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ Error handling message:', error);
            
            // Send error message to user
            try {
                await message.reply('Sorry, I encountered an error processing your message. Please try again.');
            } catch (replyError) {
                console.error('Failed to send error message:', replyError);
            }

            // Emit error to web interface
            this.io.emit('error', { 
                message: 'Error processing message',
                error: error.message 
            });
        }
    }

    async stopSession() {
        if (!this.sessionActive) {
            throw new Error('No active session to stop');
        }

        console.log('🛑 Stopping session...');

        if (this.client) {
            await this.client.destroy();
            this.client = null;
        }

        this.sessionActive = false;
        this.isClientReady = false;
        this.currentQR = null;

        this.io.emit('sessionStopped');
        console.log('✅ Session stopped');
    }

    async cleanup() {
        if (this.sessionActive && this.client) {
            await this.client.destroy();
        }
    }
}

module.exports = WhatsAppBotManager;
