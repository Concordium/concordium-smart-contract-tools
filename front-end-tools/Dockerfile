ARG build_image=node:18-slim

FROM ${build_image} AS build

WORKDIR /app
COPY ./.yarn ./.yarn
COPY ./.yarnrc.yml ./
COPY ./yarn.lock ./
COPY ./package.json ./
COPY ./tsconfig.json ./
COPY ./vite.config.ts ./
COPY ./public ./public
COPY ./src ./src
COPY ./index.html ./

RUN yarn install --immutable && yarn cache clean && yarn build


FROM nginx
COPY --from=build ./app/dist ./usr/share/nginx/html
COPY ./nginx.conf /etc/nginx/conf.d/default.conf
