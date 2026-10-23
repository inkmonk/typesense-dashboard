ARG PUBLIC_PATH=/dashboard
FROM node:24-alpine AS builder
ARG PUBLIC_PATH
WORKDIR /app

RUN apk add --no-cache --virtual .gyp \
        g++ make py3-pip

COPY package.json package-lock.json ./
COPY src-electron/package.json src-electron/package-lock.json ./src-electron/
RUN npm ci --ignore-scripts
RUN npm ci --prefix src-electron --ignore-scripts

COPY . .

# Caddy's file-server has no SPA fallback, so the image keeps hash URLs (/#/collections)
ENV VUE_ROUTER_MODE=hash
# The self-hosted image connects to any server, so it keeps the host + API key form
ENV ENABLE_API_KEY_LOGIN=true
RUN npm run postinstall
RUN npm run build

FROM caddy:2-alpine
ARG PUBLIC_PATH
WORKDIR /srv
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
COPY --from=builder /app/dist/spa/ .${PUBLIC_PATH}

EXPOSE 80
CMD ["/entrypoint.sh"]
