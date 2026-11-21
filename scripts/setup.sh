#!/bin/bash
set -e

echo "=========================================================="
echo " CertiFlow - Pragati Skills Mission Setup Script (Linux)"
echo "=========================================================="

# 1. Check Node and Docker
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required but not installed. Aborting." >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required but not installed. Aborting." >&2; exit 1; }

echo "✅ Node.js $(node -v) detected"
echo "✅ Docker $(docker -v) detected"

# 2. Setup Backend
echo "📦 Installing backend packages..."
cd backend
npm ci

echo "🗄️ Initializing Prisma Client..."
npx prisma generate

echo "🐳 Starting Postgres and Redis..."
cd ..
docker compose up -d postgres redis

echo "⏳ Waiting for PostgreSQL container to become healthy..."
until docker exec certiflow-postgres pg_isready -U certiflow -d certiflow >/dev/null 2>&1; do
  sleep 1
done
echo "✅ PostgreSQL is healthy!"

echo "🔄 Syncing database schema..."
cd backend
npx prisma db push

echo "🌱 Seeding demo personas (Anika, Dev, Meera, Kabir, Neha, Farah)..."
npx tsx prisma/seed.ts
cd ..

# 3. Setup Frontend
echo "🎨 Installing frontend packages..."
cd frontend
npm ci

echo "✨ Building frontend production bundle..."
npm run build
cd ..

echo "=========================================================="
echo "🎉 CertiFlow setup completed successfully!"
echo "   Start the stack:  docker compose up --build"
echo "   Run tests:        make test"
echo "=========================================================="
