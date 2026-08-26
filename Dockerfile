FROM node:24-alpine

# ffmpeg powers audio decoding/filtering; no native build tools are needed
# since all other dependencies (voice, ytdl, opus encoding) are pure JS/WASM
RUN apk add --no-cache ffmpeg
RUN corepack enable

# Set the working directory inside the container
WORKDIR /app

# Copy the source code into the container
COPY src /app
COPY package.json /app/
COPY yarn.lock /app/
COPY tsconfig.json /app/

# Install dependencies using Yarn
RUN yarn

# Set the default command to run your application in development mode
CMD ["yarn", "run", "docker"]
