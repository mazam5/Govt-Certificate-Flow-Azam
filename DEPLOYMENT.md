# CertiFlow — Production Deployment & Scaling Architecture

This document outlines the enterprise production architecture designed to scale CertiFlow to **100,000+ active users**, handling **30,000 peak hourly PDF certificate generations** and **30,000 peak hourly WhatsApp notifications**.

---

## 🏗️ 1. High-Level Architecture Topology

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
    • PgBouncer Connection Pool          • Verification In-Memory Cache    • AES-256 Server Encryption
                 ▲                                │
                 │                                ▼
                 │                     [ ECS Fargate: Workers ]
                 │                     • Issuance Worker Pool (8 - 32 Tasks)
                 │                     • WhatsApp Dispatch Pool (6 - 24 Tasks)
                 │                     • SLA Escalation Worker (2 Tasks)
                 │                                │
                 └────────────────────────────────┴──────────────► [ Meta WhatsApp Business API ]
```

---

## ⚡ 2. Scaling Bottlenecks & Mitigations

### 30,000 Peak Hourly PDF Generation
* **Bottleneck:** Generating 30,000 PDFs per hour translates to **~8.3 PDFs per second sustained, with spikes up to 35 PDFs/sec**. PDFKit consumes CPU and memory (~30MB RAM per render). Generating them in HTTP request handlers would exhaust event-loop threads.
* **Mitigation:**
  1. **Decoupled Asynchronous Processing:** Generation is strictly handled by `issuanceQueue` running on autoscaling ECS Fargate worker containers.
  2. **Worker Horizontal Pod Autoscaling (HPA):** Auto-scales worker containers based on BullMQ `queue_depth > 100` or CPU utilization > 70%.
  3. **Direct S3 Streaming & Offloading:** Workers pipe PDF document streams directly to AWS S3 using multipart upload, avoiding local disk saturation.
  4. **Pre-computed Asset Caching:** Authority logos, state crests, and watermark vector paths are pre-loaded in worker memory at startup to avoid repeated disk I/O.

### 30,000 Peak Hourly WhatsApp Delivery
* **Bottleneck:** External WhatsApp Business API (via Meta Cloud API or BSPs like Gupshup/Twilio) imposes rate limits (typically 250 to 500 messages/sec per phone number tier) and experiences network latency, transient timeouts, or 503 throttling.
* **Mitigation:**
  1. **BullMQ Token Bucket Rate Limiting:** Enforces `limiter: { max: 250, duration: 1000 }` on `whatsappQueue` to strictly respect Meta API quotas.
  2. **Exponential Backoff Retries:** 8 retry attempts with jittered exponential delay (`500ms * 2^attempt`), allowing transient network drops and gateway downtime to self-heal.
  3. **Dead Letter Queue (DLQ):** Unrecoverable delivery failures after 8 attempts are moved to `whatsapp-dlq` for operator inspection and SMS fallback routing.

### Database Throughput & Concurrency
* **Bottleneck:** 100,000 active users and high-volume batch approvals can exhaust PostgreSQL connection limits and cause row lock contention.
* **Mitigation:**
  1. **PgBouncer Pooling:** Deployed in front of Aurora PostgreSQL in transaction pooling mode, enabling thousands of client connections with only 100 physical DB connections.
  2. **Read/Write Splitting:** Read queries (batch browsing, candidate listing, audit timelines) route to Aurora Read Replicas; state mutations and `SELECT FOR UPDATE` run exclusively on the Primary Writer.
  3. **Redis Caching for Public Verification:** 99.8% of public verification queries hit Redis (`cert:public:${certNumber}`) with sub-millisecond latency (1 hour TTL), completely shielding the database from viral verification spikes.

---

## 🛡️ 3. Storage & Security Architecture

1. **Private S3 Bucket Policy:**
   - Certificate PDFs are stored in private AWS S3 buckets with `Block Public Access` fully enabled.
   - Files are encrypted at rest using AWS KMS Customer Managed Keys (`SSE-KMS`).
   - Access to PDFs is granted exclusively via **Short-Lived Signed URLs** (valid for 15 minutes) generated by the API server after validating the requester's RBAC session.
2. **Data Privacy & DPDP Compliance:**
   - Unauthenticated public endpoints strictly filter all sensitive PII (Aadhar last 4, mobile phone numbers, guardian names, and internal audit logs are stripped at the service layer).
3. **Audit Trail Immutability:**
   - Audit records are stored in an append-only PostgreSQL table without `UPDATE` or `DELETE` grants for application roles.
   - In production, audit logs are additionally streamed to AWS CloudWatch Logs / S3 with **Object Lock (WORM - Write Once Read Many)** for legal compliance.

---

## 📊 4. Monitoring & Observability

- **Application Metrics (Prometheus + Grafana):**
  - BullMQ Queue Metrics: `jobs_waiting`, `jobs_active`, `jobs_failed`, `job_processing_duration_seconds`.
  - HTTP Server Metrics: Request latency percentiles (p50, p95, p99), HTTP 4xx/5xx rates.
  - WhatsApp Delivery Success Rate & Retry Distribution.
- **Distributed Tracing (OpenTelemetry + AWS X-Ray):**
  - Traces the end-to-end lifecycle from batch submission -> approvals -> BullMQ job dispatch -> PDF generation -> WhatsApp dispatch.
- **Alerting Rules:**
  - `P1 Alert`: BullMQ failed jobs > 50 in 5 minutes -> PagerDuty alert to on-call engineer.
  - `P1 Alert`: Postgres connection pool utilization > 85% -> Auto-scale pool and alert.
  - `P2 Alert`: SLA escalation breach detected -> Slack alert to state governance channel.

---

## 💰 5. Estimated Monthly Infrastructure Cost Breakdown (At Scale)

Estimated infrastructure cost for **100,000 active users, 30,000 peak hourly PDFs & WhatsApp notifications**:

| Service Component | Configuration / Specification | Estimated Monthly Cost (USD) |
|---|---|---|
| **AWS Aurora PostgreSQL** | 1 Primary (`db.r6g.xlarge`) + 2 Read Replicas (`db.r6g.large`), Multi-AZ | \$720.00 |
| **AWS ElastiCache Redis** | 2-node Cluster (`cache.r6g.large`), Multi-AZ with Auto-Failover | \$240.00 |
| **AWS ECS Fargate (API & Workers)** | 12 vCPU / 24 GB RAM baseline, autoscaling to 48 vCPU during peaks | \$480.00 |
| **AWS S3 Storage & KMS** | 500,000 PDFs (~100 KB each = 50 GB storage), KMS requests, Data Transfer | \$35.00 |
| **Cloudflare Enterprise / CDN** | CDN caching, WAF, DDoS protection, SSL termination | \$200.00 |
| **Monitoring & Logging** | Datadog / AWS CloudWatch Logs & Metrics (50 GB ingestion) | \$150.00 |
| **WhatsApp Business API** | 100,000 Utility Notifications @ approx. \$0.004 per message | \$400.00 |
| **Total Estimated Monthly Cost** | | **~\$2,225.00 / month** |

*Note: Unit cost per issued and delivered certificate at this scale is less than **$0.025 per candidate**.*
