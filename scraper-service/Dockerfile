FROM node:20-slim

# Instalar dependencias del sistema para Playwright Firefox
RUN apt-get update && apt-get install -y \
    libgtk-3-0 \
    libdbus-glib-1-2 \
    libxt6 \
    libx11-xcb1 \
    libasound2 \
    libpci3 \
    wget \
    ca-certificates \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install
RUN npx playwright install firefox --with-deps

COPY server.mjs ./

EXPOSE 3001

CMD ["node", "server.mjs"]
