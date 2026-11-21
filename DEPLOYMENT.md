# CertiFlow — Production Deployment & AWS Cloud Architecture

This document outlines the enterprise production architecture designed to scale CertiFlow to **100,000+ active users**, handling **30,000 peak hourly PDF certificate generations** and **30,000 peak hourly WhatsApp notifications**.

---

## 🏗️ 1. High-Level AWS Production Topology

```
                              [ Cloudflare Enterprise CDN / DDoS Shield ]
                                                  │
                                                  ▼
                               [ AWS Application Load Balancer (ALB) ]
                                                  │
                 ┌────────────────────────────────┴────────────────────────────────┐
                 ▼                                                                 ▼
      [ ECS Fargate: Web/API ]                                          [ ECS Fargate: SSE Hub ]
      Auto-scaled: 4 to 20 Tasks                                        Auto-scaled: 2 to 6 Tasks
                 │                                                                 │
                 ├────────────────────────────────┬────────────────────────────────┤
                 ▼                                ▼                                ▼
    [ AWS Aurora PostgreSQL ]            [ AWS ElastiCache Redis ]         [ S3 + CloudFront CDN ]
    • Primary Writer                     • Redis Cluster (Multi-AZ)        • Vector Certificate PDFs
    • 3 Read Replicas                    • BullMQ Queue Engine             • Direct Presigned URLs
    • PgBouncer Connection Pool          • Verification In-Memory Cache    • AES-256 KMS Encryption
                 ▲                                │
                 │                                ▼
                 │                     [ ECS Fargate: Workers ]
                 │                     • Issuance Worker Pool (8 - 32 Tasks)
                 │                     • WhatsApp Dispatch Pool (6 - 24 Tasks)
                 │                     • SLA Escalation Worker (2 Tasks)
                 │                                │
                 │                                ▼
                 └──────────────────► [ AWS MSK (Apache Kafka) ] ──► [ Meta WhatsApp API ]
                                       • Audit Event Backbone
                                       • High-Throughput Analytics
```

---

## ⚡ 2. Enterprise Cloud Services Breakdown

### 1. Container Management: AWS ECR & ECS Fargate / EC2
- **AWS Elastic Container Registry (ECR):** Hosts immutable, vulnerability-scanned Docker container images tagged with Git SHA (`certiflow-api:sha-xxxx`, `certiflow-worker:sha-xxxx`, `certiflow-frontend:sha-xxxx`).
- **AWS ECS Fargate / EC2 Auto Scaling:**
  - **API Cluster:** Deployed across 3 Availability Zones (AZs) behind an AWS Application Load Balancer (ALB) with SSL/TLS termination and path routing (`/api/*` to API tasks, `/api/events/stream` to sticky SSE tasks).
  - **Background Worker Cluster:** Autoscales based on BullMQ queue depth (`jobs_waiting > 100`) and CPU utilization (> 70%).

### 2. Relational Database: AWS Aurora PostgreSQL
- **Multi-AZ Replication:** Dedicated primary writer instance (`db.r6g.xlarge`) with 3 auto-scaling read replicas (`db.r6g.large`) distributed across separate Availability Zones.
- **PgBouncer Connection Pooling:** Transaction-mode pooling deployed in front of Aurora to support 10,000+ client sessions with only 100 physical DB connections.
- **Pessimistic Concurrency Control:** High-concurrency approvals leverage PostgreSQL `SELECT FOR UPDATE` on the primary writer, preventing race conditions.

### 3. Caching & Queue Engine: AWS ElastiCache for Redis
- **Redis Cluster:** Multi-AZ with Automatic Failover (`cache.r6g.large`).
- **Partitioning:**
  - In-Memory Public Verification Cache: 1-hour TTL with instant purge on revocation.
  - BullMQ Queue Backbone: Issuance jobs, delayed SLA timers, and WhatsApp retry queues.
  - Idempotency Locks: `cert:issued:<batchId>:<candidateId>` preventing duplicate certificate issuance.

### 4. Event Streaming Backbone: AWS MSK (Managed Streaming for Apache Kafka)
- **High-Throughput Audit Streaming:** Decouples heavy audit logging and analytics processing from transactional API paths using the pluggable `KafkaEventBusAdapter`.
- **Topics:** `certiflow.events.batch_approval`, `certiflow.events.issuance`, `certiflow.events.revocation`.

### 5. Secure Object Storage: AWS S3 + AWS KMS
- **Private S3 Bucket:** Certificate PDFs are stored in an encrypted S3 bucket (`SSE-KMS` Customer Managed Keys) with `Block Public Access` strictly enforced.
- **Pre-signed Scoped Access:** The API issues short-lived, cryptographically signed S3 URLs (15-minute expiration) after validating user role authorization.

---

## ⚡ 3. Scaling Bottlenecks & Mitigations

### 30,000 Peak Hourly PDF Generation
* **Bottleneck:** Sustained **~8.3 PDFs/sec, peaking up to 35 PDFs/sec**. Vector PDF rendering with PDFKit consumes ~30MB RAM per render.
* **Mitigation:**
  1. **Decoupled Asynchronous Processing:** Offloaded to `issuanceQueue` on ECS Fargate workers.
  2. **Direct S3 Multipart Streaming:** Workers stream PDF output directly to S3 without local disk writes.
  3. **Memory Asset Pre-computation:** Government seals, watermarks, and authority signature vector paths are cached in worker memory at startup.

### 30,000 Peak Hourly WhatsApp Delivery
* **Bottleneck:** External WhatsApp API rate limits (250-500 msgs/sec per phone number tier) and transient network drops.
* **Mitigation:**
  1. **BullMQ Token Bucket Limiter:** Enforces `limiter: { max: 250, duration: 1000 }` on `whatsappQueue`.
  2. **Exponential Backoff Retries:** 8 retry attempts with jittered exponential delay (`500ms * 2^attempt`).
  3. **Dead Letter Queue (DLQ):** Unrecoverable failures after 8 attempts are moved to `whatsapp-dlq` for operator inspection and SMS fallback routing.

---

## 📊 4. Monitoring, Observability & CI/CD Pipeline

- **CI/CD Pipeline (`.github/workflows/ci.yml`):**
  - Triggers strictly on push and pull requests to `main`.
  - Executes TypeScript linting, Prisma schema validation, full Vitest integration suite (all 6 critical moments), and Docker image build verification.
- **Metrics (Prometheus & Grafana):**
  - BullMQ queue metrics: `jobs_waiting`, `jobs_active`, `jobs_failed`, `job_processing_duration_seconds`.
  - HTTP metrics: Request latency percentiles (p50, p95, p99), error rates (4xx, 5xx).
  - WhatsApp delivery success rate & retry histograms.
- **Distributed Tracing (OpenTelemetry + AWS X-Ray):**
  - Tracks correlation IDs from HTTP batch upload -> district approval -> BullMQ worker -> S3 PDF generation -> WhatsApp dispatch.

---

## 💰 5. Estimated Monthly Cloud Cost Breakdown (At Scale)

Estimated infrastructure cost for **100,000 active users, 30,000 peak hourly PDFs & WhatsApp notifications**:

| Service Component | Configuration / Specification | Estimated Monthly Cost (USD) |
|---|---|---|
| **AWS Aurora PostgreSQL** | 1 Primary (`db.r6g.xlarge`) + 2 Read Replicas (`db.r6g.large`), Multi-AZ | \$720.00 |
| **AWS ElastiCache Redis** | 2-node Cluster (`cache.r6g.large`), Multi-AZ with Auto-Failover | \$240.00 |
| **AWS ECS Fargate (API & Workers)** | 12 vCPU / 24 GB RAM baseline, autoscaling to 48 vCPU during peaks | \$480.00 |
| **AWS S3 Storage & KMS** | 500,000 PDFs (~100 KB each = 50 GB storage), KMS requests, Data Transfer | \$35.00 |
| **Cloudflare Enterprise / CDN** | CDN caching, WAF, DDoS protection, SSL termination | \$200.00 |
| **AWS MSK (Kafka) / Monitoring** | 2-broker Kafka cluster + Datadog / CloudWatch Logs ingestion | \$350.00 |
| **WhatsApp Business API** | 100,000 Utility Notifications @ approx. \$0.004 per message | \$400.00 |
| **Total Estimated Monthly Cost** | | **~\$2,425.00 / month** |

*Note: Unit cost per issued and delivered certificate at scale is less than **$0.025 per candidate**.*
