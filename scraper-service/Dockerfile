FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install

# Instalar Chromium CON todas sus dependencias del sistema automáticamente
RUN npx playwright install --with-deps chromium

COPY server.mjs ./

EXPOSE 3001

CMD ["node", "server.mjs"]
