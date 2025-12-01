const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const AIService = require('./services/aiService');
require('dotenv').config();

class MultiAccountBot {
    constructor() {
        this.sessions = new Map();
        this.aiService = new AIService();
    }

    createSession(sessionId) {
        if (this.sessions.has(sessionId)) {
            console.log(`⚠️  Session ${sessionId} already exists`);
            return;
        }

        console.log(`\n🚀 Creating session: ${sessionId}`);

        const client = new Client({
            authStrategy: new LocalAuth({
                clientId: sessionId
            }),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        });

        // QR Code
        client.on('qr', (qr) => {
            console.log(`\n📱 [${sessionId}] Scan this QR code:\n`);
            qrcode.generate(qr, { small: true });
            console.log('\n');
        });

        // Ready
        client.on('ready', () => {
            console.log(`✅ [${sessionId}] WhatsApp connected and ready!`);
        });

        // Messages
        client.on('message', async (message) => {
            await this.handleMessage(sessionId, message);
        });

        // Disconnected
        client.on('disconnected', (reason) => {
            console.log(`❌ [${sessionId}] Disconnected:`, reason);
            this.sessions.delete(sessionId);
        });

        // Auth success
        client.on('authenticated', () => {
            console.log(`🔐 [${sessionId}] Authenticated`);
        });

        // Auth failure
        client.on('auth_failure', (msg) => {
            console.error(`❌ [${sessionId}] Auth failed:`, msg);
        });

        this.sessions.set(sessionId, client);
        client.initialize();
    }

    async handleMessage(sessionId, message) {
        try {
            // Ignore status and own messages
            if (message.from === 'status@broadcast' || message.fromMe) {
                return;
            }

            const chat = await message.getChat();
            const messageBody = message.body;
            const senderName = message._data.notifyName || message.from.split('@')[0];

            console.log(`\n📩 [${sessionId}] From ${senderName}: ${messageBody}`);

            // Typing indicator
            await chat.sendStateTyping();

            // Get AI response
            const aiResponse = await this.aiService.generateResponse(messageBody, {
                senderName: senderName,
                chatId: `${sessionId}_${message.from}`
            });

            // Send response
            await message.reply(aiResponse);
            console.log(`✅ [${sessionId}] Replied: ${aiResponse}`);

        } catch (error) {
            console.error(`❌ [${sessionId}] Error:`, error.message);
            try {
                await message.reply('Sorry, I encountered an error. Please try again.');
            } catch (e) {}
        }
    }

    removeSession(sessionId) {
        const client = this.sessions.get(sessionId);
        if (client) {
            client.destroy();
            this.sessions.delete(sessionId);
            console.log(`🗑️  Session ${sessionId} removed`);
        }
    }

    async cleanup() {
        console.log('\n🧹 Cleaning up all sessions...');
        for (const [sessionId, client] of this.sessions) {
            await client.destroy();
        }
        this.sessions.clear();
    }
}

// Main
const bot = new MultiAccountBot();

// Read session names from command line or use defaults
const sessions = process.env.SESSIONS ? process.env.SESSIONS.split(',') : ['account1', 'account2', 'account3'];

console.log('🤖 Multi-Account WhatsApp AI Bot');
console.log('================================\n');
console.log(`Starting ${sessions.length} session(s):`);
sessions.forEach(s => console.log(`  - ${s}`));
console.log('\n');

// Create all sessions
sessions.forEach(sessionId => {
    setTimeout(() => {
        bot.createSession(sessionId.trim());
    }, 1000); // Small delay between sessions
});

// Handle shutdown
process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down...');
    await bot.cleanup();
    process.exit(0);
});
