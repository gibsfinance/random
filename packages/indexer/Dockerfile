FROM node:20-slim
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY ./package.json /app/package.json
COPY ./src /app/src
COPY ./pnpm-lock.yaml /app/pnpm-lock.yaml
COPY ./ponder-env.d.ts /app/ponder-env.d.ts
COPY ./ponder.config.ts /app/ponder.config.ts
COPY ./ponder.schema.ts /app/ponder.schema.ts
COPY ./tsconfig.json /app/tsconfig.json
COPY ./.eslintrc.json /app/.eslintrc.json
WORKDIR /app

RUN pnpm install

EXPOSE 8000
EXPOSE 42069
CMD [ "bash", "-c", "pnpm build && pnpm dev" ]
