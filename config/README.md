# Configuration Guide

## Environment Variables

Create a `.env` file in the root directory with the following variables:

### Required
- `OPENAI_API_KEY`: Your OpenAI API key (get it from https://platform.openai.com/api-keys)

### Optional
- `AI_MODEL`: AI model to use (default: gpt-3.5-turbo)
  - Options: gpt-3.5-turbo, gpt-4, gpt-4-turbo-preview
- `MAX_TOKENS`: Maximum tokens in response (default: 500)
- `TEMPERATURE`: Response creativity 0-1 (default: 0.7)
- `BOT_NAME`: Name of your bot (default: AI Assistant)
- `BOT_PERSONALITY`: Bot personality description (default: friendly and helpful)

## AI Model Options

### GPT-3.5 Turbo (Recommended for start)
- Fast and cost-effective
- Good for general conversations

### GPT-4
- More accurate and sophisticated
- Higher cost per token

## Customization Tips

1. **Personality**: Modify BOT_PERSONALITY to change how the bot responds
2. **Temperature**: 
   - Lower (0.3): More focused and deterministic
   - Higher (0.9): More creative and varied
3. **Max Tokens**: Increase for longer responses, decrease for shorter ones
