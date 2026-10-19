ARG PUBLIC_PATH=/dashboard
FROM node:22-alpine AS builder
ARG PUBLIC_PATH
WORKDIR /app

RUN apk add --no-cache --virtual .gyp \
        g++ make py3-pip

RUN npm install -g @quasar/cli

COPY package.json package-lock.json ./
RUN npm install --ignore-scripts

COPY . .

# Caddy's file-server has no SPA fallback, so the image keeps hash URLs (/#/collections)
ENV VUE_ROUTER_MODE=hash
RUN quasar prepare
RUN quasar build

RUN apk del .gyp

FROM caddy:2-alpine
ARG PUBLIC_PATH
WORKDIR /srv
COPY --from=builder /app/dist/spa/ .${PUBLIC_PATH}

EXPOSE 80
CMD ["caddy", "file-server"]
