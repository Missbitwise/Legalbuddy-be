FROM node:22.22.0-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /app

FROM base AS build-deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM build-deps AS build

ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"

COPY . .
RUN pnpm run build

# Keep production dependencies only
FROM build-deps AS production-deps

RUN pnpm prune --prod

# Final production image
FROM base AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/src/generated/client ./src/generated/client

USER node

EXPOSE 8080

CMD ["node", "dist/server.js"]