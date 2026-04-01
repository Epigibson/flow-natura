FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install

# Chromium con TODAS las dependencias del sistema
RUN npx playwright install --with-deps chromium

COPY server.mjs ./

EXPOSE 3001

CMD ["node", "server.mjs"]
