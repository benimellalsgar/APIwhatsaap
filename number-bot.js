const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const AIService = require('./services/aiService');
const readline = require('readline');
require('dotenv').config();

class WhatsAppBotWithNumbers {
    constructor() {
        this.client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        });

        this.aiService = new AIService();
        this.isReady = false;
        this.allowedNumbers = new Set();
        this.initializeEvents();
        this.setupCLI();
    }

    initializeEvents() {
        // QR Code
        this.client.on('qr', (qr) => {
            console.log('\n📱 Scan this QR code with YOUR WhatsApp (bot account):\n');
            qrcode.generate(qr, { small: true });
            console.log('\n');
        });

        // Ready
        this.client.on('ready', () => {
            console.log('✅ Bot is ready!');
            console.log('🤖 Bot will respond to messages from allowed numbers\n');
            this.isReady = true;
            this.showMenu();
        });

        // Messages
        this.client.on('message', async (message) => {
            await this.handleMessage(message);
        });

        // Auth
        this.client.on('authenticated', () => {
            console.log('🔐 Authenticated');
        });

        this.client.on('auth_failure', (msg) => {
            console.error('❌ Auth failed:', msg);
        });
    }

    setupCLI() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        this.rl.on('line', (input) => {
            this.handleCommand(input.trim());
        });
    }

    showMenu() {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📋 COMMANDS:');
        console.log('  add <number>     - Add number (e.g., add 1234567890)');
        console.log('  remove <number>  - Remove number');
        console.log('  list             - Show allowed numbers');
        console.log('  send <number> <message> - Send message to number');
        console.log('  all              - Allow ALL numbers (open mode)');
        console.log('  help             - Show this menu');
        console.log('  exit             - Exit bot');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        process.stdout.write('> ');
    }

    handleCommand(input) {
        const [cmd, ...args] = input.split(' ');

        switch(cmd.toLowerCase()) {
            case 'add':
                this.addNumber(args[0]);
                break;
            case 'remove':
                this.removeNumber(args[0]);
                break;
            case 'list':
                this.listNumbers();
                break;
            case 'send':
                this.sendMessage(args[0], args.slice(1).join(' '));
                break;
            case 'all':
                this.allowAll();
                break;
            case 'help':
                this.showMenu();
                return;
            case 'exit':
                this.shutdown();
                return;
            default:
                if (input) {
                    console.log('❌ Unknown command. Type "help" for commands');
                }
        }
        process.stdout.write('> ');
    }

    addNumber(number) {
        if (!number) {
            console.log('❌ Please provide a number: add 1234567890');
            return;
        }
        
        // Clean number (remove spaces, dashes, etc)
        const cleanNumber = number.replace(/[^\d]/g, '');
        
        if (cleanNumber.length < 8) {
            console.log('❌ Invalid number format');
            return;
        }

        this.allowedNumbers.add(cleanNumber);
        console.log(`✅ Added: ${cleanNumber}`);
        console.log(`   WhatsApp format: ${cleanNumber}@c.us`);
    }

    removeNumber(number) {
        if (!number) {
            console.log('❌ Please provide a number');
            return;
        }
        
        const cleanNumber = number.replace(/[^\d]/g, '');
        
        if (this.allowedNumbers.delete(cleanNumber)) {
            console.log(`✅ Removed: ${cleanNumber}`);
        } else {
            console.log(`❌ Number not found: ${cleanNumber}`);
        }
    }

    listNumbers() {
        if (this.allowedNumbers.size === 0) {
            console.log('📋 No numbers added yet');
            console.log('   Use: add <number>');
        } else if (this.allowedNumbers.has('*')) {
            console.log('📋 Mode: OPEN (all numbers allowed)');
        } else {
            console.log('📋 Allowed numbers:');
            this.allowedNumbers.forEach(num => {
                console.log(`   • ${num}`);
            });
        }
    }

    allowAll() {
        this.allowedNumbers.clear();
        this.allowedNumbers.add('*');
        console.log('✅ Open mode: Bot will respond to ALL numbers');
        console.log('⚠️  Warning: This allows anyone to use the bot');
    }

    async sendMessage(number, message) {
        if (!this.isReady) {
            console.log('❌ Bot not ready yet');
            return;
        }

        if (!number || !message) {
            console.log('❌ Usage: send <number> <message>');
            return;
        }

        try {
            const cleanNumber = number.replace(/[^\d]/g, '');
            const chatId = `${cleanNumber}@c.us`;
            
            await this.client.sendMessage(chatId, message);
            console.log(`✅ Sent to ${cleanNumber}: ${message}`);
        } catch (error) {
            console.log(`❌ Failed to send: ${error.message}`);
        }
    }

    async handleMessage(message) {
        try {
            // Ignore status and own messages
            if (message.from === 'status@broadcast' || message.fromMe) {
                return;
            }

            // Extract number from message.from (format: 1234567890@c.us)
            const senderNumber = message.from.split('@')[0];
            
            // Check if number is allowed
            const isAllowed = this.allowedNumbers.has('*') || 
                            this.allowedNumbers.has(senderNumber);

            if (!isAllowed) {
                console.log(`🚫 Ignored message from ${senderNumber} (not in allowed list)`);
                return;
            }

            const chat = await message.getChat();
            const messageBody = message.body;
            const senderName = message._data.notifyName || senderNumber;

            console.log(`\n📩 From ${senderName} (${senderNumber}): ${messageBody}`);

            // Typing indicator
            await chat.sendStateTyping();

            // Get AI response
            const aiResponse = await this.aiService.generateResponse(messageBody, {
                senderName: senderName,
                chatId: message.from
            });

            // Send response
            await message.reply(aiResponse);
            console.log(`✅ Replied: ${aiResponse}\n`);
            process.stdout.write('> ');

        } catch (error) {
            console.error('❌ Error:', error.message);
            try {
                await message.reply('Sorry, I encountered an error. Please try again.');
            } catch (e) {}
        }
    }

    start() {
        console.log('🚀 Starting WhatsApp AI Bot with Number Control\n');
        this.client.initialize();
    }

    async shutdown() {
        console.log('\n👋 Shutting down...');
        this.rl.close();
        await this.client.destroy();
        process.exit(0);
    }
}

// Start bot
const bot = new WhatsAppBotWithNumbers();
bot.start();

// Handle Ctrl+C
process.on('SIGINT', async () => {
    await bot.shutdown();
});
