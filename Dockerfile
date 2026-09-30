FROM node:20-bookworm-slim

# Install GCC, standard C libraries, and build tools for C code execution
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    libc6-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install backend dependencies
COPY backend/package*.json ./
RUN npm install --omit=dev

# Copy backend source code
COPY backend/ ./

EXPOSE 3400

ENV NODE_ENV=production
ENV PORT=3400
ENV ENABLE_LOCAL_GCC_FALLBACK=true

CMD ["node", "server.js"]
