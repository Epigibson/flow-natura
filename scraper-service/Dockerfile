FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install

# Firefox evade mejor los WAFs de Natura (Akamai). --with-deps instala TODAS las libs del SO.
RUN npx playwright install --with-deps firefox

COPY server.mjs ./

EXPOSE 3001

CMD ["node", "server.mjs"]
