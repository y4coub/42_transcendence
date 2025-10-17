<!--
Sync Impact Report
Version change: N/A → 1.0.0
Modified principles:
	- [PRINCIPLE_1_NAME] → Modular Fastify Architecture
	- [PRINCIPLE_2_NAME] → Security Hardening
	- [PRINCIPLE_3_NAME] → Lightweight Scalability
	- [PRINCIPLE_4_NAME] → SQLite Source of Truth
	- [PRINCIPLE_5_NAME] → Documentation-First Delivery
Added sections: Additional Constraints; Development Workflow
Removed sections: None
Templates requiring updates:
	- .specify/templates/plan-template.md ✅
	- .specify/templates/spec-template.md ✅
	- .specify/templates/tasks-template.md ✅
	- .specify/templates/checklist-template.md ✅
	- .specify/templates/agent-file-template.md ✅
Follow-up TODOs:
	- TODO(RATIFICATION_DATE): Confirm original adoption date
-->

# ft_transcendence backend Constitution

## Core Principles

### I. Modular Fastify Architecture
Backend code MUST follow a predictable Fastify + TypeScript structure with dedicated modules for auth, chat, tournament, and stats. Shared utilities stay isolated to maintain clear boundaries.
Rationale: Keeps the codebase navigable and prevents cross-module coupling.

### II. Security Hardening
All traffic MUST use HTTPS/WSS. Credentials rely on Argon2id hashing. Sessions use JWT with rotation. Rate limiting and rigorous input validation are mandatory for every entry point.
Rationale: Protects users and infrastructure against common attack vectors.

### III. Lightweight Scalability
Favor minimal dependencies, Dockerized deployments, and Fastify plugins to extend features. Modules MUST remain hot-swappable within the plugin system to support growth.
Rationale: Ensures the service scales predictably without excess bloat.

### IV. SQLite Source of Truth
SQLite is the single data store. Schema evolution MUST occur through migrations checked into version control. No shadow databases or ad-hoc schemas are permitted.
Rationale: Guarantees consistent state management across environments.

### V. Documentation-First Delivery
Every route and event is defined in `openapi.yaml` before implementation and published via `/docs`. Contract changes ship with updated documentation in the same change.
Rationale: Keeps consumers aligned and prevents undocumented behavior.

## Additional Constraints
- Deployment bundling MUST use a one-command Docker Compose stack (proxy, API, SQLite).
- Configuration stays 12-factor compliant with secrets sourced from environment variables.
- Automated tests (unit, integration, end-to-end) are FORBIDDEN. Rely on manual smoke validation and monitoring instead.
- Observability requires structured logging and metrics for each module, even without automated tests.

## Development Workflow
- Specs in `spex/` approve scope before implementation starts.
- Pull requests cite affected modules and link to updated OpenAPI docs.
- Code reviews verify security controls, migrations, and documentation updates.
- Manual smoke scripts or checklists MUST be documented for each release since automated tests are disallowed.
- Docker Compose definitions are updated alongside feature changes impacting deployment.

## Governance
This constitution supersedes all other process documents. Amendments require consensus, documented rationale, semantic version evaluation, and migration plans where relevant.
Compliance is reviewed during spec approval, PR review, and release sign-off. Any violation blocks release until addressed. Version increments follow semantic rules based on impact.

**Version**: 1.0.0 | **Ratified**: TODO(RATIFICATION_DATE): original adoption date unknown | **Last Amended**: 2025-10-16
