FROM node:20.11.1

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

ARG NODE_ENV
ENV NODE_ENV=$NODE_ENV

COPY package-lock.json /usr/src/app/package-lock.json
COPY package.json /usr/src/app/package.json
RUN npm i --force

COPY src /usr/src/app/src
COPY contracts /usr/src/app/contracts
COPY tasks /usr/src/app/tasks
COPY bin /usr/src/app/bin
COPY example.config.ts /usr/src/app/example.config.ts
COPY config.ts /usr/src/app/config.ts
COPY hardhat.config.ts /usr/src/app/hardhat.config.ts
COPY knexfile.ts /usr/src/app/knexfile.ts
COPY tsconfig.json /usr/src/app/tsconfig.json
COPY .eslintrc.mjs /usr/src/app/.eslintrc.mjs
COPY .prettierrc /usr/src/app/.prettierrc
RUN npm run build

ARG NETWORK
ENV NETWORK=$NETWORK
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL
ARG DATABASE_NAME
ENV DATABASE_NAME=$DATABASE_NAME
ARG DATABASE_SSL
ENV DATABASE_SSL=$DATABASE_SSL
ARG RPC_369
ENV RPC_369=$RPC_369
ARG RPC_943
ENV RPC_943=$RPC_943

COPY ./config.ts /usr/src/app/config.ts

CMD ["npm", "run", "collect"]
