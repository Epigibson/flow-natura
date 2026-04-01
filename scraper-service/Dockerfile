FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install

COPY server.mjs ./

EXPOSE 3001

CMD ["node", "server.mjs"]
