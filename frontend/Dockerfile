# Use an official Node runtime as a parent image
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of your frontend code
COPY . .

# Vite is configured to listen on port 3000 in vite.config.mjs.
EXPOSE 3000

# Run the app! 
# Note: Vite needs to be told to expose itself to the network, so we add --host
CMD ["npm", "start", "--", "--host"]
