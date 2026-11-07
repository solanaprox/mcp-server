FROM node:20-alpine
LABEL org.opencontainers.image.title="solanaprox-mcp" org.opencontainers.image.version="2.0.0"
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY bin ./bin
COPY src ./src
ENTRYPOINT ["node", "bin/solanaprox-mcp.js"]
