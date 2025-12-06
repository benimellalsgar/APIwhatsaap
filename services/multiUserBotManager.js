const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const AIService = require('./aiService');
const fileStorageService = require('./fileStorageService');
const db = require('../database/db');

class MultiUserBotManager {
    constructor(io, userDataStore = null) {
        this.io = io;
        this.sessions = new Map(); // userId -> {client, config, aiService, tenantId}
        this.defaultAIService = new AIService();
        this.userDataStore = userDataStore;
        this.orderStates = new Map(); // customerPhone -> {orderId, state, data}
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

            // Extract tenant ID from session ID (format: tenant_123_timestamp)
            const tenantId = userId.match(/tenant_(\d+)_/)?.[1];

            // Store session info
            const sessionInfo = {
                client: client,
                isReady: false,
                userId: userId,
                qrCode: null,
                config: userConfig,
                aiService: aiService,
                tenantId: tenantId ? parseInt(tenantId) : null
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
            const customerPhone = message.from;

            console.log(`\n📩 [${userId}] From ${senderName}: ${messageBody}`);

            // Get session info
            const sessionInfo = this.sessions.get(userId);
            const aiService = sessionInfo.aiService || this.defaultAIService;
            const tenantId = sessionInfo.tenantId;

            // Check if customer has an active order in progress
            const orderState = this.orderStates.get(`${tenantId}_${customerPhone}`);
            
            if (orderState) {
                // Customer is in order flow - handle state machine
                const result = await this.handleOrderFlow(orderState, message, chat, tenantId, customerPhone, userId);
                if (result) return; // Order flow handled, exit
            }

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

            // Check if customer is requesting a file (catalog, price list, etc.)
            const fileRequest = await this.detectFileRequest(messageBody, tenantId);
            
            if (fileRequest) {
                // Customer wants a file - send it!
                try {
                    console.log(`📎 [${userId}] Sending file: ${fileRequest.file_label}`);
                    
                    const media = await MessageMedia.fromUrl(fileRequest.file_url);
                    await chat.sendMessage(media, { caption: `Here's ${fileRequest.file_label}` });
                    
                    console.log(`✅ [${userId}] File sent: ${fileRequest.file_name}`);
                    
                    // Emit to web interface
                    this.io.to(userId).emit('messageSent', {
                        userId,
                        to: senderName,
                        message: `[Sent file: ${fileRequest.file_label}]`,
                        timestamp: new Date().toISOString()
                    });
                    
                    return; // Exit - file sent, no need for AI response
                } catch (fileError) {
                    console.error(`❌ [${userId}] Error sending file:`, fileError.message);
                    // Continue to AI response if file sending fails
                }
            }

            // Get AI response with file info if available
            const aiResponse = await aiService.generateResponse(messageBody || '', {
                senderName: senderName,
                chatId: `${userId}_${message.from}`,
                fileInfo: fileInfo
            });

            // Check if AI response confirms order (AI says "confirmed", "مؤكد", etc.)
            const aiConfirmsOrder = this.detectOrderConfirmationInAIResponse(aiResponse);
            
            // Check if customer wants to purchase (confirmation keywords)
            const customerConfirms = this.detectPurchaseIntent(messageBody, aiResponse);
            
            if (customerConfirms || aiConfirmsOrder) {
                // Send AI response first
                await message.reply(aiResponse);
                console.log(`✅ [${userId}] Replied: ${aiResponse}`);
                
                // Then start order flow
                await this.initiateOrderFlow(tenantId, customerPhone, aiResponse, chat, userId);
                
                this.io.to(userId).emit('messageSent', {
                    userId,
                    to: senderName,
                    message: aiResponse,
                    timestamp: new Date().toISOString()
                });
                return;
            }

            // Send normal AI response
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

    /**
     * Detect if AI response confirms an order
     */
    detectOrderConfirmationInAIResponse(aiResponse) {
        if (!aiResponse) return false;
        const lower = aiResponse.toLowerCase();
        
        const confirmationWords = [
            'مؤكد', 'confirmed', 'confirmé', 'تأكد',
            'طلبك', 'your order', 'votre commande', 'ta commande'
        ];
        
        return confirmationWords.some(word => lower.includes(word));
    }

    /**
     * Detect if customer wants to make a purchase
     */
    detectPurchaseIntent(message, aiResponse = '') {
        if (!message) return false;
        const lower = message.toLowerCase().trim();
        
        // Exclude information requests (browsing, asking about products)
        const excludeKeywords = [
            'voir', 'savoir', 'nchouf', 'nشوف', 'afficher', 'show', 'list',
            'toute', 'tous', 'كاملين', 'kamlin', 'koulchi', 'كلشي',
            'disponible', 'متاح', 'available', 'quoi', 'what', 'شنو', 'أش'
        ];
        
        // If asking for information, don't trigger purchase
        if (excludeKeywords.some(keyword => lower.includes(keyword))) {
            return false;
        }
        
        // Simple yes/confirmation words (only if AI mentioned a product)
        const simpleConfirmations = [
            'yes', 'yeah', 'yep', 'ok', 'okay',
            'oui', 'd\'accord', 'dacor', 'dac',
            'نعم', 'أيوا', 'واخا', 'safi', 'wa5a', 'waka'
        ];
        
        // If customer says simple "yes" and AI response contains product/price
        const aiMentionsProduct = aiResponse && (
            aiResponse.includes('DH') || 
            aiResponse.includes('درهم') ||
            aiResponse.includes('price') ||
            aiResponse.includes('سعر')
        );
        
        if (simpleConfirmations.includes(lower) && aiMentionsProduct) {
            return true;
        }
        
        // Strong purchase intent keywords (must be specific)
        const strongPurchaseKeywords = [
            // English - very specific
            'i want to buy', 'i\'ll buy', 'i\'ll take it', 'i confirm', 'place order', 'i want it',
            // French - very specific
            'je veux acheter', 'je vais acheter', 'je prends', 'je confirme', 'passer commande', 'je le veux',
            // Arabic - specific purchase
            'بغيت نشري', 'غادي نشري', 'خذيت', 'تأكيد الطلب', 'أريده',
            // Darija - specific
            'bghit nechri', 'ghadi nechri', 'nakhed', 'na9bel', 'bghito'
        ];
        
        return strongPurchaseKeywords.some(keyword => lower.includes(keyword));
    }

    /**
     * Initiate order flow - send payment screenshot
     */
    async initiateOrderFlow(tenantId, customerPhone, orderDetails, chat, userId) {
        try {
            // Create order in database
            const order = await db.createOrder(tenantId, customerPhone, orderDetails);
            
            // Get payment screenshot from file library
            const paymentFile = await db.getTenantFileByLabel(tenantId, 'payment');
            
            if (paymentFile) {
                // Send payment screenshot
                const media = await MessageMedia.fromUrl(paymentFile.file_url);
                await chat.sendMessage(media, { 
                    caption: '💳 Perfect! Here\'s our payment information. Please send your payment proof after completing the transaction.' 
                });
                
                // Set order state to awaiting payment
                this.orderStates.set(`${tenantId}_${customerPhone}`, {
                    orderId: order.id,
                    state: 'awaiting_payment',
                    orderDetails: orderDetails
                });
                
                await db.updateOrder(order.id, { order_state: 'awaiting_payment' });
                
                console.log(`💳 [${userId}] Order flow started for ${customerPhone}`);
            } else {
                // No payment screenshot - ask for info directly
                await chat.sendMessage('Great! To complete your order, please provide:\n\n1. Your full name\n2. Delivery address\n3. Email (optional)');
                
                this.orderStates.set(`${tenantId}_${customerPhone}`, {
                    orderId: order.id,
                    state: 'awaiting_info',
                    orderDetails: orderDetails,
                    collectedInfo: {}
                });
                
                await db.updateOrder(order.id, { order_state: 'awaiting_info' });
            }
            
            this.io.to(userId).emit('messageSent', {
                userId,
                to: customerPhone,
                message: '[Order flow initiated]',
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('Error initiating order flow:', error);
            await chat.sendMessage('Sorry, I couldn\'t process your order. Please try again later.');
        }
    }

    /**
     * Handle order flow state machine
     */
    async handleOrderFlow(orderState, message, chat, tenantId, customerPhone, userId) {
        try {
            const { state, orderId } = orderState;
            
            if (state === 'awaiting_payment') {
                const messageText = (message.body || '').toLowerCase();
                
                // Check for payment confirmation text (without image)
                const paymentConfirmWords = [
                    'fait', 'virement', 'payé', 'envoyé', 'transféré', 
                    'done', 'paid', 'sent', 'transferred',
                    'تم', 'دفعت', 'حولت'
                ];
                
                const hasPaymentConfirmation = paymentConfirmWords.some(word => messageText.includes(word));
                
                // Check if customer sent payment proof (image)
                if (message.hasMedia) {
                    const media = await message.downloadMedia();
                    
                    if (media && media.mimetype.startsWith('image/')) {
                        // Upload payment proof to Cloudinary
                        const cloudinaryService = require('./cloudinaryService');
                        const uploadResult = await cloudinaryService.uploadFile(
                            Buffer.from(media.data, 'base64'),
                            `tenant_${tenantId}`,
                            `payment_proof_${orderId}_${Date.now()}.jpg`,
                            'image'
                        );
                        
                        // Update order with payment proof
                        await db.updateOrder(orderId, {
                            payment_proof_url: uploadResult.url,
                            payment_proof_cloudinary_id: uploadResult.publicId
                        });
                        
                        // Now ask for customer info
                        await chat.sendMessage('✅ Preuve de paiement reçue! Maintenant, merci de fournir:\n\n1. Votre nom complet\n2. Adresse de livraison\n3. Email (optionnel)\n\nVous pouvez envoyer toutes les infos en un seul message.');
                        
                        orderState.state = 'awaiting_info';
                        orderState.collectedInfo = {};
                        await db.updateOrder(orderId, { order_state: 'awaiting_info' });
                        
                        console.log(`✅ [${userId}] Payment proof received for order ${orderId}`);
                        return true;
                    }
                } else if (hasPaymentConfirmation) {
                    // Customer says they paid but no image - ask for proof
                    await chat.sendMessage('✅ Parfait! Pour finaliser, merci d\'envoyer une capture d\'écran ou photo du reçu de virement (confirmation bancaire).');
                    return true;
                }
                
                await chat.sendMessage('Merci d\'envoyer une capture d\'écran ou photo de votre preuve de paiement (reçu de virement).');
                return true;
            }
            
            if (state === 'awaiting_info') {
                // Customer is sending their info (name, address, email)
                const messageText = message.body || '';
                
                // Check if message has enough info (at least name-like content)
                if (messageText.trim().length < 5) {
                    await chat.sendMessage('Merci de fournir vos informations complètes:\n1. Nom complet\n2. Adresse de livraison\n3. Email (optionnel)');
                    return true;
                }
                
                // Simple parsing - assume customer sends all info in one message
                orderState.collectedInfo.rawText = messageText;
                
                // Try to extract email (basic pattern)
                const emailMatch = messageText.match(/[\w.-]+@[\w.-]+\.\w+/);
                if (emailMatch) {
                    orderState.collectedInfo.email = emailMatch[0];
                }
                
                // Extract name (first line or first words)
                const lines = messageText.split('\n').filter(l => l.trim());
                const customerName = lines[0] || messageText.split(' ').slice(0, 3).join(' ');
                
                // Save to database
                await db.updateOrder(orderId, {
                    customer_name: customerName.substring(0, 255),
                    customer_address: messageText.substring(0, 1000),
                    customer_email: orderState.collectedInfo.email || null
                });
                
                console.log(`📝 [${userId}] Customer info collected for order ${orderId}`);
                
                // Forward to owner
                try {
                    await this.forwardOrderToOwner(tenantId, orderId, userId, customerPhone);
                    
                    // Thank customer
                    await chat.sendMessage('✅ Merci! Votre commande a été reçue et sera traitée rapidement. Nous vous contacterons bientôt!');
                    
                    // Complete order
                    await db.completeOrder(orderId);
                    this.orderStates.delete(`${tenantId}_${customerPhone}`);
                    
                    console.log(`🎉 [${userId}] Order ${orderId} completed and forwarded to owner`);
                } catch (forwardError) {
                    console.error(`❌ [${userId}] Error forwarding order:`, forwardError);
                    await chat.sendMessage('✅ Votre commande est enregistrée! Le propriétaire sera notifié.');
                    
                    // Still complete the order even if forwarding fails
                    await db.completeOrder(orderId);
                    this.orderStates.delete(`${tenantId}_${customerPhone}`);
                }
                
                return true;
            }
            
        } catch (error) {
            console.error('Error in order flow:', error);
            await chat.sendMessage('Sorry, there was an error processing your order. Please contact support.');
            this.orderStates.delete(`${tenantId}_${customerPhone}`);
        }
        
        return false;
    }

    /**
     * Forward complete order to owner's WhatsApp
     */
    async forwardOrderToOwner(tenantId, orderId, userId, customerPhone) {
        try {
            console.log(`🔄 [${userId}] Starting order forward for order ${orderId}, tenant ${tenantId}`);
            
            // Get tenant and order info
            const tenant = await db.getTenantById(tenantId);
            console.log(`📋 [${userId}] Tenant info:`, { id: tenant?.id, name: tenant?.name, ownerNumber: tenant?.owner_whatsapp_number });
            
            const orders = await db.query('SELECT * FROM customer_orders WHERE id = $1', [orderId]);
            const order = orders.rows[0];
            console.log(`📦 [${userId}] Order info:`, { id: order?.id, customer: order?.customer_name, phone: order?.customer_phone });
            
            if (!tenant.owner_whatsapp_number) {
                console.error(`❌ [${userId}] CRITICAL: No owner WhatsApp number set for tenant ${tenantId}`);
                console.error(`❌ [${userId}] Tenant data:`, JSON.stringify(tenant));
                throw new Error('Owner WhatsApp number not configured. Please add it in dashboard settings.');
            }
            
            // Get the bot client
            const sessionInfo = this.sessions.get(userId);
            if (!sessionInfo || !sessionInfo.client) {
                console.error(`❌ [${userId}] Session not found or client missing`);
                throw new Error('WhatsApp session not found');
            }
            
            const client = sessionInfo.client;
            
            // Format owner number correctly (should already be in format: 212600000000@c.us)
            let ownerNumber = tenant.owner_whatsapp_number;
            if (!ownerNumber.includes('@')) {
                ownerNumber = `${ownerNumber}@c.us`;
            }
            
            console.log(`📤 [${userId}] Forwarding order ${orderId} to owner: ${ownerNumber}`);
            
            // Build order summary message
            let orderMessage = `🛒 *NOUVELLE COMMANDE REÇUE*\n\n`;
            orderMessage += `📱 Client: ${customerPhone.replace('@c.us', '')}\n`;
            orderMessage += `👤 Nom: ${order.customer_name || 'Non fourni'}\n`;
            orderMessage += `📧 Email: ${order.customer_email || 'Non fourni'}\n`;
            orderMessage += `📍 Adresse:\n${order.customer_address || 'Non fournie'}\n\n`;
            orderMessage += `📝 Détails commande:\n${order.order_details || 'Voir conversation'}\n\n`;
            orderMessage += `📅 Order Date: ${order.created_at}\n`;
            orderMessage += `🆔 Order ID: #${order.id}`;
            
            // Send message to owner
            await client.sendMessage(ownerNumber, orderMessage);
            console.log(`✅ [${userId}] Order details sent to owner: ${ownerNumber}`);
            
            // Send payment proof if available
            if (order.payment_proof_url) {
                const media = await MessageMedia.fromUrl(order.payment_proof_url);
                await client.sendMessage(ownerNumber, media, { caption: '💳 Payment Proof' });
                console.log(`✅ [${userId}] Payment proof sent to owner`);
            }
            
            // Emit to web interface
            this.io.to(userId).emit('orderForwarded', {
                userId,
                orderId: order.id,
                ownerNumber: tenant.owner_whatsapp_number,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('Error forwarding order to owner:', error);
            throw error;
        }
    }

    /**
     * Detect if customer is requesting a file
     * @param {string} message - Customer message
     * @param {number} tenantId - Tenant ID
     * @returns {Promise<Object|null>} File record or null
     */
    async detectFileRequest(message, tenantId) {
        if (!tenantId || !message) return null;

        const lowerMessage = message.toLowerCase();
        
        // Common keywords for file requests (multilingual)
        const fileKeywords = [
            'catalog', 'catalogue', 'كتالوج', 'كاتالوج',
            'price', 'prix', 'سعر', 'أسعار', 'ثمن',
            'menu', 'قائمة', 'منيو',
            'pdf', 'image', 'photo', 'صورة',
            'send', 'show', 'أرسل', 'أعطني', 'وريني',
            'list', 'قائمة', 'ليست'
        ];

        const hasKeyword = fileKeywords.some(keyword => lowerMessage.includes(keyword));
        
        if (!hasKeyword) return null;

        try {
            // Get all files for this tenant
            const files = await db.getTenantFiles(tenantId);
            
            if (files.length === 0) return null;

            // Try to match file label with message
            for (const file of files) {
                const label = file.file_label.toLowerCase();
                if (lowerMessage.includes(label)) {
                    return file;
                }
            }

            // If no specific match, return first catalog/price list file
            const catalogFile = files.find(f => 
                f.file_label.toLowerCase().includes('catalog') || 
                f.file_label.toLowerCase().includes('catalogue') ||
                f.file_label.toLowerCase().includes('كتالوج') ||
                f.file_label.toLowerCase().includes('price') ||
                f.file_label.toLowerCase().includes('prix')
            );

            return catalogFile || files[0]; // Return first file as fallback

        } catch (error) {
            console.error('Error detecting file request:', error);
            return null;
        }
    }

    async stopSession(userId) {
        console.log(`🛑 [${userId}] stopSession called`);
        
        const sessionInfo = this.sessions.get(userId);
        if (!sessionInfo) {
            console.log(`❌ [${userId}] Session not found in sessions Map`);
            throw new Error('Session not found');
        }

        console.log(`🛑 [${userId}] Session found, proceeding to stop...`);

        try {
            if (sessionInfo.client) {
                console.log(`🛑 [${userId}] Destroying client...`);
                await sessionInfo.client.destroy();
                console.log(`✅ [${userId}] Client destroyed`);
                
                // Give time for files to be released
                await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
                console.log(`⚠️ [${userId}] No client found in session`);
            }
        } catch (error) {
            console.log(`⚠️ [${userId}] Error during cleanup (non-critical):`, error.message);
        }

        console.log(`🗑️ [${userId}] Deleting session from Map...`);
        this.sessions.delete(userId);
        
        console.log(`📡 [${userId}] Emitting sessionStopped event...`);
        this.io.to(userId).emit('sessionStopped', { userId });
        
        console.log(`✅ [${userId}] Session stopped successfully`);
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
