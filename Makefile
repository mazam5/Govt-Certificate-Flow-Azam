.PHONY: help setup dev build test seed clean docker-up docker-down docker-logs

help:
	@echo "CertiFlow - Pragati Skills Mission Management Commands"
	@echo "  make setup        Install all dependencies and push schema"
	@echo "  make dev          Start local backend & frontend in development mode"
	@echo "  make test         Execute full Vitest integration suite (6 critical moments)"
	@echo "  make build        Typecheck and build production artifacts"
	@echo "  make seed         Seed database with demo personas and centres"
	@echo "  make docker-up    Start full stack with single command via Docker Compose"
	@echo "  make docker-down  Tear down Docker containers and clean networks"

setup:
	@echo "🚀 Setting up CertiFlow..."
	@bash scripts/setup.sh

dev:
	@echo "✨ Starting CertiFlow development servers..."
	@cd backend && npm run dev &
	@cd frontend && npm run dev

test:
	@echo "🧪 Running 6 Critical Moments Integration Test Suite..."
	@cd backend && npm run test

build:
	@echo "📦 Compiling backend & frontend production bundles..."
	@cd backend && npm run build
	@cd frontend && npm run build

seed:
	@echo "🌱 Seeding personas..."
	@cd backend && npx tsx prisma/seed.ts

docker-up:
	@echo "🐳 Launching CertiFlow full containerized cluster..."
	@docker compose up --build -d

docker-down:
	@echo "🛑 Stopping CertiFlow containers..."
	@docker compose down

docker-logs:
	@docker compose logs -f
