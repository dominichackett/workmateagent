# Use an official Node.js runtime as a parent image
FROM node:18

# Set the working directory inside the container
WORKDIR /

# Copy package.json and package-lock.json first (to leverage caching)
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev  # Use `npm ci` for strict installs

# Copy the rest of your application files
COPY . .

# Set default command to start the application
CMD ["npm", "start"]
