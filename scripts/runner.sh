#!/bin/bash
set -e

echo "[terroir] Applying pending migrations..."
npx prisma migrate deploy

echo "[terroir] Generating Prisma client..."
npx prisma generate

echo "[terroir] Starting NestJS development server..."
exec npm run start:dev
