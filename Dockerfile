# Dockerfile
# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to leverage Docker cache
COPY package*.json ./

# Install ALL production dependencies, including archiver
RUN npm install --only=production

# Bundle app source
COPY . .

# Your worker script will be run by this command
CMD [ "node", "worker.js" ]