FROM oven/bun:latest

ARG NPM_TOKEN
ENV NPM_TOKEN=$NPM_TOKEN
ARG INDEXER_URL
ENV INDEXER_URL=$INDEXER_URL

COPY ./package.json /app/package.json
COPY ./src /app/src
COPY ./pnpm-lock.yaml /app/pnpm-lock.yaml
COPY ./tsconfig.json /app/tsconfig.json
COPY ./codegen.config.cjs /app/codegen.config.cjs
COPY ./config.ts /app/config.ts
COPY ./knexfile.ts /app/knexfile.ts
WORKDIR /app

RUN bun install

CMD [ "bash", "-c", "bun provide" ]
