const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

class AIService {
    constructor(customApiKey = null, businessData = null) {
        // Determine which AI provider to use
        this.provider = process.env.AI_PROVIDER || 'perplexity';
        
        // Use custom API key if provided, otherwise fall back to env
        const apiKey = customApiKey || process.env.PERPLEXITY_API_KEY || 'dummy-key';
        
        if (this.provider === 'claude') {
            this.anthropic = new Anthropic({
                apiKey: customApiKey || process.env.ANTHROPIC_API_KEY || 'dummy-key'
            });
        } else if (this.provider === 'perplexity') {
            this.openai = new OpenAI({
                apiKey: apiKey,
                baseURL: 'https://api.perplexity.ai'
            });
        } else {
            this.openai = new OpenAI({
                apiKey: customApiKey || process.env.OPENAI_API_KEY || 'dummy-key'
            });
        }

        this.conversationHistory = new Map();
        this.maxHistoryLength = 4; // 4 exchanges = 8 messages
        this.isCustom = !!customApiKey;
        this.businessData = businessData; // Store user's business data
        
        // Warn if API keys are missing (only for default service)
        if (!customApiKey && !process.env.PERPLEXITY_API_KEY && this.provider === 'perplexity') {
            console.warn('⚠️ PERPLEXITY_API_KEY is not set. Bot will not work properly.');
        }
        
        // Memory management: Clean old conversations every 30 minutes
        setInterval(() => this.cleanOldConversations(), 1800000);
    }
    
    /**
     * Clean conversations that haven't been used in 1 hour
     */
    cleanOldConversations() {
        const oldSize = this.conversationHistory.size;
        
        // In production, you'd track last access time per conversation
        // For now, clear all if too many conversations
        if (this.conversationHistory.size > 1000) {
            this.conversationHistory.clear();
            console.log(`🧹 [AI] Cleared ${oldSize} old conversations to free memory`);
        }
    }

    /**
     * Generate AI response with file/media support (including image vision)
     * @param {string} message - User's message
     * @param {object} context - Additional context (senderName, chatId, fileInfo, imageData, etc.)
     * @returns {Promise<string>} AI generated response
     */
    async generateResponse(message, context = {}) {
        try {
            const { senderName, chatId, imageData } = context;

            // Get or initialize conversation history for this chat
            if (!this.conversationHistory.has(chatId)) {
                this.conversationHistory.set(chatId, []);
            }

            const history = this.conversationHistory.get(chatId);

            // Ensure messages alternate properly (fix if last message was also user)
            if (history.length > 0 && history[history.length - 1].role === 'user') {
                // Remove the last user message to maintain alternation
                history.pop();
            }
            
            // Memory optimization: Limit history to prevent memory bloat
            // Keep only recent exchanges (reduced from maxHistoryLength * 2)
            const MAX_HISTORY_MESSAGES = this.maxHistoryLength * 2; // 8 messages (4 exchanges)
            if (history.length > MAX_HISTORY_MESSAGES) {
                // Remove oldest messages, keep most recent
                const removeCount = history.length - MAX_HISTORY_MESSAGES;
                history.splice(0, removeCount);
                console.log(`🧹 [AI] Trimmed ${removeCount} old messages from history`);
            }

            // Build message content - handle images with vision
            let userContent;
            
            if (imageData && this.provider === 'openai' && imageData.base64) {
                // Validate image data
                const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
                
                if (!validImageTypes.includes(imageData.mimetype)) {
                    console.warn(`⚠️ [Vision] Unsupported image type: ${imageData.mimetype}`);
                    userContent = message || "Sorry, I can only analyze JPEG, PNG, GIF, and WebP images.";
                } else {
                    // OpenAI Vision format - analyze image
                    console.log(`🖼️ [Vision] Processing ${imageData.mimetype} image with OpenAI Vision API`);
                    console.log(`   Image size: ${(imageData.base64.length / 1024).toFixed(2)} KB`);
                    
                    // Prepare vision request with strict quality settings
                    userContent = [
                        {
                            type: "text",
                            text: message || "Analyze this image carefully and describe what you see. If it's a payment proof, extract amount and date. If it's a product, identify it. Be precise and accurate."
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:${imageData.mimetype};base64,${imageData.base64}`,
                                detail: "high" // High detail for maximum accuracy - critical for payment proofs
                            }
                        }
                    ];
                    console.log('✓ [Vision] Image prepared for analysis with HIGH detail mode');
                }
            } else if (imageData && this.provider !== 'openai') {
                // Vision not supported for this provider
                console.warn(`⚠️ [Vision] Image sent but provider '${this.provider}' does not support vision`);
                userContent = message || "I received your image, but I cannot analyze images with the current AI provider. Please describe what you need.";
            } else if (context.fileInfo) {
                // Regular file (not image or no vision support)
                const fileDescription = await this.describeFile(context.fileInfo);
                userContent = `${message}\n\n[File attached: ${fileDescription}]`;
            } else {
                // Text only
                userContent = message;
            }
            
            // Add user message to history
            history.push({
                role: 'user',
                content: userContent
            });

            // Keep only recent messages
            if (history.length > this.maxHistoryLength * 2) {
                history.shift();
                history.shift();
            }

            let aiResponse;

            if (this.provider === 'claude') {
                // Use Claude API
                const response = await this.anthropic.messages.create({
                    model: process.env.AI_MODEL || 'claude-3-5-sonnet-20241022',
                    max_tokens: parseInt(process.env.MAX_TOKENS) || 1024,
                    system: this.getSystemPrompt(senderName, context),
                    messages: history
                });

                aiResponse = response.content[0].text;

            } else {
                // Use OpenAI API (or Perplexity)
                const messages = [
                    {
                        role: 'system',
                        content: this.getSystemPrompt(senderName, context)
                    },
                    ...history
                ];

                const requestBody = {
                    model: process.env.AI_MODEL || 'gpt-3.5-turbo',
                    messages: messages,
                    max_tokens: parseInt(process.env.MAX_TOKENS) || 500,
                    temperature: parseFloat(process.env.TEMPERATURE) || 0.7,
                };

                // Disable search for Perplexity to get conversational responses
                if (this.provider === 'perplexity') {
                    requestBody.return_citations = false;
                    requestBody.return_images = false;
                }

                // For vision models, increase max tokens for better image analysis
                if (imageData && (requestBody.model.includes('gpt-4') || requestBody.model.includes('gpt-4o'))) {
                    console.log('🖼️ [Vision] Using vision-capable model:', requestBody.model);
                    requestBody.max_tokens = Math.max(requestBody.max_tokens, 800); // Ensure enough tokens for image analysis
                }

                console.log(`🤖 [AI] Calling ${this.provider} API with model: ${requestBody.model}`);
                const completion = await this.openai.chat.completions.create(requestBody);
                console.log(`✅ [AI] Response received (${completion.choices[0].finish_reason})`);

                aiResponse = completion.choices[0].message.content;
            }

            // Add AI response to history
            history.push({
                role: 'assistant',
                content: aiResponse
            });

            return aiResponse;

        } catch (error) {
            console.error('❌ [AI] Error generating response:', error);
            
            if (error.code === 'insufficient_quota' || error.error?.type === 'insufficient_quota') {
                return 'Sorry, the AI service quota has been exceeded. Please contact the administrator.';
            }
            
            if (error.code === 'invalid_api_key' || error.status === 401) {
                return 'Sorry, there is a configuration issue. Please contact the administrator.';
            }

            // Vision-specific errors
            if (imageData && error.message) {
                if (error.message.includes('image') || error.message.includes('vision')) {
                    console.error('❌ [Vision] Image processing error:', error.message);
                    return 'Sorry, I could not analyze the image. Please try sending it again or describe what you need.';
                }
                
                if (error.message.includes('size') || error.message.includes('large')) {
                    console.error('❌ [Vision] Image too large:', error.message);
                    return 'The image is too large. Please send a smaller image (under 20MB).';
                }
            }

            return 'Sorry, I am having trouble processing your request right now. Please try again later.';
        }
    }

    /**
     * Get system prompt for AI
     * @param {string} senderName - Name of the person chatting
     * @param {object} context - Additional context (botMode, modeContext)
     * @returns {string} System prompt
     */
    getSystemPrompt(senderName, context = {}) {
        const { botMode = 'conversational', modeContext = '' } = context;
        
        // Use user's custom business data if provided, otherwise use default
        const productData = this.businessData || `
PRODUCTS/SERVICES YOU SELL:

1. WA Sender/WA CRM - إرسال رسائل جماعية
   - WA CRM: 70 DH مدى الحياة
   - WA Sender: 150 DH مدى الحياة
   - تفعيل فوري، نحتاج الإيميل

2. Adobe Creative Cloud - كل البرامج
   - ابتداء من 80 DH ل 3 أشهر
   - تفعيل EDU أصلي، نحتاج الإيميل

3. AI Services:
   - ChatGPT Plus: 100 DH شهر واحد
   - ChatGPT Pro: 200 DH شهر واحد
   - Perplexity Pro: 50 DH سنة كاملة
   - Gemini Pro: 100 DH سنة كاملة
   - تفعيل فوري، نحتاج الإيميل

4. CapCut Pro: 80 DH شهر واحد، نحتاج الإيميل

5. Canva Pro: 20 DH مدى الحياة، نحتاج الإيميل

6. LinkedIn Premium: 150 DH ل 3 أشهر، نحتاج الإيميل

7. Windows + Office: 99 DH تفعيل أصلي فوري
`;

        // Mode-specific system prompts
        if (botMode === 'conversational') {
            return `${modeContext}

You are a helpful AI assistant. Answer questions naturally, provide information, and have helpful conversations.

RULES:
✓ Answer questions clearly and helpfully
✓ Be conversational and friendly
✓ Provide accurate information
✓ ALWAYS reply in customer's language (English, French, Arabic, Darija)
✓ Keep responses concise but complete
✓ If you don't know something, admit it honestly
✓ NO SALES - Don't try to sell products or take orders
✓ IMAGE ANALYSIS - Analyze images if sent and describe what you see accurately

EXAMPLES:

Customer: "What is photosynthesis?" → You: "Photosynthesis is the process plants use to convert sunlight into energy..."
Customer: "السلام عليكم" → You: "و عليكم السلام! كيف يمكنني مساعدتك؟"
Customer: "Quelle heure est-il?" → You: "Je n'ai pas accès à l'heure actuelle. Puis-je vous aider avec autre chose?"
Customer: [sends image] → You: "I can see [describe image]. How can I help you with this?"

Customer name: ${senderName}`;
        }
        
        if (botMode === 'appointment') {
            return `${modeContext}

You are an appointment booking assistant. Help customers schedule appointments, check availability, and answer service questions.

RULES:
✓ Help book, reschedule, or cancel appointments
✓ Ask for: Date, Time, Service Type, Name, Phone
✓ Be professional and efficient
✓ ALWAYS reply in customer's language
✓ Confirm all appointment details clearly
✓ Check availability before confirming

EXAMPLES:

Customer: "I need an appointment" → You: "I'd be happy to help! What service do you need and what date works for you?"
Customer: "Je voudrais prendre rendez-vous" → You: "Avec plaisir! Quel service vous intéresse et pour quelle date?"
Customer: "بغيت موعد" → You: "مرحبا! شنو الخدمة اللي بغيتي و أشمن نهار يناسبك?"

Customer name: ${senderName}`;
        }
        
        if (botMode === 'delivery') {
            return `${modeContext}

You are a delivery tracking assistant. Help customers track packages, provide updates, and answer shipping questions.

RULES:
✓ Help track orders with tracking numbers
✓ Provide delivery status updates
✓ Answer shipping questions
✓ ALWAYS reply in customer's language
✓ Be clear and reassuring
✓ Estimate delivery times when available

EXAMPLES:

Customer: "Where is my package?" → You: "I'll help you track it! Do you have your tracking number?"
Customer: "أين طلبي؟" → You: "غادي نعاونك تتبع طلبك! عندك رقم التتبع؟"
Customer: "Mon colis?" → You: "Je vais vous aider! Avez-vous votre numéro de suivi?"

Customer name: ${senderName}`;
        }

        // E-commerce mode (original)
        return `You are a professional WhatsApp sales assistant for a business. Your ONLY job is to help customers buy products/services.

YOUR PRODUCTS/SERVICES:
${productData}

🚫 ABSOLUTE STRICT RULES - YOU MUST OBEY:
❌ NEVER answer questions about general knowledge, definitions, explanations
❌ NEVER discuss anything except YOUR products listed above
❌ NEVER give descriptions or information about topics outside your products
❌ NEVER act helpful for non-sales questions
❌ If question is NOT about buying your products → REFUSE IMMEDIATELY

✅ YOUR ONLY JOB - SALES ONLY:
✓ Answer ONLY about products you sell (listed above)
✓ Give prices, features, delivery for YOUR products ONLY
✓ Take orders and collect customer emails
✓ REFUSE everything else - no exceptions

⚠️ CRITICAL SALES-ONLY RULES:
1. **REFUSE OFF-TOPIC INSTANTLY** - Any question not about buying your products → Say: "I only help with purchases. Need anything from our products?"
2. **NO DESCRIPTIONS/DEFINITIONS** - Customer asks "what is X?" → Only answer if X is YOUR product. Otherwise refuse.
3. **NO GENERAL HELP** - Customer asks general question → Refuse and redirect to products
4. **STAY TRANSACTIONAL** - Your ONLY purpose: help customers BUY your products
5. **ALWAYS reply in customer's language** (English, French, Arabic, Darija)
6. **COMPLETE but FOCUSED answers** - Give full product details (price, features, delivery) but ONLY for YOUR products. 2-3 sentences when needed.
7. **ACCURATE prices** - Only mention products/prices from YOUR list above
8. **IMAGE ANALYSIS (VISION)** - When customer sends image:
   - Analyze image content carefully and accurately
   - If image shows payment proof: Read amount, date, transaction details → Confirm receipt
   - If image shows product: Identify it → Match with YOUR products if available → Offer for sale
   - If unclear/blurry image: Ask customer to resend clearer photo
   - If image unrelated to your business: Politely redirect to products
   - ALWAYS respond in customer's language about what you see
   - Be PRECISE and ACCURATE with image analysis - no guessing
8. **Confirm emails exactly** as customer writes them
9. **Professional tone** - polite, helpful for sales, cold for off-topic
10. **Zero tolerance** for off-topic - refuse immediately, redirect to sales
11. **LIST ALL PRODUCTS** - When customer asks for "all products", "toute les produits", "كاملين", "koulchi" → List EVERY product from YOUR catalog with prices
12. **STRICT FILE MATCHING** - When customer asks for specific product (e.g., "iPhone photo"), ONLY send files with EXACT product name in label. NEVER send wrong product files (e.g., don't send Samsung when asked for iPhone)

QUALITY STANDARDS:
✓ Perfect spelling in all languages
✓ Correct grammar and sentence structure  
✓ Accurate prices and product details
✓ COMPLETE information - don't skip important details about YOUR products
✓ Professional, helpful tone for product questions
✓ Cold, brief tone for off-topic questions (5 words max)
✓ 2-3 sentences for product questions (give full details)
✓ REFUSE off-topic instantly - no descriptions, no explanations

✅ GOOD EXAMPLES - COMPLETE PRODUCT ANSWERS:

English:
Customer: "Hi" → You: "Hello! How can I help you today? 😊"
Customer: "Do you have iPhone?" → You: "Yes! iPhone 15 Pro available for 12,000 DH with 1-year warranty included. Delivery: 50 DH in Casablanca (1-2 days), 100 DH other cities (2-3 days). Would you like it?"
Customer: "Yes" → You: "Perfect! Your email please so I can proceed with the order."
Customer: "john@gmail.com" → You: "Excellent! Got it: john@gmail.com. Your order is confirmed. Anything else you need?"
Customer: "Tell me about ChatGPT" → You: "We have ChatGPT Plus for 100 DH/month (instant activation). Want it?"

Darija (Moroccan):
Customer: "السلام" → You: "و عليكم السلام! كيف نقدر نعاونك؟ 😊"
Customer: "عندك iPhone?" → You: "نعم! iPhone 15 Pro متوفر ب 12,000 درهم مع ضمان سنة. التوصيل: 50 درهم كازا (1-2 أيام)، 100 درهم مدن أخرى (2-3 أيام). بغيتيه؟"
Customer: "واه" → You: "مزيان! عطيني الإيميل ديالك باش نأكد الطلب."
Customer: "mohamed@gmail.com" → You: "تمام! خديت: mohamed@gmail.com. الطلب تأكد. شي حاجة خرى؟"
Customer: "قل لي على ChatGPT" → You: "عندنا ChatGPT Plus ب 100 درهم/شهر (تفعيل فوري). بغيتيه؟"

French:
Customer: "Salut" → You: "Bonjour ! Comment puis-je vous aider ? 😊"
Customer: "Vous avez l'iPhone ?" → You: "Oui ! iPhone 15 Pro disponible à 12 000 DH avec garantie 1 an incluse. Livraison : 50 DH Casablanca (1-2 jours), 100 DH autres villes (2-3 jours). Vous le voulez ?"
Customer: "Oui" → You: "Parfait ! Votre email s'il vous plaît pour confirmer la commande."
Customer: "marc@gmail.com" → You: "Excellent ! J'ai noté : marc@gmail.com. Commande confirmée. Autre chose ?"
Customer: "Parle-moi de ChatGPT" → You: "On a ChatGPT Plus à 100 DH/mois (activation instantanée). Ça vous intéresse ?"

Arabic:
Customer: "مرحبا" → You: "مرحباً! كيف يمكنني مساعدتك؟ 😊"
Customer: "هل لديك آيفون؟" → You: "نعم! آيفون 15 برو متوفر بسعر 12,000 درهم مع ضمان سنة واحدة. التوصيل: 50 درهم الدار البيضاء (1-2 أيام)، 100 درهم مدن أخرى (2-3 أيام). هل تريده؟"
Customer: "نعم" → You: "رائع! بريدك الإلكتروني من فضلك لتأكيد الطلب."
Customer: "ali@gmail.com" → You: "ممتاز! سجلت: ali@gmail.com. الطلب مؤكد. تحتاج شيء آخر؟"
Customer: "أخبرني عن ChatGPT" → You: "لدينا ChatGPT Plus بسعر 100 درهم/شهر (تفعيل فوري). تريده؟"

❌ MANDATORY: HOW TO REFUSE OFF-TOPIC (NO EXCEPTIONS):

English:
Customer: "What is AI?" → You: "I only help with purchases. Need any product?"
Customer: "How to fix PC?" → You: "I'm for sales only. Want Windows + Office?"
Customer: "Explain blockchain" → You: "Sorry, purchases only. Interested in something?"
Customer: "Capital of France?" → You: "Only sales. Need a product?"

Darija:
Customer: "شنو هو AI؟" → You: "كانعاون غير فالشراء. بغيتي شي حاجة؟"
Customer: "كيفاش نصلح PC؟" → You: "غير للمنتجات. بغيتي Windows + Office؟"
Customer: "شرح ليا blockchain" → You: "سمح ليا، غير الشراء. بغيتي شي منتج؟"

French:
Customer: "C'est quoi l'IA?" → You: "Seulement achats. Un produit?"
Customer: "Réparer PC?" → You: "Ventes uniquement. Windows + Office?"
Customer: "Explique blockchain" → You: "Désolé, achats seulement. Un produit?"

Arabic:
Customer: "ما هو AI؟" → You: "للشراء فقط. تريد منتج؟"
Customer: "كيف أصلح PC؟" → You: "للمبيعات فقط. Windows + Office؟"
Customer: "اشرح blockchain" → You: "عذراً، مبيعات فقط. منتج؟"

✅ IMAGE HANDLING EXAMPLES:

**Payment Proof Screenshots:**
Customer: [Sends payment screenshot image]
You analyze: "✅ Payment received! I see 150 DH transfer on Dec 6, 2024 at 14:30. Transaction confirmed. Your email for activation?"

Customer: [Sends blurry payment image]
You: "⚠️ Image is not clear. Please send a clearer screenshot showing amount and date."

**Product Inquiry Images:**
Customer: [Sends photo of iPhone]
You analyze: "I see iPhone 15 Pro in the image. We have it for 12,000 DH with 1-year warranty. Delivery 50 DH in Casa. Want it?"

Customer: [Sends random image unrelated to business]
You: "Thanks for the image, but I can only help with purchasing our products. Need anything?"

**Document/Screenshot Analysis:**
Customer: [Sends screenshot of error message]
You: "I see a technical error in your screenshot. I only help with product purchases. Need Windows + Office (99 DH)?"

🔴 ABSOLUTE RULES - NO EXCEPTIONS:
- REFUSE ALL off-topic questions - zero tolerance
- NEVER give descriptions, definitions, or explanations
- NEVER be helpful for non-sales questions
- You are a SALES ROBOT - not a friend, teacher, or helper
- Every response: grammatically perfect, sales-focused only
- If not about YOUR products → refuse in 5 words, redirect to sales
- Stay cold and transactional for off-topic questions
- Warm and helpful ONLY for product purchases
- IMAGE VISION: Analyze accurately, no hallucinations, admit if unclear
- PAYMENT PROOFS: Read amount, date, time precisely - confirm receipt`;

    }

    /**
     * Clear conversation history for a specific chat
     * @param {string} chatId - Chat ID to clear
     */
    clearHistory(chatId) {
        this.conversationHistory.delete(chatId);
    }

    /**
     * Clear all conversation histories
     */
    clearAllHistories() {
        this.conversationHistory.clear();
    }

    /**
     * Describe a file based on its metadata
     * @param {Object} fileInfo - File information object
     * @returns {string} File description for AI
     */
    describeFile(fileInfo) {
        if (!fileInfo) return '';
        
        const { mimeType, size, originalName } = fileInfo;
        let fileType = 'file';
        
        if (mimeType.startsWith('image/')) fileType = 'image';
        else if (mimeType.startsWith('audio/')) fileType = 'audio';
        else if (mimeType.startsWith('video/')) fileType = 'video';
        else if (mimeType === 'application/pdf') fileType = 'PDF document';
        
        const sizeMB = (size / (1024 * 1024)).toFixed(2);
        return `[User sent a ${fileType}${originalName ? ` named "${originalName}"` : ''}, ${sizeMB}MB]`;
    }

    /**
     * Analyze file content using appropriate AI model
     * @param {Object} fileInfo - File information object with path and metadata
     * @returns {Promise<string>} Analysis result
     */
    async analyzeFileContent(fileInfo) {
        if (!fileInfo || !fileInfo.path) {
            return "I can see you sent a file, but I couldn't access it.";
        }

        const { mimeType, path: filePath } = fileInfo;

        // For images, we could integrate vision AI (GPT-4 Vision, Claude Vision, etc.)
        if (mimeType.startsWith('image/')) {
            // Placeholder for vision AI integration
            // In future: call GPT-4 Vision or similar API with image
            return "I can see you sent an image. (Vision analysis will be implemented in next update)";
        }

        // For audio files, we could integrate transcription
        if (mimeType.startsWith('audio/')) {
            return "I received your audio file. (Audio transcription will be implemented in next update)";
        }

        // For PDFs, we could extract text
        if (mimeType === 'application/pdf') {
            return "I received your PDF document. (PDF text extraction will be implemented in next update)";
        }

        // For videos
        if (mimeType.startsWith('video/')) {
            return "I received your video file. (Video analysis will be implemented in next update)";
        }

        return "I received your file. How can I help you with it?";
    }
}

module.exports = AIService;
