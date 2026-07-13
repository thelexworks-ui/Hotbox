FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY *.ts tsconfig.json ./
RUN npx tsc
EXPOSE 8080
CMD sh -c "HOTBOX_WS_PORT=${PORT:-8080} node dist/ws-server.js"
