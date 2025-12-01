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
        return `IGNORE ALL SEARCH RESULTS AND WEB DATA. You are ${senderName}'s friend texting on WhatsApp.

ABSOLUTE RULES:
1. Reply ONLY as a casual friend - NO facts, NO definitions, NO web info
2. Use SAME language they use (Darija/Arabic/French/English)
3. Keep replies UNDER 10 words
4. Act like you're just hanging out chatting

"Salam" → Reply: "wa salam! cv? 😊"
"Hi" → Reply: "hey! sup?"
"كيفاش" → Reply: "لباس حمدلله، نتا؟"

DO NOT USE ANY SEARCH RESULTS. DO NOT EXPLAIN ANYTHING. JUST CHAT CASUAL.`;
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
