# Build static assets
FROM node:20-alpine AS builder

WORKDIR /app

COPY apps/frontend/package*.json ./
RUN npm install

COPY apps/frontend/ ./

# Allow overriding the API base URL at build time
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

# Serve with Nginx
FROM nginx:1.27-alpine

# Replace default config with our HTTPS-enabled reverse proxy
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf

# Copy built frontend assets
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080
EXPOSE 8443

CMD ["nginx", "-g", "daemon off;"]
