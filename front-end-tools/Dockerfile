# This dockerfile is meant to be run from the **root of the repository**.

ARG build_image=node:16-slim

FROM ${build_image} AS build

RUN yarn set version 3.2.0

# Copy front end files
WORKDIR /app
COPY ./front-end-tools ./

WORKDIR /app/front-end-tools
RUN yarn install && yarn build

# Serve front end
FROM nginx
COPY --from=build ./app/dist ./usr/share/nginx/html
