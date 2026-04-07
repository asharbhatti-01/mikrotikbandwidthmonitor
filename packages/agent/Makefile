BINARY_NAME = agent
VERSION     = $(shell git describe --tags --always 2>/dev/null || echo "dev")

.PHONY: build build-all test clean lint tidy

## build: compile the agent for the current OS/arch
build:
	@mkdir -p bin
	go build -ldflags="-X main.Version=$(VERSION)" -o bin/$(BINARY_NAME) ./cmd/agent

## build-all: cross-compile for Linux amd64, arm64, and mipsle (MikroTik RouterBOARD)
build-all:
	@mkdir -p bin
	GOOS=linux GOARCH=amd64   go build -ldflags="-X main.Version=$(VERSION) -s -w" -o bin/$(BINARY_NAME)-linux-amd64   ./cmd/agent
	GOOS=linux GOARCH=arm64   go build -ldflags="-X main.Version=$(VERSION) -s -w" -o bin/$(BINARY_NAME)-linux-arm64   ./cmd/agent
	GOOS=linux GOARCH=mipsle  go build -ldflags="-X main.Version=$(VERSION) -s -w" -o bin/$(BINARY_NAME)-linux-mipsle  ./cmd/agent

## test: run all tests
test:
	go test ./...

## lint: run golangci-lint (install separately: go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest)
lint:
	golangci-lint run ./...

## tidy: tidy and verify go modules
tidy:
	go mod tidy
	go mod verify

## clean: remove compiled binaries
clean:
	rm -rf bin/
