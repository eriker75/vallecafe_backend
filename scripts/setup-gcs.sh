#!/usr/bin/env bash
#
# setup-gcs.sh — Configura Google Cloud Storage para el backend de Terroir.
#
# Hace (todo idempotente, seguro de re-correr):
#   1. Login de ADC (credenciales de usuario, SIN clave de service account)
#   2. Fija el quota project del ADC
#   3. Crea el bucket si no existe (uniform bucket-level access)
#   4. (opcional) Lo hace público para lectura  (allUsers → objectViewer)
#   5. Copia el ADC a backend/secrets/ para montarlo en Docker
#
# Uso:
#   ./scripts/setup-gcs.sh
#   GCS_BUCKET_NAME=mi-bucket GCS_LOCATION=southamerica-east1 ./scripts/setup-gcs.sh
#   MAKE_PUBLIC=false ./scripts/setup-gcs.sh        # bucket privado
#   SKIP_LOGIN=true ./scripts/setup-gcs.sh          # no rehacer el login ADC
#
set -euo pipefail

# ── Configuración (sobrescribible con variables de entorno) ───────────────────
GCP_PROJECT_ID="${GCP_PROJECT_ID:-terroir-497922}"
GCS_BUCKET_NAME="${GCS_BUCKET_NAME:-terroir_files_bucket}"
GCS_LOCATION="${GCS_LOCATION:-US}"
GCP_ACCOUNT="${GCP_ACCOUNT:-}"          # email opcional; si no, usa la cuenta activa del CLI
MAKE_PUBLIC="${MAKE_PUBLIC:-true}"
SKIP_LOGIN="${SKIP_LOGIN:-false}"

# Rutas (este script vive en backend/scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
SECRETS_DIR="$BACKEND_DIR/secrets"
ADC_FILE="$HOME/.config/gcloud/application_default_credentials.json"
DEST_ADC="$SECRETS_DIR/terroir-adc.json"

# gcloud usa la cuenta indicada solo para los comandos de bucket, sin tocar tu
# config global, si pasas GCP_ACCOUNT.
ACCOUNT_FLAG=()
[ -n "$GCP_ACCOUNT" ] && ACCOUNT_FLAG=(--account "$GCP_ACCOUNT")

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { printf "\n\033[1;36m▶ %s\033[0m\n" "$1"; }
ok()   { printf "  \033[0;32m✅ %s\033[0m\n" "$1"; }
warn() { printf "  \033[0;33m⚠️  %s\033[0m\n" "$1"; }

command -v gcloud >/dev/null 2>&1 || {
  echo "❌ gcloud no está instalado → https://cloud.google.com/sdk/docs/install"
  exit 1
}

# ── 1 + 2. ADC: login de usuario + quota project ──────────────────────────────
# El ADC (Application Default Credentials) es lo que lee la APP, independiente de
# la cuenta activa del CLI. En producción NO uses esto: usa Workload Identity o
# una service account adjunta (SKIP_LOGIN=true y deja que el entorno provea ADC).
if [ "$SKIP_LOGIN" != "true" ]; then
  log "Login de Application Default Credentials (se abrirá el navegador)"
  echo "  → elige la cuenta DUEÑA del proyecto $GCP_PROJECT_ID"
  gcloud auth application-default login
  gcloud auth application-default set-quota-project "$GCP_PROJECT_ID"
  ok "ADC configurado con quota project $GCP_PROJECT_ID"
else
  warn "SKIP_LOGIN=true → se omite el login ADC (se asume que ya existe)"
fi

# ── 3. Bucket (idempotente) ───────────────────────────────────────────────────
if gcloud "${ACCOUNT_FLAG[@]}" storage buckets describe "gs://$GCS_BUCKET_NAME" >/dev/null 2>&1; then
  ok "El bucket gs://$GCS_BUCKET_NAME ya existe"
else
  log "Creando bucket gs://$GCS_BUCKET_NAME ($GCS_LOCATION)"
  gcloud "${ACCOUNT_FLAG[@]}" storage buckets create "gs://$GCS_BUCKET_NAME" \
    --project="$GCP_PROJECT_ID" \
    --location="$GCS_LOCATION" \
    --uniform-bucket-level-access
  ok "Bucket creado"
fi

# ── 4. Lectura pública (opcional) ─────────────────────────────────────────────
if [ "$MAKE_PUBLIC" = "true" ]; then
  log "Concediendo lectura pública (allUsers → roles/storage.objectViewer)"
  gcloud "${ACCOUNT_FLAG[@]}" storage buckets add-iam-policy-binding "gs://$GCS_BUCKET_NAME" \
    --member=allUsers --role=roles/storage.objectViewer >/dev/null
  ok "Bucket público para lectura (las imágenes del catálogo serán accesibles por URL)"
else
  warn "MAKE_PUBLIC=false → bucket privado; las URLs públicas NO funcionarán sin firmar URLs"
fi

# ── 5. Copiar ADC al proyecto para montarlo en Docker ─────────────────────────
if [ -f "$ADC_FILE" ]; then
  log "Copiando credencial ADC → $DEST_ADC"
  mkdir -p "$SECRETS_DIR"
  cp "$ADC_FILE" "$DEST_ADC"
  chmod 600 "$DEST_ADC"
  ok "Credencial copiada (secrets/ está en .gitignore, no se sube al repo)"
else
  warn "No se encontró el ADC en $ADC_FILE (¿corriste el login?). Copia omitida."
fi

# ── Resumen ───────────────────────────────────────────────────────────────────
cat <<EOF

────────────────────────────────────────────────────────────
✅ Google Cloud Storage listo.

Asegúrate de tener esto en backend/.env:
  STORAGE_TYPE=gcs
  GCS_BUCKET_NAME=$GCS_BUCKET_NAME
  GCP_PROJECT_ID=$GCP_PROJECT_ID
  GOOGLE_APPLICATION_CREDENTIALS=/usr/src/app/secrets/terroir-adc.json

Y en docker-compose.dev.yml (volúmenes del backend):
  - ./secrets:/usr/src/app/secrets:ro

Luego recrea el backend:
  docker compose -p terroir_dev -f docker-compose.dev.yml up -d backend

Verifica en el log:  Storage backend: gcs
────────────────────────────────────────────────────────────
EOF
