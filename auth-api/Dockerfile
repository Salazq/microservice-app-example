FROM golang:1.18-alpine AS builder

WORKDIR /app

COPY . .

RUN if [ ! -f go.mod ]; then go mod init auth-api; fi && \
    go mod tidy && \
    go build -o auth-api .

FROM alpine:latest

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY --from=builder /app/auth-api .

RUN chown appuser:appgroup /app/auth-api

USER appuser

CMD ["./auth-api"]