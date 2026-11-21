# CertiFlow — Pragati Skills Mission Certificate Platform

> **Production-grade, event-driven skilling certificate issuance and governance platform built for the Pragati Skills Mission.**  
> Ensures atomic batch validations, zero partial writes, multi-officer consensus locking, asynchronous BullMQ PDF generation, resilient WhatsApp delivery with exponential retries, SLA escalation alarms, and zero-PII public verification.

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

The UI features a persistent top-bar **Demo Persona Switcher**:

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

## 🛠️ 3. Tech Stack & Rationale

- **Backend:** Node.js, Express, TypeScript. Modular domain structure (`controllers`, `services`, `workers`, `events`, `middleware`, `queues`).
- **Database:** PostgreSQL with Prisma ORM. Strict ACID transactions, PostgreSQL pessimistic locking (`SELECT FOR UPDATE`), unique constraints on `(batchId, candidateId)` and `certNumber`.
- **Queues & Caching:** Redis 7 + BullMQ 5. Asynchronous worker execution for PDF compilation, exponential backoff retries, SLA delayed timers, and Redis caching for sub-millisecond public verification.
- **Frontend:** React 19, Vite, Tailwind CSS v4, Lucide React icons, Server-Sent Events (SSE) live updates for real-time progress and alerts.
- **Containerization:** Multi-service `docker-compose.yml` (Postgres, Redis, Backend, Worker, Frontend).

---

## 🚀 4. Quickstart & Local Setup

### Option A: Complete Docker Compose Run (Recommended)

Run all 5 services with a single command:

```bash
docker compose up --build
```

- **Frontend Application:** [http://localhost:5173](http://localhost:5173)
- **Backend API:** [http://localhost:5000](http://localhost:5000)
- **Real-Time SSE Stream:** [http://localhost:5000/api/events/stream](http://localhost:5000/api/events/stream)
- **Public Verification Endpoint:** [http://localhost:5173/verify/:certNumber](http://localhost:5173/verify/:certNumber)

### Option B: Local Development Run

1. **Start Postgres and Redis:**
   ```bash
   docker compose up -d postgres redis
   ```

2. **Setup Backend:**
   ```bash
   cd backend
   npm install
   npx prisma db push
   npx tsx prisma/seed.ts
   npm run dev
   ```

3. **Setup Frontend:**
   ```bash
   cd frontend
   npm install
   npm run dev
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

## 🤖 6. AI Usage, Design Choices & Trade-offs

- **Strict Pessimistic Locking over Optimistic Retries for Approvals:** In high-concurrency government workflows where multiple district officers review batches simultaneously, PostgreSQL `SELECT FOR UPDATE` prevents write-skew and race conditions at the database level.
- **Server-Sent Events (SSE) over WebSockets:** SSE was chosen for one-way server-to-client notifications (state updates, WhatsApp delivery ticks, SLA alarms) due to native browser reconnection handling, simpler HTTP/2 multiplexing, and lower server overhead compared to bidirectional WebSockets.
- **Standalone Queue Workers:** Background job processing is decoupled into dedicated worker instances (`issuanceWorker`, `whatsappWorker`, `slaWorker`), ensuring heavy PDF rasterization and network retries never block HTTP request threads.
- **Non-PII Public Verification:** To comply with Indian data protection standards (DPDP Act), the public verification endpoint strictly sanitizes outputs, exposing only Candidate Name, Course, Training Centre, Issue Date, and Authenticity Status.
