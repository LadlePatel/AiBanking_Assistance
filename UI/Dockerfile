# Use a Node.js base image
FROM node:20-alpine

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY UI/package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY UI/ .

# Expose the port the app runs on
EXPOSE 3000

# Command to start the application
CMD ["npm", "start"]
