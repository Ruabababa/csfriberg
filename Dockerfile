FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN pnpm install --frozen-lockfile

COPY . .
ARG VITE_MULTIPLAYER_ENABLED=false
ARG RESOURCE_VERSION
ENV VITE_MULTIPLAYER_ENABLED=$VITE_MULTIPLAYER_ENABLED
ENV RESOURCE_VERSION=$RESOURCE_VERSION
RUN pnpm build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/scripts ./scripts

EXPOSE 3000
CMD ["pnpm", "--filter", "server", "start"]
