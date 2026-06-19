FROM node:20-alpine

WORKDIR /app

# Abhängigkeiten zuerst (besseres Layer-Caching)
COPY package*.json ./
RUN npm ci --only=production

# Prisma Schema kopieren und Client generieren
COPY prisma ./prisma
RUN npx prisma generate

# Quellcode kopieren
COPY src ./src

EXPOSE 3000

CMD ["node", "src/server.js"]
