const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

class AIService {
    constructor() {
        // Determine which AI provider to use
        this.provider = process.env.AI_PROVIDER || 'openai'; // 'openai', 'claude', or 'perplexity'
        
        if (this.provider === 'claude') {
            this.anthropic = new Anthropic({
                apiKey: process.env.ANTHROPIC_API_KEY
            });
        } else if (this.provider === 'perplexity') {
            this.openai = new OpenAI({
                apiKey: process.env.PERPLEXITY_API_KEY,
                baseURL: 'https://api.perplexity.ai'
            });
        } else {
            this.openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });
        }

        this.conversationHistory = new Map();
        this.maxHistoryLength = 10;
    }

    /**
     * Generate AI response based on user message
     * @param {string} message - User's message
     * @param {object} context - Additional context (senderName, chatId, etc.)
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

            // Add user message to history
            history.push({
                role: 'user',
                content: message
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
        const productData = `
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

        return `You sell digital services on WhatsApp. Chat EXACTLY like a normal person texting a friend - super casual and natural.

${productData}

RULES:
- Match customer's language 100% (English→English, Darija→Darija, French→French, Arabic→Arabic)
- Reply max 10-15 words like texting
- Only use data above, don't invent stuff
- Chat natural, don't sound like a robot or customer service

EXAMPLES - Copy this style:

English:
"Hi" → "Hey! Wassup? 😊"
"I want ChatGPT" → "ChatGPT Plus 100 DH/month. Send your email?"
"You have Netflix?" → "Nah no Netflix. Got ChatGPT, Adobe, Canva tho"
"Ok thanks" → "Anytime! 👍"

Darija:
"Slm" → "Salam khoya! Labas? 😊"
"Bghit compte" → "Compte dyal chnou? ChatGPT wla Adobe wla chnou?"
"Adobe" → "Adobe 80 DH 3 mois. 3tini email"
"Ok" → "Waaaa 👍"
"Merci" → "Bsaha a sat! 😊"

French:
"Salut" → "Salut! Cv? 😊"
"Je veux ChatGPT" → "ChatGPT Plus 100 DH/mois. Ton email?"
"T'as Netflix?" → "Non pas Netflix. J'ai ChatGPT, Adobe, Canva"
"Merci" → "De rien! 👍"

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
}

module.exports = AIService;
