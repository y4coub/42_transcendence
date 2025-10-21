# Development stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY apps/frontend/package*.json ./

# Install dependencies
RUN npm cache clean --force && npm install

# Copy application files
COPY apps/frontend/ ./

# Expose Vite dev server port
EXPOSE 5173

# Start Vite dev server with host 0.0.0.0 to allow external access
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
