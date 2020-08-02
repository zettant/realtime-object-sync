# ベースとなるDockerイメージ指定
FROM node:14-alpine

# コンテナログイン時のディレクトリ指定
WORKDIR /usr/src/app

# アプリケーションの依存関係をインストールする
COPY server/package.json ./

RUN yarn install

# アプリケーションのソースをバンドルする
COPY server/ .

CMD [ "yarn", "start" ]

