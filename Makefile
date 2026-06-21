COMPOSE_DEV  = docker-compose.dev.yml
COMPOSE_PROD = docker-compose.prod.yml
PROJECT      = terroir

# ─── Desarrollo ────────────────────────────────────────────────────────────────

up-dev:
	docker compose -f $(COMPOSE_DEV) -p $(PROJECT)_dev up --build

up-dev-watch:
	docker compose -f $(COMPOSE_DEV) -p $(PROJECT)_dev up --build --watch

down-dev:
	docker compose -f $(COMPOSE_DEV) -p $(PROJECT)_dev down

restart-dev:
	docker compose -f $(COMPOSE_DEV) -p $(PROJECT)_dev restart

restart-backend:
	docker compose -f $(COMPOSE_DEV) -p $(PROJECT)_dev restart backend

logs-dev:
	docker compose -f $(COMPOSE_DEV) -p $(PROJECT)_dev logs -f

logs-backend:
	docker compose -f $(COMPOSE_DEV) -p $(PROJECT)_dev logs -f backend

ps-dev:
	docker compose -f $(COMPOSE_DEV) -p $(PROJECT)_dev ps

clean-dev:
	docker compose -f $(COMPOSE_DEV) -p $(PROJECT)_dev down --volumes

destroy-dev:
	docker compose -f $(COMPOSE_DEV) -p $(PROJECT)_dev down --volumes --rmi all

# ─── Producción ────────────────────────────────────────────────────────────────

up-prod:
	docker compose -f $(COMPOSE_PROD) -p $(PROJECT)_prod up -d --build

down-prod:
	docker compose -f $(COMPOSE_PROD) -p $(PROJECT)_prod down

logs-prod:
	docker compose -f $(COMPOSE_PROD) -p $(PROJECT)_prod logs -f

ps-prod:
	docker compose -f $(COMPOSE_PROD) -p $(PROJECT)_prod ps

clean-prod:
	docker compose -f $(COMPOSE_PROD) -p $(PROJECT)_prod down --volumes

destroy-prod:
	docker compose -f $(COMPOSE_PROD) -p $(PROJECT)_prod down --volumes --rmi all

# Build imagen prod directamente (para Cloud Run / GCR)
build-prod:
	DOCKER_BUILDKIT=1 docker compose -f $(COMPOSE_PROD) -p $(PROJECT)_prod build

build-image:
	docker build -f Dockerfile.prod -t terroir-backend:latest .

# ─── Base de datos ─────────────────────────────────────────────────────────────

migrate-dev:
	docker exec -it terroir_backend npx prisma migrate dev

migrate-deploy:
	docker exec -it terroir_backend npx prisma migrate deploy

studio:
	docker exec -it terroir_backend npx prisma studio --port 5555 --browser none

generate:
	docker exec -it terroir_backend npx prisma generate

seed:
	docker exec -it terroir_backend npm run seed

# Crea/restablece el admin (eriadmin@gmail.com / Admin123? por defecto) usando
# Prisma + bcrypt de la app. Override: make create-admin EMAIL=x@y.com PASS=Clave1?
# Corre el .cjs con `node` (la carpeta ./prisma está montada; no depende de
# package.json ni de ts-node/tsconfig).
create-admin:
	docker exec -it -e ADMIN_EMAIL="$(EMAIL)" -e ADMIN_PASSWORD="$(PASS)" terroir_backend node prisma/seed-admin.cjs

# ─── Shells ────────────────────────────────────────────────────────────────────

shell:
	docker exec -it terroir_backend bash

shell-db:
	docker exec -it terroir_postgres psql -U $(shell grep POSTGRES_USER .env | cut -d= -f2) \
	  -d $(shell grep POSTGRES_DB .env | cut -d= -f2)

# ─── Google Cloud Run (guía completa en ../docs/deploy-gcp.md) ──────────────────
# La infra (APIs, Cloud SQL, bucket, service account, secretos) se crea manual
# UNA vez — ver la guía. Estos targets solo despliegan.

# Config: edita aquí o pasa por línea de comandos (make gcp-deploy PROJECT_ID=otro)
PROJECT_ID      ?= terroir-497922
REGION          ?= us-east1
REPO            ?= terroir-artifacts-repository
SQL_INSTANCE    ?= terroir-db-instance
BUCKET          ?= terroir_files_bucket
BACKEND_SERVICE ?= terroir-backend
WEB_SERVICE     ?= terroir-web
TZ              ?= America/Caracas
# URLs del web desplegado (separadas por ';' — la coma la reserva gcloud).
# Cloud Run da DOS URLs válidas al mismo servicio: ambas van permitidas.
# Va en CADA deploy porque --set-env-vars reemplaza todas las env vars.
CORS_ORIGIN     ?= https://terroir-web-rkcvtfjtfa-ue.a.run.app;https://terroir-web-430742211550.us-east1.run.app
# URL canónica del web para los enlaces de los correos (verificación / reset).
# Una sola URL (no lista). Cambiar al dominio propio cuando exista.
FRONTEND_URL    ?= https://terroir-web-rkcvtfjtfa-ue.a.run.app

# SMTP de producción (la clave va en el secreto terroir-smtp-pass, no aquí)
SMTP_HOST ?=
SMTP_PORT ?= 587
SMTP_USER ?=
SMTP_FROM ?= noreply@tudominio.com

# Login social (vacíos = deshabilitado)
GOOGLE_WEB_CLIENT_ID     ?= 430742211550-aubqke137np09p9im7c5sv5hacv32la6.apps.googleusercontent.com
GOOGLE_IOS_CLIENT_ID     ?= 430742211550-lj5kmjjrhc6tci15f341n4hh1ubpv1qk.apps.googleusercontent.com
GOOGLE_ANDROID_CLIENT_ID ?= 430742211550-impju5kjn50tjumm3v6llsrt41b93sgj.apps.googleusercontent.com
APPLE_BUNDLE_ID          ?= com.terroir.eribert
APPLE_SERVICE_ID         ?= com.terroir.web.signin

# R4 Conecta (el token R4_COMMERCE_ID va en el secreto terroir-r4-commerce-id).
# La cuenta receptora es FALLBACK: la prioridad la tienen los settings del admin.
R4_BASE_URL          ?= https://r4conecta.mibanco.com.ve
R4_CUENTA_BANCO      ?= 0169
R4_CUENTA_CEDULA     ?= J-508025903
R4_CUENTA_TELEFONO   ?= 04245191996
# Separadas por ';' (la coma es el separador de --set-env-vars de gcloud)
R4_ALLOWED_IPS       ?= 45.175.213.98;200.74.203.91;204.199.249.3

BACKEND_IMAGE = $(REGION)-docker.pkg.dev/$(PROJECT_ID)/$(REPO)/backend:latest
BACKEND_SA    = terroir-backend@$(PROJECT_ID).iam.gserviceaccount.com

# Env vars de runtime (las secretas van por Secret Manager)
BACKEND_ENV = NODE_ENV=production,RUN_MIGRATIONS=false,TZ=$(TZ),STORAGE_TYPE=gcs,GCS_BUCKET_NAME=$(BUCKET),GCP_PROJECT_ID=$(PROJECT_ID),CORS_ORIGIN=$(CORS_ORIGIN),FRONTEND_URL=$(FRONTEND_URL),SMTP_HOST=$(SMTP_HOST),SMTP_PORT=$(SMTP_PORT),SMTP_USER=$(SMTP_USER),SMTP_FROM=$(SMTP_FROM),GOOGLE_WEB_CLIENT_ID=$(GOOGLE_WEB_CLIENT_ID),GOOGLE_IOS_CLIENT_ID=$(GOOGLE_IOS_CLIENT_ID),GOOGLE_ANDROID_CLIENT_ID=$(GOOGLE_ANDROID_CLIENT_ID),APPLE_BUNDLE_ID=$(APPLE_BUNDLE_ID),APPLE_SERVICE_ID=$(APPLE_SERVICE_ID),R4_BASE_URL=$(R4_BASE_URL),R4_CUENTA_BANCO=$(R4_CUENTA_BANCO),R4_CUENTA_CEDULA=$(R4_CUENTA_CEDULA),R4_CUENTA_TELEFONO=$(R4_CUENTA_TELEFONO),R4_ALLOWED_IPS=$(R4_ALLOWED_IPS)

BACKEND_SECRETS = DATABASE_URL=terroir-database-url:latest,JWT_SECRET=terroir-jwt-secret:latest,R4_WEBHOOK_TOKEN=terroir-r4-webhook-token:latest,R4_COMMERCE_ID=terroir-r4-commerce-id:latest,SMTP_PASS=terroir-smtp-pass:latest

.PHONY: gcp-check gcp-auth gcp-build gcp-upload gcp-publish gcp-cloudbuild \
        gcp-migrate gcp-service gcp-deploy gcp-cors gcp-logs gcp-url

gcp-check:
ifeq ($(strip $(PROJECT_ID)),)
	$(error PROJECT_ID vacío: edita la sección "Google Cloud Run" de este Makefile)
endif

# Autentica el docker local contra Artifact Registry (una vez; lo usa gcp-upload)
gcp-auth: gcp-check
	gcloud auth configure-docker $(REGION)-docker.pkg.dev --quiet

# Build LOCAL de la imagen (amd64, la arquitectura de Cloud Run)
gcp-build: gcp-check
	docker build -f Dockerfile.prod --platform linux/amd64 -t $(BACKEND_IMAGE) .

# Sube la imagen local a Artifact Registry (requiere make gcp-auth una vez)
gcp-upload: gcp-check
	docker push $(BACKEND_IMAGE)

# Build local + upload
gcp-publish: gcp-build gcp-upload

# Pipeline REMOTO completo en Cloud Build: build → push → migraciones → deploy.
# Es el mismo cloudbuild.yaml que ejecuta el trigger de GitHub en cada push.
gcp-cloudbuild: gcp-check
	gcloud builds submit --config cloudbuild.yaml \
	  --substitutions="_REGION=$(REGION),_REPO=$(REPO),_SQL_INSTANCE=$(SQL_INSTANCE),_BUCKET=$(BUCKET),_CORS_ORIGIN=$(CORS_ORIGIN),_FRONTEND_URL=$(FRONTEND_URL),_GOOGLE_WEB_CLIENT_ID=$(GOOGLE_WEB_CLIENT_ID),_GOOGLE_IOS_CLIENT_ID=$(GOOGLE_IOS_CLIENT_ID),_GOOGLE_ANDROID_CLIENT_ID=$(GOOGLE_ANDROID_CLIENT_ID),_SMTP_HOST=$(SMTP_HOST),_SMTP_USER=$(SMTP_USER),_SMTP_FROM=$(SMTP_FROM),_R4_CUENTA_BANCO=$(R4_CUENTA_BANCO),_R4_CUENTA_CEDULA=$(R4_CUENTA_CEDULA),_R4_CUENTA_TELEFONO=$(R4_CUENTA_TELEFONO),_R4_ALLOWED_IPS=$(R4_ALLOWED_IPS)" .

# Migraciones como Cloud Run Job: misma imagen, pero solo `npx prisma migrate deploy`.
# Se corre ANTES de desplegar el servicio (que arranca con RUN_MIGRATIONS=false).
gcp-migrate: gcp-check
	gcloud run jobs deploy terroir-migrate --image $(BACKEND_IMAGE) --region $(REGION) \
	  --service-account $(BACKEND_SA) \
	  --set-cloudsql-instances $(PROJECT_ID):$(REGION):$(SQL_INSTANCE) \
	  --set-secrets "DATABASE_URL=terroir-database-url:latest" \
	  --command npx --args prisma,migrate,deploy \
	  --memory 1Gi --max-retries 0 --task-timeout 600
	gcloud run jobs execute terroir-migrate --region $(REGION) --wait

# Solo (re)despliega el servicio con la imagen ya subida a Artifact Registry.
# VPC/NAT: el egress sale por la VPC default → Cloud NAT → IP fija 34.73.166.231
# (whitelist del banco R4). Ver docs/cloud-nat-r4.md. NO quitar estas flags.
gcp-service: gcp-check
	gcloud run deploy $(BACKEND_SERVICE) --image $(BACKEND_IMAGE) --region $(REGION) \
	  --service-account $(BACKEND_SA) \
	  --add-cloudsql-instances $(PROJECT_ID):$(REGION):$(SQL_INSTANCE) \
	  --network=default --subnet=default --vpc-egress=all-traffic \
	  --allow-unauthenticated --memory 1Gi --cpu 1 --min-instances 0 --max-instances 3 \
	  --set-secrets "$(BACKEND_SECRETS)" \
	  --set-env-vars "$(BACKEND_ENV)"

# Todo-en-uno: el pipeline de Cloud Build ya incluye migraciones y deploy.
# (La vía local equivalente: gcp-publish + gcp-migrate + gcp-service.)
gcp-deploy: gcp-cloudbuild

# Apunta CORS_ORIGIN a la URL del web desplegado (runtime, sin rebuild)
gcp-cors: gcp-check
	@WEB_URL=$$(gcloud run services describe $(WEB_SERVICE) --region $(REGION) --format='value(status.url)') && \
	gcloud run services update $(BACKEND_SERVICE) --region $(REGION) --update-env-vars CORS_ORIGIN=$$WEB_URL

gcp-logs: gcp-check
	gcloud run services logs read $(BACKEND_SERVICE) --region $(REGION) --limit 100

gcp-url: gcp-check
	@gcloud run services describe $(BACKEND_SERVICE) --region $(REGION) --format='value(status.url)'

# ─── Utilidades ────────────────────────────────────────────────────────────────

stats:
	docker stats

prune:
	docker system prune -a --volumes

.PHONY: help
help:
	@echo ""
	@echo "  Terroir Backend — Comandos Docker"
	@echo ""
	@echo "  Desarrollo:"
	@echo "    make up-dev           Levanta todo con build (postgres + mailpit + backend)"
	@echo "    make up-dev-watch     Igual + hot-reload con docker compose watch"
	@echo "    make down-dev         Para los contenedores"
	@echo "    make restart-backend  Reinicia solo el backend"
	@echo "    make logs-backend     Logs del backend en tiempo real"
	@echo "    make clean-dev        Para y borra volúmenes"
	@echo ""
	@echo "  Base de datos:"
	@echo "    make migrate-dev      Crea/aplica migraciones (desarrollo)"
	@echo "    make migrate-deploy   Aplica migraciones (producción)"
	@echo "    make studio           Abre Prisma Studio en :5555"
	@echo "    make seed             Ejecuta el seed"
	@echo ""
	@echo "  Producción:"
	@echo "    make up-prod          Levanta en modo prod con .env.prod"
	@echo "    make build-image      Build imagen Docker local"
	@echo ""
	@echo "  Google Cloud Run (config al inicio de la sección GCP de este Makefile):"
	@echo "    make gcp-deploy       TODO: build remoto + migraciones + deploy"
	@echo "    make gcp-build        Build local de la imagen (amd64)"
	@echo "    make gcp-upload       Sube la imagen local a Artifact Registry"
	@echo "    make gcp-publish      Build local + upload"
	@echo "    make gcp-cloudbuild   Build + push remoto en Cloud Build"
	@echo "    make gcp-migrate      Corre migraciones (Cloud Run Job)"
	@echo "    make gcp-service      Solo despliega el servicio (imagen ya subida)"
	@echo "    make gcp-cors         Apunta CORS_ORIGIN a la URL del web"
	@echo "    make gcp-logs         Últimos logs en Cloud Run"
	@echo "    make gcp-url          URL pública del servicio"
	@echo ""
	@echo "  Shells:"
	@echo "    make shell            Accede al contenedor backend"
	@echo "    make shell-db         Accede a psql"
	@echo ""
