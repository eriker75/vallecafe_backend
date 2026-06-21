#!/bin/sh
# Build DATABASE_URL from individual vars if not already set
if [ -z "$DATABASE_URL" ]; then
  _user="${DB_USER:-${POSTGRES_USER:-terroir_user}}"
  _pass="${DB_PASSWORD:-${POSTGRES_PASSWORD}}"
  _host="${DB_HOST:-postgres}"
  _port="${DB_PORT:-5432}"
  _name="${DB_NAME:-${POSTGRES_DB:-terroir_db}}"
  _schema="${DB_SCHEMA:-public}"
  export DATABASE_URL="postgresql://${_user}:${_pass}@${_host}:${_port}/${_name}?schema=${_schema}"
  echo "[terroir] DATABASE_URL built from individual vars"
else
  echo "[terroir] Using existing DATABASE_URL"
fi
