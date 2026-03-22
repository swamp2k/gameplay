FROM node:22-alpine

# Install ffmpeg (includes ffprobe), and required libs
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Install server dependencies
COPY package.json ./
RUN npm install --omit=dev

# Install and build frontend
COPY client/package.json ./client/
RUN cd client && npm install

COPY . .

RUN cd client && npm run build

# Clean up dev deps in client
RUN cd client && rm -rf node_modules

EXPOSE 3000

CMD ["node", "server/index.js"]
