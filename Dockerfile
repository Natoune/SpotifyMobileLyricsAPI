FROM node:23-alpine3.19

WORKDIR /usr/src/app

COPY . .

RUN npm install -g pnpm
RUN pnpm install

RUN pnpm build

ENV PORT=3000
EXPOSE 3000

CMD [ "node", "adapter/node.mjs" ]
