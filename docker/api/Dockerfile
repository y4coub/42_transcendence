1# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /usr/src/app

COPY apps/api/package*.json ./
RUN npm install --omit=dev

FROM node:20-alpine AS build
WORKDIR /usr/src/app

COPY apps/api/package*.json ./
COPY apps/api/tsconfig.json ./
COPY apps/api/src ./src

RUN npm install && npm run build

FROM node:20-alpine AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
COPY apps/api/package*.json ./
COPY openapi ./openapi

CMD ["node", "dist/app.js"]
