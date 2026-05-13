FROM oven/bun:1

WORKDIR /app

COPY package.json ./
RUN bun install --production

COPY src/ ./src/

EXPOSE 3001

CMD ["bun", "run", "src/index.ts"]
