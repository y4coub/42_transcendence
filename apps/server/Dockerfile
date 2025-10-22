# Build stage
FROM node:20-alpine AS builder

# Install Python and build dependencies for native modules (better-sqlite3, argon2)
RUN apk add --no-cache python3 make g++ gcc

WORKDIR /app

# Copy package files
COPY apps/server/package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY apps/server/ ./

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine

# Install Python and build dependencies for native modules
RUN apk add --no-cache python3 make g++ gcc sqlite

WORKDIR /app

# Copy package files
COPY apps/server/package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY apps/server/scripts ./scripts

# Create database directory
RUN mkdir -p /app/db/data

# Copy migrations directory from project root
COPY apps/server/db/migrations /app/db/migrations

# Expose port
EXPOSE 3000

# Run database migrations before starting the application
CMD ["sh", "-c", "npm run migrate:up && npm start"]
