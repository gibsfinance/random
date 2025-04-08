FROM node:lts

ARG INDEXER_URL
ENV INDEXER_URL=$INDEXER_URL

COPY ./package.json /app/package.json
COPY ./src /app/src
COPY ./package-lock.json /app/package-lock.json
COPY ./tsconfig.json /app/tsconfig.json
COPY ./codegen.config.cjs /app/codegen.config.cjs
COPY ./config.ts /app/config.ts
COPY ./knexfile.ts /app/knexfile.ts
WORKDIR /app

RUN npm install

CMD [ "bash", "-c", "npm run provide" ]
