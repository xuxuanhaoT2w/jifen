# Dockerfile for jifen

FROM node:18-alpine

WORKDIR /app

# 复制 package.json
COPY package.json package-lock.json ./

# 安装依赖
RUN npm ci --production

# 复制应用代码
COPY . .

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# 启动应用
CMD ["npm", "start"]
