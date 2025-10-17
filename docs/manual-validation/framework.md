# Manual Validation Framework

Manual validation is the canonical quality gate for this backend. Follow the guidance below whenever you prepare a release or ship a significant module update.

## Principles

- **Document-first**: Capture observed behaviour, deviations, and timings in the relevant checklist markdown file.
- **Measurable outcomes**: Compare observed latencies to the success criteria in `spec.md`.
- **Secure context**: Run all requests via HTTPS/WSS through the Caddy proxy to ensure certificates and redirects function correctly.

## Core Flows

1. **Infrastructure Bring-up**  
   - Run `docker compose -f docker/compose.yml up --build`.  
   - Confirm API is reachable at `https://localhost:3000/healthz`.

2. **Authentication**  
   - Execute the credential login flow (email/password).  
   - Complete the 42 OAuth dance using sandbox credentials.

3. **Real-time Channels**  
   - Establish dual WebSocket clients for `/ws/chat/{channelId}`.  
   - Ensure rate limiting and block policies behave per specification.

4. **Competition Lifecycle**  
   - Seed tournaments, enqueue players, and observe notifications.  
   - Verify stats and profiles reconcile after match submission.

5. **Documentation Drift**  
   - Regenerate OpenAPI (`npm run docs:generate`).  
   - Inspect `/docs` for parity with implemented endpoints.

## Evidence Capture

- Attach timestamps, payloads, and screenshots (if applicable) to the story-specific checklist.
- Note any manual data seeding required so future runs remain reproducible.
- Record regressions immediately and link them to follow-up tickets before merge.

## Sign-off Checklist

- [ ] Docker stack boot time under 2 minutes.  
- [ ] HTTPS redirects verified.  
- [ ] JWT rotation observed and documented.  
- [ ] WebSocket broadcasts confirmed for chat and tournament flows.  
- [ ] Manual checklists updated with results and anomalies.
