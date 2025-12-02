# 🚀 Deployment Guide - WhatsApp AI Bot

## ⚠️ IMPORTANT: Free Hosting Limitations

**WhatsApp bots CANNOT run on free hosting** because they require:
- Chrome/Chromium browser (~400-500MB RAM)
- Node.js runtime (~100-200MB RAM)
- **Minimum 1GB RAM required**

Free tiers like Render.com (512MB) will crash with 502 errors.

---

## ✅ RECOMMENDED: Railway ($5/month)

### Why Railway?
- ✅ Works perfectly with WhatsApp bots
- ✅ $5/month with $5 free credit to start
- ✅ Automatic deployments from GitHub
- ✅ Built-in monitoring and logs
- ✅ Better memory management

### Step-by-Step Railway Deployment:

1. **Sign up at Railway**
   - Go to https://railway.app
   - Sign up with GitHub
   - You get $5 free credit

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your `APIwhatsaap` repository

3. **Add Environment Variables**
   Click "Variables" and add (use your own API key from .env file):
   ```
   PERPLEXITY_API_KEY=your_perplexity_api_key_here
   AI_PROVIDER=perplexity
   AI_MODEL=sonar
   MAX_TOKENS=30
   TEMPERATURE=1.0
   PORT=3000
   ```

4. **Configure Build**
   Railway auto-detects Node.js. It will:
   - Run `npm install`
   - Run `npm start`

5. **Deploy**
   - Click "Deploy"
   - Wait 2-3 minutes
   - Click "Generate Domain" to get public URL

6. **Done!** 
   - Visit your Railway URL
   - Scan QR code
   - Start chatting!

### Railway Settings (Optional but Recommended):
```
Memory: 1GB (minimum)
CPU: 1 vCPU
```

---

## 🔄 Alternative: Render.com ($7/month)

If you prefer Render, you MUST upgrade to paid:

1. Go to your service on Render
2. Click "Upgrade to Paid"
3. Select "Starter" plan ($7/month, 512MB dedicated)
4. Add environment variables (same as above)
5. Deploy

**Note:** Even with paid Render, Railway is more reliable for WhatsApp bots.

---

## 💻 Local Deployment (FREE but PC must stay on)

### Option A: Run on Your PC
```bash
npm start
```
- Visit http://localhost:3000
- Works perfectly
- PC must stay on 24/7

### Option B: Local + ngrok (Public Access)
1. Install ngrok: https://ngrok.com/download
2. Run your app: `npm start`
3. In another terminal: `ngrok http 3000`
4. Share the ngrok URL (e.g., https://abc123.ngrok.io)

**Pros:** Free, full control
**Cons:** PC must stay on, dynamic URL with free ngrok

---

## 🐳 VPS Deployment (Advanced)

For full control, use a cheap VPS:

### Recommended VPS Providers:
- **Contabo**: €4/month (4GB RAM)
- **DigitalOcean**: $4/month (512MB)
- **Vultr**: $2.50/month (512MB)
- **Hetzner**: €4/month (2GB RAM)

### Setup on VPS (Ubuntu):
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Chromium dependencies
sudo apt install -y chromium-browser \
  ca-certificates fonts-liberation \
  libasound2 libatk-bridge2.0-0 libatk1.0-0 \
  libcups2 libdbus-1-3 libdrm2 libgbm1 \
  libgtk-3-0 libnspr4 libnss3 libxcomposite1 \
  libxdamage1 libxrandr2 xdg-utils

# Clone repo
git clone https://github.com/benimellalsgar/APIwhatsaap.git
cd APIwhatsaap

# Install dependencies
npm install

# Create .env file
nano .env
# (Paste your environment variables)

# Install PM2 for process management
sudo npm install -g pm2

# Start app
pm2 start server.js --name whatsapp-bot

# Make it auto-start on reboot
pm2 startup
pm2 save

# Check logs
pm2 logs whatsapp-bot
```

---

## 🔍 Troubleshooting

### 502 Bad Gateway
- **Cause:** Not enough memory
- **Fix:** Upgrade to paid plan or use Railway

### Session Not Connecting
- Scan QR code quickly (expires in 60 seconds)
- Clear browser cache and try again
- Check if WhatsApp Web is working on your phone

### Bot Not Responding
- Check Perplexity API key is valid
- Check server logs for errors
- Verify environment variables are set

---

## 📊 Monitoring

### Health Check
Visit `https://your-domain.com/health` to see:
- Server status
- Uptime
- Active sessions
- Memory usage

### Logs
- **Railway**: Click "Logs" in dashboard
- **Render**: Click "Logs" tab
- **VPS**: `pm2 logs whatsapp-bot`

---

## 💰 Cost Summary

| Platform | Cost | RAM | Reliability | Recommended |
|----------|------|-----|-------------|-------------|
| Railway | $5/mo | 1GB+ | ⭐⭐⭐⭐⭐ | ✅ YES |
| Render Paid | $7/mo | 512MB | ⭐⭐⭐⭐ | Good |
| Contabo VPS | €4/mo | 4GB | ⭐⭐⭐⭐⭐ | Advanced |
| Local PC | Free | Unlimited | ⭐⭐⭐ | PC must stay on |

---

## ✅ Final Recommendation

**Use Railway.** It's:
- Cheapest that works ($5/mo)
- Easiest to set up (5 minutes)
- Most reliable for WhatsApp bots
- Has free $5 credit to test

Your code is perfect and works locally. The ONLY issue was trying free hosting, which physically cannot support Chrome/Puppeteer.

**Next Steps:**
1. Sign up at https://railway.app
2. Deploy your GitHub repo
3. Add environment variables
4. Done! ✅
