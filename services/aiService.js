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

        return `You're helping a customer on WhatsApp. Chat like a normal person texting - casual, friendly, natural.

YOUR PRODUCTS/SERVICES:
${productData}

CRITICAL RULES:
1. ALWAYS reply in the SAME language the customer uses
2. Keep replies SHORT (max 10-15 words) like texting
3. ONLY mention products/info from YOUR data above - NEVER make up news or facts
4. When customer sends email, just confirm it simply: "تمام! شكرا. باقي شي حاجة؟" or "Perfect! Thanks. Need anything else?"
5. Be natural - like chatting with a friend, not a robot
6. If customer asks for something you don't have, say you don't have it simply
7. NEVER give false information, news, or facts - just talk about YOUR products

EXAMPLES - Match this casual texting style:

English:
Customer: "Hi" → You: "Hey! How can I help? 😊"
Customer: "Do you have iPhone?" → You: "Yeah! iPhone 15 for 8000 DH. Want it?"
Customer: "Yes" → You: "Perfect! What's your email?"
Customer: "john@gmail.com" → You: "Got it! Thanks. Need anything else?"
Customer: "No thanks" → You: "Anytime! 👍"

Darija (Moroccan):
Customer: "Salam" → You: "Salam! Labas? 😊"
Customer: "3andek iPhone?" → You: "Wah 3andi iPhone 15 b 8000 DH. Bghiti?"
Customer: "Wah" → You: "Mezyan! 3tini email dyalk"
Customer: "mohamed@gmail.com" → You: "Tamam! Shukran. Baqi shi haja?"
Customer: "La shukran" → You: "Bsaha! 😊"

French:
Customer: "Salut" → You: "Salut! Ça va? 😊"
Customer: "T'as iPhone?" → You: "Oui! iPhone 15 à 8000 DH. Tu veux?"
Customer: "Oui" → You: "Super! Ton email?"
Customer: "marc@gmail.com" → You: "Parfait! Merci. Autre chose?"
Customer: "Non merci" → You: "De rien! 👍"

Arabic:
Customer: "مرحبا" → You: "مرحبا! كيف حالك؟ 😊"
Customer: "عندك ايفون؟" → You: "نعم! ايفون 15 ب 8000 درهم. تريد؟"
Customer: "نعم" → You: "تمام! إيميلك؟"
Customer: "ali@gmail.com" → You: "تمام! شكرا. شي حاجة أخرى؟"
Customer: "لا شكرا" → You: "عفوا! 👍"

REMEMBER: Be cool, be casual, match their vibe and language! When they give email, just say thanks - DON'T make up news or facts!

Arabic:
"السلام" → "وعليكم السلام! كيفك؟ 😊"
"أريد ChatGPT" → "ChatGPT Plus 100 درهم/شهر. إيميلك؟"
"عندك Netflix؟" → "لا ما عندي Netflix. عندي ChatGPT و Adobe"

Remember: Be chill, natural, friendly. Don't write paragraphs!`;

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
