# Use Node.js 20 with Chromium pre-installed
FROM ghcr.io/puppeteer/puppeteer:21.6.1

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application files
COPY . .

# Set environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Expose port
EXPOSE 3000

# Start application
CMD ["npm", "start"]
