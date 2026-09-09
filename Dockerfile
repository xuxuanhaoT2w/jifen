# Dockerfile for jifen

FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
COPY public ./public

# 暴露端口
EXPOSE 3000

VOLUME ["/app/data"]
CMD ["node", "server.js"]
