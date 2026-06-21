# Terroir — Backend

Backend de **Terroir** (e‑commerce de café) construido con [NestJS](https://nestjs.com) + Prisma + PostgreSQL.
Corre en producción en **Google Cloud Run** con CI/CD desde este repo (push a `main` → deploy).

## Puesta en marcha (Docker, desarrollo)

```bash
cp .env.example .env          # completa los valores (al menos POSTGRES_PASSWORD y JWT_SECRET)
make up-dev                   # levanta postgres + pgadmin + mailpit + backend
make migrate-dev              # crea/aplica migraciones de Prisma (y genera el cliente)
```

> **PostGIS (diferido)**: la ubicación se guarda hoy en `latitude`/`longitude`. La
> columna geográfica `addresses.location` está **comentada** en `schema.prisma`
> porque requiere la extensión `postgis` (la imagen `postgres` no la incluye).
> Para reactivarla: usa una imagen `postgis/postgis` (o `CREATE EXTENSION postgis`),
> descomenta la columna en el schema y el bloque en `orders.service`, y vuelve a
> migrar. Ver [`sql/bcv_postgis.sql`](sql/bcv_postgis.sql).

Comandos útiles: `make logs-backend`, `make restart-backend`, `make migrate-dev`,
`make studio` (Prisma Studio), `make shell` / `make shell-db`. Ver `make help`.

## Correos (Mailpit en dev, Resend en producción)

- **Dev**: `docker-compose.dev.yml` levanta **Mailpit**, un SMTP falso que captura
  todo lo enviado — UI en <http://localhost:8025>. Las variables `SMTP_*` del
  `.env` ya apuntan a él, así que cualquier correo que el backend envíe se ve
  ahí sin riesgo de mandar nada real.
- **Estado actual**: `MailerModule` es un cascarón vacío — **el backend aún no
  envía ningún correo**. Los flujos típicos (verificación de cuenta, recuperar
  contraseña) están pendientes de implementar: las páginas de reset existen en
  web/mobile, pero faltan los endpoints + el envío del email con el token.
- **Plan de producción**: [Resend](https://resend.com) **vía SMTP**, que encaja
  con la config existente sin tocar código: `SMTP_HOST=smtp.resend.com`,
  `SMTP_PORT=587`, `SMTP_USER=resend`, `SMTP_PASS=<API key>` (en el secreto
  `terroir-smtp-pass`), `SMTP_FROM=noreply@<dominio-verificado-en-Resend>`.
  Requiere verificar el dominio en Resend (registros DNS).

## Variables de entorno

Todas viven en `.env` (copia de `.env.example`). En desarrollo, `docker-compose.dev.yml`
construye `DATABASE_URL` a partir de las variables `POSTGRES_*`.

### Base de datos (PostgreSQL)

| Variable | Req. | Default | Descripción |
|---|---|---|---|
| `POSTGRES_USER` | sí | `terroir_user` | Usuario de la base de datos |
| `POSTGRES_PASSWORD` | sí | — | Contraseña de la base de datos |
| `POSTGRES_DB` | sí | `terroir_db` | Nombre de la base de datos |
| `POSTGRES_EXT_PORT` | no | `5432` | Puerto de Postgres expuesto al host |
| `TZ` | no | `America/Caracas` | Zona horaria del contenedor |
| `DATABASE_URL` | auto | — | URL de conexión Prisma. La arma docker-compose; defínela solo si corres sin Docker. En Cloud Run viene del secreto `terroir-database-url` (socket `/cloudsql/...`) |

### Backend / API

| Variable | Req. | Default | Descripción |
|---|---|---|---|
| `PORT` | no | `3000` | Puerto interno de Nest (Cloud Run inyecta el suyo) |
| `BACKEND_PORT` | no | `3000` | Puerto del backend expuesto al host (solo Docker local) |
| `CORS_ORIGIN` | sí | `http://localhost:7050` | Orígenes permitidos, separados por coma. En producción: la URL del web |
| `JWT_SECRET` | sí | — | Secreto para firmar los JWT. En Cloud Run: secreto `terroir-jwt-secret` |
| `RUN_MIGRATIONS` | no | `true` | El entrypoint corre `prisma migrate deploy` al arrancar. En Cloud Run va en `false`: migra el job `terroir-migrate` antes de cada deploy |

### Email (SMTP — en dev apunta a Mailpit)

| Variable | Req. | Default | Descripción |
|---|---|---|---|
| `SMTP_HOST` | sí | `mailpit` | Host SMTP (prod: `smtp.resend.com`) |
| `SMTP_PORT` | sí | `1025` | Puerto SMTP (prod: `587`) |
| `SMTP_USER` / `SMTP_PASS` | no | `mailpit` | Credenciales SMTP (prod: `resend` / API key en el secreto `terroir-smtp-pass`) |
| `SMTP_FROM` | no | `noreply@terroir.local` | Remitente de los correos |
| `MAILPIT_*` | no (dev) | — | Config del contenedor Mailpit (UI en `:8025`) |
| `PGADMIN_*` | no (dev) | — | Credenciales/puerto de pgAdmin (UI en `:5050`) |

### Almacenamiento de archivos

| Variable | Req. | Default | Descripción |
|---|---|---|---|
| `STORAGE_TYPE` | no | `local` | `local` (disco), `s3` o `gcs`. **Producción: `gcs`** (el disco de Cloud Run es efímero) |
| `UPLOAD_ROOT` | no | `<cwd>/uploads` | Carpeta local (si `STORAGE_TYPE=local`) |
| `BACKEND_PUBLIC_URL` | no | — | URL pública del backend para servir archivos locales |
| `GCS_BUCKET_NAME`, `GCP_PROJECT_ID` | si `gcs` | — | Bucket y proyecto de Google Cloud Storage |
| `GOOGLE_APPLICATION_CREDENTIALS` / `GCS_CREDENTIALS_JSON` / `GCS_KEY_FILE` | solo dev | — | Credenciales GCS. **En Cloud Run no hacen falta**: usa las Application Default Credentials de la service account `terroir-backend` |
| `AWS_*` | si `s3` | — | Credenciales/bucket S3 (o compatible: Spaces/MinIO) |

### Login social (Google / Apple)

| Variable | Req. | Default | Descripción |
|---|---|---|---|
| `GOOGLE_WEB_CLIENT_ID` | para login Google | — | OAuth client "Web application". El backend solo verifica la firma y el `aud` del id_token (no necesita client secret) |
| `GOOGLE_IOS_CLIENT_ID` / `GOOGLE_ANDROID_CLIENT_ID` | para apps nativas | — | Client IDs de cada plataforma móvil |
| `APPLE_BUNDLE_ID` / `APPLE_SERVICE_ID` | para login Apple | `com.terroir.eribert` / — | Bundle de la app iOS / Services ID para la web |

### Pagos — R4 Conecta (pago móvil + débito inmediato)

| Variable | Req. | Default | Descripción |
|---|---|---|---|
| `R4_WEBHOOK_TOKEN` | sí (para webhooks) | — | Token (UUID) que R4 envía en `Authorization` a `POST /api/webhooks/r4/notifica` y `/consulta`. **Bloqueante**: si falta o no coincide, el webhook responde 401 y no confirma el pago. En Cloud Run: secreto `terroir-r4-webhook-token` |
| `R4_BASE_URL` | no | `https://r4conecta.mibanco.com.ve` | Punto de entrada del API R4 |
| `R4_COMMERCE_ID` | para débito/BCV-R4 | — | Token "Commerce" del banco: llave del HMAC-SHA256 (hex) de cada request Y header `Commerce`. Sin él (≥32 chars) el método débito se OCULTA en el checkout y la tasa BCV cae al proveedor público. En Cloud Run: secreto `terroir-r4-commerce-id` |
| `R4_CUENTA_BANCO` / `R4_CUENTA_CEDULA` / `R4_CUENTA_TELEFONO` | fallback | `0169` / `J-508025903` / `04245191996` | Cuenta receptora del comercio. **Prioridad: settings del admin** (grupo `PAYMENT`: `payment_pago_movil_bank/_phone/_rif`); estas env son el respaldo |
| `R4_ALLOWED_IPS` | no | — | Allowlist de IPs de origen del webhook (separadas por `;`). Vacío = deshabilitado |

**Flujo débito inmediato** (guía R4 v3.0): `POST /api/checkout` con
`paymentMethod=debito_inmediato` (+ banco/cédula/teléfono del pagador) →
`POST /api/payments/debito/otp` (el banco envía el OTP al cliente) →
`POST /api/payments/debito/confirmar` (`ACCP`=pagado → orden a PREPARING +
puntos; `AC00`=en espera → polling con `POST /api/payments/debito/estado`).
Cliente HTTP/HMAC en `src/r4/r4-conecta.service.ts`. La integración saliente
requiere **IP fija** (Cloud NAT — ver `docs/cloud-nat-r4.md` del workspace) y
pasarle esa IP al banco.

### Tasa BCV (USD→VES)

Sin variables de entorno: la tasa se obtiene de un API público gratuito
(`open.er-api.com`, sin API key), se cachea en la tabla `bcv_rates` y puede
fijarse manualmente desde el dashboard de admin (`/admin/bcv`). El checkout
calcula `bcvRate`/`amountVes` en el servidor con esta tasa.

## Despliegue en producción (Google Cloud Run)

La infraestructura vive en GCP: Cloud Run (servicio `terroir-backend`),
Cloud SQL Postgres (socket Unix), bucket GCS para uploads y Secret Manager
para todo lo sensible. El contenedor corre como la service account
`terroir-backend` (mínimo privilegio, sin archivos de credenciales).

**CI/CD**: cada push a `main` dispara el trigger de Cloud Build, que ejecuta
[`cloudbuild.yaml`](cloudbuild.yaml) — el pipeline completo:

```
build de imagen → push a Artifact Registry → job de migraciones (--wait) → deploy
```

Si una migración falla, el deploy se aborta y la revisión anterior sigue
sirviendo. Las migraciones NO corren al arrancar el servicio (`RUN_MIGRATIONS=false`).

**Manual / por fases** (config al inicio de la sección GCP del [`Makefile`](Makefile)):

| Comando | Qué hace |
|---|---|
| `make gcp-deploy` | El pipeline completo (mismo `cloudbuild.yaml` del trigger) |
| `make gcp-build` / `gcp-upload` / `gcp-publish` | Build local (amd64) / push / ambos |
| `make gcp-migrate` | Solo migraciones (Cloud Run Job `terroir-migrate`) |
| `make gcp-service` | Solo despliega el servicio (imagen ya subida) |
| `make gcp-cors` | Apunta `CORS_ORIGIN` a la URL del web desplegado |
| `make gcp-logs` / `gcp-url` | Logs / URL pública |

Secretos esperados en Secret Manager: `terroir-database-url`, `terroir-jwt-secret`,
`terroir-r4-webhook-token`, `terroir-smtp-pass`.

Gotchas que ya nos mordieron (no repetir):

- El [`.npmrc`](.npmrc) (`legacy-peer-deps=true`) **debe copiarse** en el Dockerfile o `npm ci` falla solo en el build.
- `prisma` va en `dependencies` (el job de migraciones usa su CLI desde la imagen).
- El pg driver **no** debe usar TLS sobre el socket Unix de Cloud SQL (ya resuelto en `database.service.ts`).
- `--set-env-vars` reemplaza TODAS las env vars → `CORS_ORIGIN` viaja en cada deploy.
- Jamás commitear `.env`, `.env.prod` ni `secrets/`.
