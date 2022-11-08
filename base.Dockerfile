FROM node:18

WORKDIR /app
COPY ./package.json ./package.json
COPY ./dist ./dist
COPY ./gcode ./gcode

RUN yarn install --production