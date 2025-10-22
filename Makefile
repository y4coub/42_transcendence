DOCKER_COMPOSE ?= docker compose
COMPOSE_FILE ?= docker-compose.yml

CERT_DIR := certs
CERT_KEY := $(CERT_DIR)/localhost.key
CERT_CRT := $(CERT_DIR)/localhost.crt
CERT_DAYS ?= 365
SERVER_NAME ?= localhost

.PHONY: certs
certs:
	@mkdir -p $(CERT_DIR)
	@if [ -f "$(CERT_KEY)" ] && [ -f "$(CERT_CRT)" ]; then \
		echo "✔ Certificates already present in $(CERT_DIR)"; \
	else \
		echo "→ Generating self-signed TLS certificate for $(SERVER_NAME)"; \
		openssl req -x509 -nodes -newkey rsa:4096 \
			-keyout "$(CERT_KEY)" \
			-out "$(CERT_CRT)" \
			-days "$(CERT_DAYS)" \
			-subj "/CN=$(SERVER_NAME)"; \
		echo "✔ TLS certificate generated at $(CERT_DIR)"; \
	fi

.PHONY: build
build: certs
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) build

.PHONY: up
up: certs
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) up -d

.PHONY: down
down:
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) down

.PHONY: logs
logs:
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) logs -f

# Continuous backend log tail for server monitoring.
.PHONY: monitor
monitor:
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) logs -f backend

.PHONY: restart
restart: down up

# Remove containers, networks, named volumes, and local images created by this stack.
.PHONY: clean
clean:
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) down --volumes --remove-orphans --rmi local
