FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm run build

# Create data directory
RUN mkdir -p /app/data

# Expose the port (if needed for health checks)
EXPOSE 3000

# Start the server
CMD ["pnpm", "start"]
