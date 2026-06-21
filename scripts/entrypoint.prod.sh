#!/bin/sh
set -e

# Build DATABASE_URL from individual vars if not already set
if [ -z "$DATABASE_URL" ]; then
  . /usr/src/app/scripts/build-database-url.sh
fi

# En docker-compose corre aquí (default true). En Cloud Run va RUN_MIGRATIONS=false:
# las migraciones las ejecuta el job terroir-migrate (make gcp-migrate) antes del deploy,
# para no pagar `migrate deploy` en cada cold start de cada instancia.
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[terroir] Running Prisma migrations..."
  npx prisma migrate deploy
  echo "[terroir] Migrations done."
else
  echo "[terroir] RUN_MIGRATIONS=false — skipping migrations."
fi

echo "[terroir] Starting app..."
exec "$@"
