# CertiFlow — Pragati Skills Mission Certificate Platform

> **Production-grade, event-driven skilling certificate issuance and governance platform built for the Pragati Skills Mission.**  
> Features atomic data ingestion with zero partial writes, multi-officer consensus locking, asynchronous BullMQ workers for vector PDF generation with verification QR codes, resilient mock WhatsApp delivery with exponential retries, automatic SLA escalation monitors, signed JWT authentication, structured Pino logging, and zero-PII public verification.

---

## 🏛️ 1. Architecture & Core State Machine

CertiFlow follows **Domain-Driven Design (DDD)** and an **Event-Driven Architecture (EDA)** with strict state machine transitions:

```
[ Training Centre (Anika) ]
        │  Upload CSV/XLSX (Atomic Validation - Zero Partial Writes)
        ▼
    [ DRAFT ] ─── Submit ───► [ SUBMITTED ] ◄── Resubmit (Revokes prior approvals)
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
   District Approval 1 (Dev)               District Approval 2 (Meera/Kabir)
        (Pessimistic Row Lock `SELECT FOR UPDATE` prevents race conditions)
              │                                         │
              └────────────────────┬────────────────────┘
                                   │  (Consensus: 2 distinct District Officers)
                                   ▼
                        [ DISTRICT_APPROVED ]
                                   │
                     ┌─────────────┴─────────────┐
        (Batch Size < 50)              (Batch Size ≥ 50)
                     │                           │
                     │                           ▼
                     │                 [ QUALITY_APPROVED ]
                     │                 (Audited by Neha)
                     │                           │
                     └─────────────┬─────────────┘
                                   │
                                   ▼
                       [ STATE_APPROVED / ISSUED ]
                       (Final Sanction by Farah)
                                   │
              BullMQ Event: `batch.approved` -> Background Workers
                                   │
       ┌───────────────────────────┴───────────────────────────┐
       ▼                                                       ▼
[ PDF Generation Worker ]                            [ WhatsApp Delivery Worker ]
 • Cryptographic Number (PSM-2026-XXXXXX)             • Stand-in Gateway with latency
 • Vector PDF with embedded QR verification           • Simulated 20% network drops
 • Idempotency key `(batchId, candidateId)`           • Exponential backoff retry loop
```

### Review Policy & Resubmission Reset
- **Rule 1 (District Multi-Signatory Consensus):** District approval requires **2 distinct officers** (`Dev`, `Meera`, `Kabir`) from that batch's district. Concurrent approval requests acquire a PostgreSQL row-level lock (`SELECT ... FOR UPDATE`), preventing double voting or duplicate advancements.
- **Rule 2 (Quality Team Routing):** Batches containing **50 or more candidates** are automatically routed to the Quality Team (`Neha`). Standard batches (< 50) skip directly to State Office (`Farah`).
- **Rule 3 (Explicit Reset on Changes Requested):** If any reviewer requests changes, the batch enters `CHANGES_REQUESTED`. When the centre corrects and resubmits, **all prior approvals are revoked** (`REVOKED_ON_RESUBMIT` in audit log). Reviewers never sign off on unreviewed data.
- **Rule 4 (SLA Timer & Escalation):** Entering review schedules a BullMQ delayed job. If the batch remains untouched beyond the SLA timeout (15s in demo, 48h in production), it is automatically flagged as `ESCALATED`, audit-logged, and pushed via SSE to Farah.

---

## 👥 2. Demo Personas & RBAC

The UI features a persistent top-bar **Demo Persona Switcher** issuing signed **JWT tokens** verified via backend RBAC middleware:

| Persona | Role | Jurisdiction | Key Responsibilities |
|---|---|---|---|
| **Anika** | `TRAINING_CENTRE` | District A | Uploads candidate spreadsheets, corrects discrepancies, submits & resubmits batches. |
| **Dev** | `DISTRICT_OFFICER` | District A | 1st signatory for District A candidate verification. |
| **Meera** | `DISTRICT_OFFICER` | District A | 2nd signatory for District A candidate verification. |
| **Kabir** | `DISTRICT_OFFICER` | District A | 3rd signatory for District A candidate verification. |
| **Neha** | `QUALITY_TEAM` | Central | Mandatory quality audit step exclusively for large batches (≥ 50 candidates). |
| **Farah** | `STATE_OFFICE` | State Level | Final approval sanction, SLA escalation triage view, certificate revocation. |
| **Public / Employer** | `PUBLIC` | Global | Unauthenticated credential verification portal (`GET /api/verify/:certNumber`). |

---

## 🛠️ 3. Upgraded Production Tech Stack & Architecture Rationale

### Frontend Stack (React + Vite + TypeScript)
- **React Router v6+:** Client-side role-protected routing (`/centre`, `/district`, `/quality`, `/state`, `/verify/:certNumber`, `/verify`).
- **Zustand:** Lightweight, zero-boilerplate client session store (`useAuthStore`) managing active persona identity and signed JWT tokens with localStorage synchronization.
- **TanStack Query (`v5`):** Declarative server state management, caching, background refetching, and instant cache invalidation wired to the Server-Sent Events (SSE) stream.
- **Radix UI & Tailwind CSS:** Fully accessible, keyboard-navigable UI primitives (Dialog, Tabs, Alert Dialog) styled with Tailwind CSS.
- **React Hook Form + Zod:** Strictly typed form state validation for batch upload forms and change-request modals.

### Backend, Security & Observability (Node.js + Express + TypeScript)
- **Signed JWT Authentication:** Cryptographically signed tokens (`HS256`) issued when switching personas or logging in, carrying identity and role claims verified via RBAC middleware.
- **Structured Pino Logging:** Replaced raw `console.log` with high-performance structured JSON logging (`pino`), automatically injecting distributed correlation/trace IDs (`X-Correlation-Id`, `batchId`, `actorId`, `role`) across HTTP requests and background workers.
- **Strict Zod Runtime Validation:** Guarantees zero invalid data touches database or service handlers.

### Data Layer, Caching & Event Streaming
- **Prisma ORM Strategy (Why Prisma over Drizzle):**
  - **Single Source of Truth:** Declarative `schema.prisma` acts as the canonical data model for relational integrity, cascades, and enum definitions.
  - **Pessimistic Concurrency Safety:** Seamless raw SQL transaction extensions (`$queryRaw` with `SELECT ... FOR UPDATE`) enable PostgreSQL row-level locks essential for multi-officer consensus approval workflows.
  - **Automated Migration Engine:** Prisma's battle-tested migration engine ensures zero drift across containerized environments and CI/CD pipelines.
  - *Trade-off analysis:* While Drizzle offers lightweight SQL-like syntax and smaller bundle footprints without an engine binary, Prisma provides superior schema drift prevention, automated foreign-key validation, and multi-model relation nesting mandatory for legal compliance audit logs.
- **Redis & BullMQ:** Distributed in-memory caching for sub-millisecond public certificate checks (`cert:public:${certNumber}`), distributed idempotency locks (`cert:issued:${batchId}:${candidateId}`), delayed BullMQ SLA monitors, and exponential backoff WhatsApp delivery retries.
- **Pluggable EventBus (Kafka + Redis):** Clean `IEventBus` interface allowing seamless swapping between the local Redis/BullMQ event bus and an enterprise Apache Kafka / AWS MSK cluster for high-volume audit streaming.
- **LLM API Assistant:** Optional AI assistant (with deterministic fallback) for intelligent CSV column header auto-mapping and plain-English executive bottleneck summaries for State Office escalations.

---

## 🚀 4. Quickstart & Local Setup

### Option A: Complete Docker Compose Run (Recommended)

Run all 5 containerized services with a single command:

```bash
docker compose up --build
```

- **Frontend Application:** [http://localhost:5173](http://localhost:5173)
- **Backend API:** [http://localhost:5000](http://localhost:5000)
- **Real-Time SSE Stream:** [http://localhost:5000/api/events/stream](http://localhost:5000/api/events/stream)
- **Public Verification Endpoint:** [http://localhost:5173/verify/:certNumber](http://localhost:5173/verify/:certNumber)

### Option B: Local Linux / Make Automation

```bash
make setup      # Installs dependencies, starts containers, syncs schema, seeds personas
make test       # Executes all 6 critical moments integration tests
make dev        # Starts backend and frontend development servers
```

---

## 🧪 5. Automated Integration Test Suite

The platform includes automated integration tests verifying all **6 critical moments**:

```bash
cd backend
npm run test
```

### Tested Moments:
1. **Atomic rejection of bad spreadsheet rows:** Verifies that row-level validation errors (bad phone, invalid Aadhar, malformed DOB) abort the entire upload with status 422, exact row/column reasons, and zero partial writes to the database.
2. **Race condition test (Two concurrent approvals):** Simulates concurrent district approvals (`Dev` and `Meera` executing simultaneously via `Promise.all`), proving PostgreSQL transactions and row locking advance the batch exactly once without duplicate votes or deadlocks.
3. **Batch of 60 candidates with unique certificates:** Simulates a large batch of 60 candidates progressing through District → Quality (`Neha`) → State (`Farah`), issuing 60 collision-free cryptographic certificates despite simulated WhatsApp failures.
4. **Instant cache invalidation on revocation:** Verifies that State Office revocation of an issued credential immediately flips public verification to `REVOKED` and purges the Redis cache.
5. **SLA timer escalation:** Proves that an untouched review batch triggers BullMQ delayed SLA expiration, flipping the batch status to `ESCALATED` and broadcasting real-time alerts.
6. **Resubmission resets prior approvals:** Tests the "send back" workflow, verifying that centre resubmission marks prior approvals as `REVOKED_ON_RESUBMIT` and restarts the governance audit trail.

---

## 📦 6. Postman API Collection & CI/CD

- **Postman Collection:** A ready-to-import collection is available at `postman/CertiFlow.postman_collection.json`, covering Persona Auth, Signed JWT verification, Batch Upload, Approvals, Rejections, Public Verification, and Revocation.
- **GitHub Actions Workflow:** `.github/workflows/ci.yml` is configured to run on every push and pull request to `main`, validating:
  - TypeScript compilation across backend and frontend
  - Prisma schema synchronization
  - Complete Vitest integration test suite (6 critical moments)
  - Docker Compose multi-service image build validation
