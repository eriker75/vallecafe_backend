# Docker compose file names
COMPOSE_DEV_FILE=docker-compose.dev.yml
COMPOSE_PROD_FILE=docker-compose.prod.yml
COMPOSE_SERVICES_FILE=docker-compose.services.yml
# Project name for docker-compose
PROJECT_NAME=terroir

# AWS ECR / GCR Configuration
# Override these in .env.prod or pass as environment variables
ECR_ACCOUNT_ID=
ECR_REGION=us-east-1
ECR_REPOSITORY=terroir/nestjs_backend
ECR_IMAGE_TAG=latest
ECR_REGISTRY=$(ECR_ACCOUNT_ID).dkr.ecr.$(ECR_REGION).amazonaws.com
ECR_IMAGE=$(ECR_REGISTRY)/$(ECR_REPOSITORY):$(ECR_IMAGE_TAG)

# Platform for ECS Fargate Graviton (linux/arm64)
PLATFORM = linux/arm64

# Development commands
up-dev:
	@echo "Starting containers in development mode..."
	docker-compose -f $(COMPOSE_DEV_FILE) -p $(PROJECT_NAME)_dev up --build

down-dev:
	@echo "Stopping containers in development mode..."
	docker-compose -f $(COMPOSE_DEV_FILE) -p $(PROJECT_NAME)_dev down

logs-dev:
	@echo "Showing logs of containers in development mode..."
	docker-compose -f $(COMPOSE_DEV_FILE) -p $(PROJECT_NAME)_dev logs -f

restart-dev:
	@echo "Restarting containers in development mode..."
	docker-compose -f $(COMPOSE_DEV_FILE) -p $(PROJECT_NAME)_dev restart

restart-backend-dev:
	@echo "Restarting backend container in development mode..."
	docker-compose -f $(COMPOSE_DEV_FILE) -p $(PROJECT_NAME)_dev restart backend

build-dev:
	@echo "Building images in development mode..."
	docker-compose -f $(COMPOSE_DEV_FILE) -p $(PROJECT_NAME)_dev build

clean-dev:
	@echo "Cleaning containers in development mode..."
	docker-compose -f $(COMPOSE_DEV_FILE) -p $(PROJECT_NAME)_dev down --volumes

destroy-dev:
	@echo "Destroying containers in development mode..."
	docker-compose -f $(COMPOSE_DEV_FILE) -p $(PROJECT_NAME)_dev down --volumes --rmi all

# Commands for services (infrastructure only - for local development)
up-services:
	@echo "Starting services (PostgreSQL, Redis, PgAdmin)..."
	docker-compose -f $(COMPOSE_SERVICES_FILE) -p $(PROJECT_NAME)_services up

down-services:
	@echo "Stopping services..."
	docker-compose -f $(COMPOSE_SERVICES_FILE) -p $(PROJECT_NAME)_services down

logs-services:
	@echo "Showing logs of services..."
	docker-compose -f $(COMPOSE_SERVICES_FILE) -p $(PROJECT_NAME)_services logs -f

restart-services:
	@echo "Restarting services..."
	docker-compose -f $(COMPOSE_SERVICES_FILE) -p $(PROJECT_NAME)_services restart

ps-services:
	@echo "Showing status of services..."
	docker-compose -f $(COMPOSE_SERVICES_FILE) -p $(PROJECT_NAME)_services ps

clean-services:
	@echo "Cleaning services and volumes..."
	docker-compose -f $(COMPOSE_SERVICES_FILE) -p $(PROJECT_NAME)_services down --volumes

# Production commands
up-prod:
	@echo "Starting containers in production mode ($(PLATFORM))..."
	@$(MAKE) setup-buildx
	@DOCKER_BUILDKIT=1 DOCKER_DEFAULT_PLATFORM=$(PLATFORM) docker-compose -f $(COMPOSE_PROD_FILE) -p $(PROJECT_NAME)_prod up -d --build

down-prod:
	@echo "Stopping containers in production mode..."
	docker-compose -f $(COMPOSE_PROD_FILE) -p $(PROJECT_NAME)_prod down

logs-prod:
	@echo "Showing logs of containers in production mode..."
	docker-compose -f $(COMPOSE_PROD_FILE) -p $(PROJECT_NAME)_prod logs -f

restart-prod:
	@echo "Restarting containers in production mode..."
	docker-compose -f $(COMPOSE_PROD_FILE) -p $(PROJECT_NAME)_prod restart

build-prod:
	@echo "Building images in production mode ($(PLATFORM) for Fargate)..."
	@$(MAKE) setup-buildx
	@DOCKER_BUILDKIT=1 DOCKER_DEFAULT_PLATFORM=$(PLATFORM) docker-compose -f $(COMPOSE_PROD_FILE) -p $(PROJECT_NAME)_prod build

build-prod-aws:
	@echo "Building images in production mode with AWS Public ECR ($(PLATFORM) for Fargate)..."
	@$(MAKE) setup-buildx
	@DOCKER_BUILDKIT=1 docker-compose -f $(COMPOSE_PROD_FILE) -p $(PROJECT_NAME)_prod build \
		--build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:20-alpine \
		--build-arg BUILDKIT_INLINE_CACHE=1

build-prod-local:
	@echo "Building images in production mode with Docker Hub..."
	docker-compose -f $(COMPOSE_PROD_FILE) -p $(PROJECT_NAME)_prod build --build-arg NODE_IMAGE=node:20-alpine

# Build with .env.prod file
build-prod-env:
	@echo "Building images in production mode with .env.prod ($(PLATFORM))..."
	@$(MAKE) setup-buildx
	@if [ ! -f .env.prod ]; then \
		echo "⚠️  Warning: .env.prod file not found. Using .env instead."; \
		DOCKER_BUILDKIT=1 DOCKER_DEFAULT_PLATFORM=$(PLATFORM) docker-compose -f $(COMPOSE_PROD_FILE) -p $(PROJECT_NAME)_prod build; \
	else \
		echo "Building images in production mode with .env.prod (Docker Hub)..."; \
		NODE_IMAGE=$$(grep -E '^NODE_IMAGE=' .env.prod | cut -d '=' -f2- | tr -d '"' || echo "node:20-alpine") && \
		DOCKER_BUILDKIT=1 DOCKER_DEFAULT_PLATFORM=$(PLATFORM) docker-compose -f $(COMPOSE_PROD_FILE) -p $(PROJECT_NAME)_prod \
			--env-file .env.prod \
			build --build-arg NODE_IMAGE=$${NODE_IMAGE}; \
	fi

build-prod-env-aws:
	@echo "Building images in production mode with .env.prod (AWS Public ECR) for $(PLATFORM)..."
	@$(MAKE) setup-buildx
	@if [ ! -f .env.prod ]; then \
		echo "⚠️  Warning: .env.prod file not found. Using .env instead with AWS ECR."; \
		DOCKER_BUILDKIT=1 docker-compose -f $(COMPOSE_PROD_FILE) -p $(PROJECT_NAME)_prod build \
			--build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:20-alpine \
			--build-arg BUILDKIT_INLINE_CACHE=1; \
	else \
		echo "Building images in production mode with .env.prod (AWS Public ECR)..."; \
		DOCKER_BUILDKIT=1 docker-compose -f $(COMPOSE_PROD_FILE) -p $(PROJECT_NAME)_prod \
			--env-file .env.prod \
			build --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:20-alpine \
			--build-arg BUILDKIT_INLINE_CACHE=1; \
	fi

# Up with .env.prod
up-prod-env:
	@if [ ! -f .env.prod ]; then \
		echo "❌ Error: .env.prod file not found. Please create it first."; \
		exit 1; \
	else \
		echo "Starting containers in production mode with .env.prod ($(PLATFORM))..."; \
		$(MAKE) setup-buildx; \
		NODE_IMAGE=$$(grep -E '^NODE_IMAGE=' .env.prod | cut -d '=' -f2- | tr -d '"' || echo "node:20-alpine") && \
		DOCKER_BUILDKIT=1 DOCKER_DEFAULT_PLATFORM=$(PLATFORM) docker-compose -f $(COMPOSE_PROD_FILE) -p $(PROJECT_NAME)_prod \
			--env-file .env.prod \
			up -d --build --build-arg NODE_IMAGE=$${NODE_IMAGE}; \
	fi

up-prod-env-aws:
	@if [ ! -f .env.prod ]; then \
		echo "❌ Error: .env.prod file not found. Please create it first."; \
		exit 1; \
	else \
		echo "Starting containers in production mode with .env.prod (AWS - $(PLATFORM))..."; \
		$(MAKE) setup-buildx; \
		DOCKER_BUILDKIT=1 docker-compose -f $(COMPOSE_PROD_FILE) -p $(PROJECT_NAME)_prod \
			--env-file .env.prod \
			up -d --build --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:20-alpine \
			--build-arg BUILDKIT_INLINE_CACHE=1; \
	fi

# Helper to ensure buildx builder exists
setup-buildx:
	@echo "Setting up buildx builder for $(PLATFORM)..."
	@docker buildx create --name multiarch --use 2>/dev/null || docker buildx use multiarch || true

# Build Docker image directly (for CI/CD or manual builds)
build-image:
	@echo "Building Docker image directly..."
	docker build -f Dockerfile.prod -t nestjs_backend_prod:latest .

build-image-aws:
	@echo "Building Docker image with AWS Public ECR ($(PLATFORM) for Fargate)..."
	@$(MAKE) setup-buildx
	@docker buildx build \
		--platform $(PLATFORM) \
		-f Dockerfile.prod \
		--build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:20-alpine \
		-t nestjs_backend_prod:latest \
		--load .

build-image-local:
	@echo "Building Docker image with Docker Hub..."
	docker build -f Dockerfile.prod --build-arg NODE_IMAGE=node:20-alpine -t nestjs_backend_prod:latest .

# Build Docker image with .env.prod file (for production deployments)
build-image-prod:
	@if [ ! -f .env.prod ]; then \
		echo "⚠️  Warning: .env.prod file not found. Using default values."; \
		docker build -f Dockerfile.prod -t nestjs_backend_prod:latest .; \
	else \
		echo "Building Docker image with .env.prod (Docker Hub)..."; \
		NODE_IMAGE=$$(grep -E '^NODE_IMAGE=' .env.prod | cut -d '=' -f2- | tr -d '"' || echo "node:20-alpine") && \
		docker build -f Dockerfile.prod \
			--build-arg NODE_IMAGE=$${NODE_IMAGE} \
			-t nestjs_backend_prod:latest .; \
	fi

build-image-prod-aws:
	@echo "Building Docker image with .env.prod (AWS Public ECR) for $(PLATFORM) (Fargate)..."
	@$(MAKE) setup-buildx
	@if [ ! -f .env.prod ]; then \
		echo "⚠️  Warning: .env.prod file not found. Using AWS Public ECR with default values."; \
		docker buildx build \
			--platform $(PLATFORM) \
			-f Dockerfile.prod \
			--build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:20-alpine \
			-t nestjs_backend_prod:latest \
			--load .; \
	else \
		echo "Building Docker image with .env.prod (AWS Public ECR)..."; \
		docker buildx build \
			--platform $(PLATFORM) \
			-f Dockerfile.prod \
			--build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:20-alpine \
			-t nestjs_backend_prod:latest \
			--load .; \
	fi

# Build and run with .env.prod (for testing production image locally)
build-run-prod:
	@if [ ! -f .env.prod ]; then \
		echo "❌ Error: .env.prod file not found. Please create it first."; \
		exit 1; \
	else \
		echo "Building and running Docker image with .env.prod..."; \
		$(MAKE) build-image-prod && \
		docker run -d \
			--name nestjs_backend_prod_test \
			--env-file .env.prod \
			-p 3000:3000 \
			nestjs_backend_prod:latest && \
		echo "✓ Container started. View logs with: docker logs -f nestjs_backend_prod_test"; \
	fi

build-run-prod-aws:
	@if [ ! -f .env.prod ]; then \
		echo "❌ Error: .env.prod file not found. Please create it first."; \
		exit 1; \
	else \
		echo "Building and running Docker image with .env.prod (AWS)..."; \
		$(MAKE) build-image-prod-aws && \
		docker run -d \
			--name nestjs_backend_prod_test \
			--env-file .env.prod \
			-p 3000:3000 \
			nestjs_backend_prod:latest && \
		echo "✓ Container started. View logs with: docker logs -f nestjs_backend_prod_test"; \
	fi

# ========================================
# AWS ECR Commands
# ========================================
ecr-login:
	@if [ -z "$(ECR_ACCOUNT_ID)" ]; then \
		echo "❌ Error: ECR_ACCOUNT_ID not set. Set it in .env.prod or as environment variable."; \
		echo "   Example: ECR_ACCOUNT_ID=123456789012 make ecr-login"; \
		exit 1; \
	fi
	@echo "Logging in to AWS ECR..."
	@aws ecr get-login-password --region $(ECR_REGION) | \
		docker login --username AWS --password-stdin $(ECR_REGISTRY)
	@echo "✓ Successfully logged in to ECR"

ecr-create-repo:
	@if [ -z "$(ECR_ACCOUNT_ID)" ]; then \
		echo "❌ Error: ECR_ACCOUNT_ID not set."; \
		exit 1; \
	fi
	@echo "Creating ECR repository $(ECR_REPOSITORY) in region $(ECR_REGION)..."
	@aws ecr create-repository \
		--repository-name $(ECR_REPOSITORY) \
		--region $(ECR_REGION) \
		--image-scanning-configuration scanOnPush=true \
		--encryption-configuration encryptionType=AES256 \
		2>/dev/null || echo "⚠️  Repository already exists or error occurred"
	@echo "✓ Repository ready"

ecr-tag:
	@if [ -z "$(ECR_ACCOUNT_ID)" ]; then \
		echo "❌ Error: ECR_ACCOUNT_ID not set."; \
		exit 1; \
	fi
	@echo "Tagging image for ECR..."
	@echo "  Source: nestjs_backend_prod:latest"
	@echo "  Target: $(ECR_IMAGE)"
	@docker tag nestjs_backend_prod:latest $(ECR_IMAGE)
	@echo "✓ Image tagged successfully"

ecr-push:
	@if [ -z "$(ECR_ACCOUNT_ID)" ]; then \
		echo "❌ Error: ECR_ACCOUNT_ID not set."; \
		exit 1; \
	fi
	@echo "Pushing image to ECR..."
	@echo "  Repository: $(ECR_IMAGE)"
	@docker push $(ECR_IMAGE)
	@echo "✓ Image pushed successfully to $(ECR_IMAGE)"

# Build, tag and push to ECR in one command (using buildx for $(PLATFORM))
ecr-build-push:
	@if [ -z "$(ECR_ACCOUNT_ID)" ]; then \
		echo "❌ Error: ECR_ACCOUNT_ID not set. Set it in .env.prod or as environment variable."; \
		echo ""; \
		echo "Add to .env.prod:"; \
		echo "  ECR_ACCOUNT_ID=123456789012"; \
		echo "  ECR_REGION=us-east-1"; \
		echo "  ECR_REPOSITORY=nestjs-backend"; \
		echo "  ECR_IMAGE_TAG=latest"; \
		exit 1; \
	fi
	@echo "🚀 Building and pushing to ECR ($(PLATFORM) for Fargate)..."
	@echo "  Account: $(ECR_ACCOUNT_ID)"
	@echo "  Region: $(ECR_REGION)"
	@echo "  Repository: $(ECR_REPOSITORY)"
	@echo "  Tag: $(ECR_IMAGE_TAG)"
	@echo "  Platform: $(PLATFORM)"
	@echo ""
	@echo "Logging in to ECR..."
	@aws ecr get-login-password --region $(ECR_REGION) | \
		docker login --username AWS --password-stdin $(ECR_REGISTRY)
	@echo "Setting up buildx builder..."
	@$(MAKE) setup-buildx
	@echo "Building and pushing image..."
	@docker buildx build \
		--platform $(PLATFORM) \
		-f Dockerfile.prod \
		--build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:20-alpine \
		-t $(ECR_IMAGE) \
		--push .
	@echo ""
	@echo "✅ Successfully deployed to ECR: $(ECR_IMAGE)"

# Build, tag and push with AWS Public ECR for base image
ecr-build-push-aws:
	@if [ -z "$(ECR_ACCOUNT_ID)" ]; then \
		echo "❌ Error: ECR_ACCOUNT_ID not set."; \
		exit 1; \
	fi
	@$(MAKE) ecr-build-push

# Show ECR configuration
ecr-info:
	@echo "📋 ECR Configuration:"
	@echo "  Account ID: $(ECR_ACCOUNT_ID)"
	@echo "  Region: $(ECR_REGION)"
	@echo "  Repository: $(ECR_REPOSITORY)"
	@echo "  Tag: $(ECR_IMAGE_TAG)"
	@echo "  Registry: $(ECR_REGISTRY)"
	@echo "  Full Image: $(ECR_IMAGE)"

clean-prod:
	@echo "Cleaning containers in production mode..."
	docker-compose -f $(COMPOSE_PROD_FILE) -p $(PROJECT_NAME)_prod down --volumes

destroy-prod:
	@echo "Destroying containers in production mode..."
	docker-compose -f $(COMPOSE_PROD_FILE) -p $(PROJECT_NAME)_prod down --volumes --rmi all

# Database commands (Development)
migrate-dev:
	@echo "Running Prisma migrations in development..."
	docker exec -it nestjs_backend npx prisma migrate dev

migrate-deploy-dev:
	@echo "Running Prisma migrations (deploy) in development..."
	docker exec -it nestjs_backend npx prisma migrate deploy

generate-dev:
	@echo "Generating Prisma client in development..."
	docker exec -it nestjs_backend npx prisma generate

studio-dev:
	@echo "Opening Prisma Studio in development..."
	docker exec -it nestjs_backend npx prisma studio

seed-dev:
	@echo "Running seed in development..."
	docker exec -it nestjs_backend npm run seed

# Database commands (Production)
migrate-prod:
	@echo "Running Prisma migrations in production..."
	docker exec -it nestjs_backend npx prisma migrate deploy

generate-prod:
	@echo "Generating Prisma client in production..."
	docker exec -it nestjs_backend npx prisma generate

seed-prod:
	@echo "Running seed in production..."
	docker exec -it nestjs_backend npm run seed

# Shell commands
shell-backend-dev:
	@echo "Accessing backend shell in development..."
	docker exec -it nestjs_backend sh

shell-postgres-dev:
	@echo "Accessing PostgreSQL shell in development..."
	docker exec -it postgres psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)


shell-redis-dev:
	@echo "Accessing Redis shell in development..."
	docker exec -it redis redis-cli

# Specific logs commands (Development)
logs-backend-dev:
	@echo "Showing backend logs in development..."
	docker-compose -f $(COMPOSE_DEV_FILE) -p $(PROJECT_NAME)_dev logs -f backend

logs-postgres-dev:
	@echo "Showing PostgreSQL logs in development..."
	docker-compose -f $(COMPOSE_DEV_FILE) -p $(PROJECT_NAME)_dev logs -f postgres

logs-redis-dev:
	@echo "Showing Redis logs in development..."
	docker-compose -f $(COMPOSE_DEV_FILE) -p $(PROJECT_NAME)_dev logs -f redis

# Specific logs commands (Production)
logs-backend-prod:
	@echo "Showing backend logs in production..."
	docker-compose -f $(COMPOSE_PROD_FILE) -p $(PROJECT_NAME)_prod logs -f backend

logs-postgres-prod:
	@echo "Showing PostgreSQL logs in production..."
	docker-compose -f $(COMPOSE_PROD_FILE) -p $(PROJECT_NAME)_prod logs -f postgres

# Useful commands
ps-dev:
	@echo "Showing status of containers in development..."
	docker-compose -f $(COMPOSE_DEV_FILE) -p $(PROJECT_NAME)_dev ps

ps-prod:
	@echo "Showing status of containers in production..."
	docker-compose -f $(COMPOSE_PROD_FILE) -p $(PROJECT_NAME)_prod ps

stats:
	@echo "Showing resource usage statistics..."
	docker stats

prune:
	@echo "Cleaning unused Docker resources..."
	docker system prune -a --volumes

# ========================================
# Utilities
# ========================================
validate-env:
	@echo "Validating .env configuration..."
	@bash scripts/validate-env.sh

copy-env:
	@if [ -f .env ]; then \
		echo "⚠️  Warning: .env file already exists!"; \
		read -p "Do you want to overwrite it? (y/N): " confirm; \
		if [ "$$confirm" = "y" ] || [ "$$confirm" = "Y" ]; then \
			cp .env.example .env; \
			echo "✓ .env file created from .env.example"; \
			echo "ℹ️  Edit .env and change the default passwords"; \
		else \
			echo "✗ Operation cancelled"; \
		fi \
	else \
		cp .env.example .env; \
		echo "✓ .env file created from .env.example"; \
		echo "ℹ️  Edit .env and change the default passwords"; \
	fi

# Default command
.PHONY: help
help:
	@echo "╔══════════════════════════════════════════════════════════════╗"
	@echo "║          OneEnglish Backend - Makefile Commands             ║"
	@echo "╚══════════════════════════════════════════════════════════════╝"
	@echo ""
	@echo "🔧 Services (Local Development):"
	@echo "  make up-services         - Start only services (DBs + Admin)"
	@echo "  make down-services       - Stop services"
	@echo "  make logs-services       - View service logs"
	@echo "  make restart-services    - Restart services"
	@echo "  make ps-services         - View service status"
	@echo "  make clean-services      - Clean services and volumes"
	@echo ""
	@echo "📦 Development Commands:"
	@echo "  make up-dev              - Start containers in development"
	@echo "  make down-dev            - Stop containers in development"
	@echo "  make logs-dev            - Show all logs in development"
	@echo "  make restart-dev         - Restart containers in development"
	@echo "  make restart-backend-dev - Restart only the backend container"
	@echo "  make build-dev           - Build images in development"
	@echo "  make clean-dev           - Clean containers and volumes in development"
	@echo "  make destroy-dev         - Destroy everything in development"
	@echo "  make ps-dev              - View container status in development"
	@echo ""
	@echo "🚀 Production Commands:"
	@echo "  make up-prod             - Start containers in production"
	@echo "  make down-prod           - Stop containers in production"
	@echo "  make logs-prod           - Show all logs in production"
	@echo "  make restart-prod        - Restart containers in production"
	@echo ""
	@echo "🔨 Build Commands (Docker Compose):"
	@echo "  make build-prod          - Build images in production ($(PLATFORM), Docker Hub)"
	@echo "  make build-prod-aws      - Build images using AWS Public ECR ($(PLATFORM) for Fargate)"
	@echo "  make build-prod-local    - Build images using Docker Hub"
	@echo "  make build-prod-env      - Build with .env.prod ($(PLATFORM), Docker Hub)"
	@echo "  make build-prod-env-aws  - Build with .env.prod ($(PLATFORM), AWS Public ECR)"
	@echo "  make up-prod-env        - Build and start with .env.prod ($(PLATFORM), Docker Hub)"
	@echo "  make up-prod-env-aws    - Build and start with .env.prod ($(PLATFORM), AWS)"
	@echo ""
	@echo "📦 Docker Image Build Commands (Direct):"
	@echo "  make build-image         - Build Docker image directly (default: Docker Hub)"
	@echo "  make build-image-aws     - Build Docker image using AWS Public ECR ($(PLATFORM))"
	@echo "  make build-image-local   - Build Docker image using Docker Hub"
	@echo "  make build-image-prod    - Build image with .env.prod (Docker Hub)"
	@echo "  make build-image-prod-aws - Build image with .env.prod ($(PLATFORM), AWS Public ECR)"
	@echo "  make build-run-prod      - Build and run image with .env.prod (Docker Hub)"
	@echo "  make build-run-prod-aws  - Build and run image with .env.prod ($(PLATFORM), AWS)"
	@echo ""
	@echo "🧹 Cleanup Commands:"
	@echo "  make clean-prod          - Clean containers and volumes in production"
	@echo "  make destroy-prod        - Destroy everything in production"
	@echo "  make ps-prod             - View container status in production"
	@echo ""
	@echo "🗄️  Database Commands (Development):"
	@echo "  make migrate-dev         - Run Prisma migrations"
	@echo "  make migrate-deploy-dev  - Run migrations (deploy)"
	@echo "  make generate-dev        - Generate Prisma client"
	@echo "  make studio-dev          - Open Prisma Studio"
	@echo "  make seed-dev            - Run database seed"
	@echo ""
	@echo "🗄️  Database Commands (Production):"
	@echo "  make migrate-prod        - Run migrations in production"
	@echo "  make generate-prod       - Generate Prisma client"
	@echo "  make seed-prod           - Run seed in production"
	@echo ""
	@echo "🐚 Shell Commands (Development):"
	@echo "  make shell-backend-dev   - Access backend shell"
	@echo "  make shell-postgres-dev  - Access PostgreSQL shell"
	@echo "  make shell-redis-dev     - Access Redis shell"
	@echo ""
	@echo "📝 Specific Logs (Development):"
	@echo "  make logs-backend-dev    - Backend logs"
	@echo "  make logs-postgres-dev   - PostgreSQL logs"
	@echo "  make logs-redis-dev      - Redis logs"
	@echo ""
	@echo "📝 Specific Logs (Production):"
	@echo "  make logs-backend-prod   - Backend logs"
	@echo "  make logs-postgres-prod  - PostgreSQL logs"
	@echo ""
	@echo "☁️  AWS ECR Commands:"
	@echo "  make ecr-info           - Show ECR configuration"
	@echo "  make ecr-login           - Login to AWS ECR"
	@echo "  make ecr-create-repo      - Create ECR repository (if doesn't exist)"
	@echo "  make ecr-tag              - Tag image for ECR"
	@echo "  make ecr-push             - Push image to ECR"
	@echo "  make ecr-build-push       - Build ($(PLATFORM)) and push to ECR (all-in-one)"
	@echo ""
	@echo "  Configure in .env.prod:"
	@echo "    ECR_ACCOUNT_ID=123456789012"
	@echo "    ECR_REGION=us-east-1"
	@echo "    ECR_REPOSITORY=nestjs-backend"
	@echo "    ECR_IMAGE_TAG=latest"
	@echo ""
	@echo "🛠️  Utilities:"
	@echo "  make stats               - View Docker resource usage statistics"
	@echo "  make prune               - Clean unused Docker resources"
	@echo "  make validate-env        - Validate .env configuration"
	@echo "  make copy-env            - Copy .env.example to .env"
	@echo ""

# Alias for ecr-info
.PHONY: info
info: ecr-info
