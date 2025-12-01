const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const AIService = require('./services/aiService');
require('dotenv').config();

class WhatsAppBot {
    constructor() {
        this.client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        });

        this.aiService = new AIService();
        this.initializeEvents();
    }

    initializeEvents() {
        // QR Code Generation
        this.client.on('qr', (qr) => {
            console.log('📱 Scan this QR code with WhatsApp:');
            qrcode.generate(qr, { small: true });
        });

        // Ready Event
        this.client.on('ready', () => {
            console.log('✅ WhatsApp Bot is ready!');
            console.log('🤖 AI Agent is listening for messages...');
        });

        // Message Handler
        this.client.on('message', async (message) => {
            await this.handleMessage(message);
        });

        // Disconnected Event
        this.client.on('disconnected', (reason) => {
            console.log('❌ WhatsApp Bot disconnected:', reason);
        });

        // Authentication Events
        this.client.on('authenticated', () => {
            console.log('🔐 Authentication successful!');
        });

        this.client.on('auth_failure', (message) => {
            console.error('❌ Authentication failed:', message);
        });
    }

    async handleMessage(message) {
        try {
            // Ignore messages from status broadcast
            if (message.from === 'status@broadcast') {
                return;
            }

            // Get message info
            const contact = await message.getContact();
            const chat = await message.getChat();
            const messageBody = message.body;

            console.log(`\n📩 Message from ${contact.name || contact.pushname}: ${messageBody}`);

            // Ignore own messages
            if (message.fromMe) {
                return;
            }

            // Show typing indicator
            await chat.sendStateTyping();

            // Get AI response
            const aiResponse = await this.aiService.generateResponse(messageBody, {
                senderName: contact.name || contact.pushname,
                chatId: chat.id._serialized
            });

            // Send response
            await message.reply(aiResponse);
            console.log(`✅ Replied: ${aiResponse}`);

        } catch (error) {
            console.error('❌ Error handling message:', error);
            
            // Send error message to user
            try {
                await message.reply('Sorry, I encountered an error processing your message. Please try again.');
            } catch (replyError) {
                console.error('Failed to send error message:', replyError);
            }
        }
    }

    start() {
        console.log('🚀 Starting WhatsApp AI Bot...');
        this.client.initialize();
    }
}

// Start the bot
const bot = new WhatsAppBot();
bot.start();

// Handle process termination
process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down bot...');
    await bot.client.destroy();
    process.exit(0);
});
