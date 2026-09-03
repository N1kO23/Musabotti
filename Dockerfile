FROM node:24-alpine

# ffmpeg powers audio decoding/filtering; no native build tools are needed
# for the rest since all other JS dependencies (voice, opus encoding) are
# pure JS/WASM
RUN apk add --no-cache ffmpeg
RUN corepack enable

# yt-dlp does all YouTube extraction/downloading (see src/services/ytSource.ts) -
# a standalone musllinux binary, so no Python runtime is needed on Alpine
ARG TARGETARCH
RUN case "$TARGETARCH" in \
      amd64) YTDLP_ASSET="yt-dlp_musllinux" ;; \
      arm64) YTDLP_ASSET="yt-dlp_musllinux_aarch64" ;; \
      *) echo "Unsupported architecture for yt-dlp: $TARGETARCH" >&2; exit 1 ;; \
    esac && \
    wget -O /usr/local/bin/yt-dlp "https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YTDLP_ASSET}" && \
    chmod +x /usr/local/bin/yt-dlp

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
