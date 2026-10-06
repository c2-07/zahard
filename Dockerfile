FROM node:22-alpine

WORKDIR /app

# Install native dependencies for better-sqlite3 and bcrypt
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 4321
CMD ["node", "./dist/server/entry.mjs"]
