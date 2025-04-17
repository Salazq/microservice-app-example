FROM node:8.17.0

WORKDIR /app

COPY . .

RUN npm install

EXPOSE 8080


ENV PORT=8080 \
    AUTH_API_ADDRESS=http://auth-api:8081/ \
    TODOS_API_ADDRESS=http://todos-api:8082/ \
    ZIPKIN_URL=http://zipkin:9411/api/v2/spans

CMD ["npm", "start"]