# Start from a slim Node image
FROM node:20-slim

# Install system dependencies and Japanese fonts
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-noto-cjk \
    fontconfig \
    --no-install-recommends && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Puppeteer will look for Chromium here
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Set working directory
WORKDIR /app

# Copy your files
COPY . .

# Install Node.js dependencies
RUN npm install

# Expose a port (optional, depending on your app)
EXPOSE 3000

# Run your app (change this if your entry point is different)
CMD ["node", "index.js"]
