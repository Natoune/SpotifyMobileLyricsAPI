FROM node:23-alpine3.19
RUN apk --no-cache add git

WORKDIR /usr/src/app

RUN git clone https://github.com/Natoune/SpotifyMobileLyricsAPI.git .

RUN npm install -g pnpm
RUN pnpm install

RUN pnpm build

ENV PORT=3000
EXPOSE 3000

CMD [ "node", "adapter/node.mjs" ]
