# WhatsApp AI Agent 🤖

An intelligent WhatsApp bot powered by AI that automatically responds to messages. Multi-user support with web dashboard.

## ⚠️ IMPORTANT: Deployment Requirements

**This bot requires minimum 1GB RAM.** Free hosting (Render, Vercel, Netlify) will NOT work.

📖 **[Read Full Deployment Guide](DEPLOYMENT.md)** for:
- ✅ Railway ($5/month) - Recommended
- Render.com paid ($7/month)
- VPS hosting
- Local deployment

## Features ✨

- 🌐 **Web Interface**: Beautiful dashboard with QR code scanning
- 👥 **Multi-User**: Multiple people can connect their own WhatsApp numbers
- 🤖 **AI-Powered**: Uses Perplexity AI for natural conversations
- 💬 **Multilingual**: Responds in same language (English, Arabic, French, Darija)
- 🛍️ **Sales Bot**: Configured with product catalog and pricing
- 📊 **Real-time**: Live message activity tracking
- 🔐 **Session Management**: Save sessions, clear auth data
- 🚀 **Production Ready**: Health checks, error handling, logging

## Prerequisites 📋

- Node.js (v14 or higher)
- npm or yarn
- WhatsApp account
- OpenAI API key ([Get one here](https://platform.openai.com/api-keys))

## Installation 🔧

1. **Clone or navigate to the project directory**
   ```bash
   cd APIWhatsapp
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   # Copy the example env file
   copy .env.example .env
   ```
   
   Edit `.env` and add your OpenAI API key:
   ```env
   OPENAI_API_KEY=sk-your-api-key-here
   ```

## Usage 🚀

1. **Start the server**
   ```bash
   npm start
   ```

2. **Open Web Interface**
   - Open your browser and go to: `http://localhost:3000`
   - You'll see a beautiful dashboard

3. **Start Session**
   - Click "Start Session" button
   - Wait for QR code to appear

4. **Scan QR Code**
   - Open WhatsApp on your phone
   - Go to Settings → Linked Devices → Link a Device
   - Scan the QR code on the screen

5. **Bot is Ready!**
   - Once authenticated, the bot will start responding to messages
   - You can see all message activity in real-time on the dashboard
   - Click "Stop Session" when done to allow others to connect

## How Multiple Users Work 👥

- **One session at a time**: Only one WhatsApp account can be connected at once
- **Take turns**: When someone finishes (clicks Stop), the next person can start
- **Fair access**: First come, first served - if someone is using it, you'll see a waiting message
- **Independent accounts**: Each user scans their own WhatsApp and gets their own AI responses

## Configuration ⚙️

Edit the `.env` file to customize your bot:

```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# AI Model (gpt-3.5-turbo, gpt-4, etc.)
AI_MODEL=gpt-3.5-turbo

# Maximum tokens in response (affects response length)
MAX_TOKENS=500

# Temperature 0-1 (higher = more creative)
TEMPERATURE=0.7

# Bot name and personality
BOT_NAME=AI Assistant
BOT_PERSONALITY=friendly and helpful
```

## Bot Personality Examples 💡

Change `BOT_PERSONALITY` to customize how your bot responds:

- `friendly and helpful` - General purpose assistant
- `professional business assistant` - For business communications
- `casual and funny` - For informal chats
- `technical expert in programming` - For tech support
- `customer service representative` - For customer support

## Development Mode 🛠️

For auto-restart on file changes:

```bash
npm run dev
```

## Project Structure 📁

```
APIWhatsapp/
├── index.js                 # Main bot file
├── services/
│   └── aiService.js        # AI integration service
├── config/
│   └── README.md           # Configuration documentation
├── .env                    # Environment variables (create this)
├── .env.example           # Example environment file
├── package.json           # Dependencies
└── README.md             # This file
```

## How It Works 🔍

1. **WhatsApp Connection**: Uses `whatsapp-web.js` to connect to WhatsApp Web
2. **Message Reception**: Listens for incoming messages
3. **AI Processing**: Sends message to OpenAI API for intelligent response
4. **Context Memory**: Maintains conversation history for natural dialogue
5. **Response**: Sends AI-generated response back via WhatsApp

## API Costs 💰

The bot uses OpenAI's API which has usage costs:
- **GPT-3.5-turbo**: ~$0.002 per 1K tokens (very affordable)
- **GPT-4**: ~$0.03 per 1K tokens (more expensive but better)

Monitor your usage at [OpenAI Platform](https://platform.openai.com/usage)

## Troubleshooting 🔧

### QR Code doesn't appear
- Make sure Node.js is installed correctly
- Check that all dependencies are installed: `npm install`

### Authentication fails
- Delete `.wwebjs_auth` folder and try again
- Ensure your phone has stable internet connection

### Bot doesn't respond
- Check your OpenAI API key is valid
- Verify you have credits in your OpenAI account
- Check console for error messages

### "Insufficient quota" error
- Your OpenAI account needs credits
- Add payment method at [OpenAI Billing](https://platform.openai.com/account/billing)

## Security Notes 🔒

- Never commit your `.env` file to version control
- Keep your OpenAI API key secret
- The `.wwebjs_auth` folder contains your WhatsApp session - keep it secure

## Limitations ⚠️

- WhatsApp may rate-limit if you send too many messages
- Bot needs to stay running to respond to messages
- Requires stable internet connection
- OpenAI API has usage costs

## Advanced Features (Coming Soon) 🚧

- [ ] Support for multiple AI providers (Anthropic, Google AI)
- [ ] Image recognition and response
- [ ] Voice message transcription
- [ ] Command system (!help, !clear, etc.)
- [ ] Admin controls
- [ ] Message scheduling
- [ ] Analytics dashboard

## License 📄

ISC

## Support 💬

If you encounter any issues, please check:
1. Node.js version is 14 or higher
2. All dependencies are installed
3. OpenAI API key is valid
4. Internet connection is stable

## Contributing 🤝

Feel free to fork, improve, and submit pull requests!

---

Made with ❤️ using Node.js, WhatsApp Web.js, and OpenAI
