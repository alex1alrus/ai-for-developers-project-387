FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY spec/generated ./spec/generated
COPY --from=build /app/dist ./dist
USER node
# PORT comes from the environment (Render sets it); server/index.ts falls back to 3000.
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server/index.ts"]
