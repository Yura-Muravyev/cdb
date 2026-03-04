FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY src ./src
COPY migrations ./migrations
COPY package.json ./
RUN mkdir -p /data/storage
ENV STORAGE_ROOT=/data/storage
EXPOSE 3000
CMD ["bun", "src/index.ts"]
