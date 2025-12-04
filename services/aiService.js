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
        this.maxHistoryLength = 4;
        this.isCustom = !!customApiKey;
        this.businessData = businessData; // Store user's business data
        
        // Warn if API keys are missing (only for default service)
        if (!customApiKey && !process.env.PERPLEXITY_API_KEY && this.provider === 'perplexity') {
            console.warn('⚠️ PERPLEXITY_API_KEY is not set. Bot will not work properly.');
        }
    }

    /**
     * Generate AI response with file/media support
     * @param {string} message - User's message
     * @param {object} context - Additional context (senderName, chatId, fileInfo, etc.)
     * @returns {Promise<string>} AI generated response
     */
    async generateResponse(message, context = {}) {
        try {
            const { senderName, chatId } = context;

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

            // Build message content (with optional file)
            let userContent = message;
            
            // If there's a file, format it for the AI
            if (context.fileInfo) {
                const fileDescription = await this.describeFile(context.fileInfo);
                userContent = `${message}\n\n[File attached: ${fileDescription}]`;
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
                    system: this.getSystemPrompt(senderName),
                    messages: history
                });

                aiResponse = response.content[0].text;

            } else {
                // Use OpenAI API (or Perplexity)
                const messages = [
                    {
                        role: 'system',
                        content: this.getSystemPrompt(senderName)
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

                const completion = await this.openai.chat.completions.create(requestBody);

                aiResponse = completion.choices[0].message.content;
            }

            // Add AI response to history
            history.push({
                role: 'assistant',
                content: aiResponse
            });

            return aiResponse;

        } catch (error) {
            console.error('Error generating AI response:', error);
            
            if (error.code === 'insufficient_quota' || error.error?.type === 'insufficient_quota') {
                return 'Sorry, the AI service quota has been exceeded. Please contact the administrator.';
            }
            
            if (error.code === 'invalid_api_key' || error.status === 401) {
                return 'Sorry, there is a configuration issue. Please contact the administrator.';
            }

            return 'Sorry, I am having trouble processing your request right now. Please try again later.';
        }
    }

    /**
     * Get system prompt for AI
     * @param {string} senderName - Name of the person chatting
     * @returns {string} System prompt
     */
    getSystemPrompt(senderName) {
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

        return `You are a professional WhatsApp sales assistant. Your goal is to provide ACCURATE, COMPLETE, and ERROR-FREE responses.

YOUR PRODUCTS/SERVICES:
${productData}

CRITICAL COMMUNICATION RULES:
1. ALWAYS reply in the EXACT SAME language the customer uses (English, French, Arabic, Darija)
2. Be PRECISE and ACCURATE - double-check all prices, details, and information before sending
3. Write responses with ZERO grammar mistakes, typos, or spelling errors
4. Keep responses SHORT but COMPLETE - don't leave out important details
5. ONLY provide information from YOUR product data above - NEVER invent or assume information
6. If you don't have something, clearly say you don't offer it
7. When customer provides email/contact info, confirm it EXACTLY as they wrote it
8. Use proper punctuation, capitalization, and formatting in ALL languages
9. Be professional yet friendly - like a helpful shop assistant

QUALITY STANDARDS:
✓ Perfect spelling in all languages
✓ Correct grammar and sentence structure  
✓ Accurate prices and product details
✓ Clear and complete information
✓ Professional yet warm tone
✓ Quick, efficient responses (1-2 sentences ideal)

RESPONSE EXAMPLES (Perfect Quality):

English:
Customer: "Hi" → You: "Hello! How can I help you today? 😊"
Customer: "Do you have iPhone?" → You: "Yes! iPhone 15 Pro is available for 12,000 DH. Would you like it?"
Customer: "Yes, what's included?" → You: "iPhone 15 Pro with 1-year warranty included. Your email please?"
Customer: "john@gmail.com" → You: "Perfect! Got it: john@gmail.com. Anything else?"
Customer: "Delivery time?" → You: "Delivery in Casablanca: 50 DH (1-2 days). Other cities: 100 DH (2-3 days)."

Darija (Moroccan) - Perfect Grammar:
Customer: "السلام" → You: "و عليكم السلام! كيف نقدر نعاونك؟ 😊"
Customer: "عندك iPhone?" → You: "نعم! iPhone 15 Pro متوفر ب 12,000 درهم. بغيتيه؟"
Customer: "واه، شنو كاين فيه؟" → You: "iPhone 15 Pro مع ضمان سنة. عطيني الإيميل ديالك؟"
Customer: "mohamed@gmail.com" → You: "تمام! خديت: mohamed@gmail.com. شي حاجة خرى؟"
Customer: "التوصيل؟" → You: "التوصيل ف كازا: 50 درهم (1-2 أيام). مدن أخرى: 100 درهم (2-3 أيام)."

French - Perfect Grammar:
Customer: "Salut" → You: "Bonjour ! Comment puis-je vous aider ? 😊"
Customer: "Vous avez l'iPhone ?" → You: "Oui ! iPhone 15 Pro disponible à 12 000 DH. Vous le voulez ?"
Customer: "Oui, qu'est-ce qui est inclus ?" → You: "iPhone 15 Pro avec garantie 1 an incluse. Votre email s'il vous plaît ?"
Customer: "marc@gmail.com" → You: "Parfait ! J'ai noté : marc@gmail.com. Autre chose ?"
Customer: "Livraison ?" → You: "Livraison Casablanca : 50 DH (1-2 jours). Autres villes : 100 DH (2-3 jours)."

Arabic - Perfect Grammar:
Customer: "مرحبا" → You: "مرحباً! كيف يمكنني مساعدتك؟ 😊"
Customer: "هل لديك آيفون؟" → You: "نعم! آيفون 15 برو متوفر بسعر 12,000 درهم. هل تريده؟"
Customer: "نعم، ماذا يتضمن؟" → You: "آيفون 15 برو مع ضمان سنة واحدة. بريدك الإلكتروني من فضلك؟"
Customer: "ali@gmail.com" → You: "تمام! سجلت: ali@gmail.com. هل تريد شيء آخر؟"
Customer: "التوصيل؟" → You: "التوصيل في الدار البيضاء: 50 درهم (1-2 أيام). مدن أخرى: 100 درهم (2-3 أيام)."

IMPORTANT REMINDERS:
- Every response must be grammatically perfect
- All product details must be accurate
- All prices must match your product data exactly
- Confirm emails/contact info word-for-word
- Professional tone with correct punctuation
- No invented information or assumptions
- Clear, complete, error-free responses always`;

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
