FROM node:22

WORKDIR /data

COPY . .

CMD ["node", "."]