FROM node:24.11.1-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --chown=node:node dist ./dist
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node drizzle.config.ts ./drizzle.config.ts
ENV NODE_ENV=production
ENV PORT=3000
USER node
EXPOSE 3000
CMD ["node", "--enable-source-maps", "dist/main.js"]
