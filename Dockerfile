FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build:api
FROM node:24-bookworm-slim
ENV NODE_ENV=production APP_ENV=production HOST=0.0.0.0 PORT=4000
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
