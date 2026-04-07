# ---- Build ----
FROM golang:1.24-alpine AS build
WORKDIR /src
RUN apk add --no-cache git ca-certificates
COPY packages/agent/go.mod packages/agent/go.sum ./
RUN go mod download || true
COPY packages/agent/ .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /bin/agent ./cmd/agent

# ---- Development ----
FROM golang:1.24-alpine AS dev
WORKDIR /src
RUN apk add --no-cache git ca-certificates
RUN go install github.com/air-verse/air@v1.61.7
# Source is bind-mounted in dev via docker-compose
EXPOSE 8080
CMD ["air", "-c", ".air.toml"]

# ---- Production / Staging ----
FROM alpine:3.20 AS production
RUN apk add --no-cache ca-certificates tzdata
COPY --from=build /bin/agent /usr/local/bin/agent
ENTRYPOINT ["agent"]
