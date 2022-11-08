# Base image
FROM node:18

# Create working directory
WORKDIR /app

# Copy over the files
COPY ./package.json ./package.json

# Install the packages the code needs to run
RUN yarn install --production

# Copy over our code
COPY ./gcode ./gcode
COPY ./dist ./dist
