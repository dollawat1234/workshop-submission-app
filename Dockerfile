FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./server.js
COPY public ./public
COPY data/store.json ./data/store.json
COPY uploads ./uploads

ENV NODE_ENV=production
ENV PORT=3000
ENV STORAGE_ROOT=/var/lib/teamgame

EXPOSE 3000

CMD ["npm", "start"]
