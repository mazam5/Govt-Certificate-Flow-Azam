# CertiFlow — Sample Candidate Spreadsheets

This folder provides ready-to-upload spreadsheet files tailored to evaluate every core workflow rule, governance check, and edge case in the CertiFlow platform.

---

## 📁 Available Sample Files

### 1. `01_standard_batch_5_candidates.csv` (Standard 5-Candidate Batch)
- **Course:** Solar Panel Installation Technician
- **Candidate Count:** 5
- **Intended Workflow:** Standard Fast-Track Flow
- **Governance Path:**
  1. Uploaded by **Anika** (`TRAINING_CENTRE`)
  2. Submitted for District Review
  3. Approved by **Dev** (District Officer 1) and **Meera** (District Officer 2)
  4. Automatically skips Quality Team (since $< 50$ candidates) and routes directly to **Farah** (`STATE_OFFICE`)
  5. Final approval issues 5 collision-free vector PDF certificates with QR codes and dispatches mock WhatsApp messages.

### 2. `02_large_batch_60_candidates.csv` (High-Volume 60-Candidate Batch)
- **Course:** Drone Assembly & Maintenance Technician
- **Candidate Count:** 60
- **Intended Workflow:** High-Volume Quality Team Mandatory Audit ($\ge 50$ Candidates)
- **Governance Path:**
  1. Uploaded by **Anika** (`TRAINING_CENTRE`)
  2. Approved by 2 District Officers (**Dev** and **Meera**)
  3. **Mandatory Routing Trigger:** Advances to **Neha** (`QUALITY_TEAM`) because batch size $\ge 50$
  4. Once Neha approves, advances to **Farah** (`STATE_OFFICE`)
  5. BullMQ workers process 60 vector PDFs and deliver WhatsApp notifications with exponential backoff retry.

### 3. `03_invalid_batch_with_errors.csv` (Intentionally Malformed Batch)
- **Course:** Electric Vehicle Service Specialist
- **Candidate Count:** 6 rows (5 with deliberate data flaws)
- **Intended Workflow:** Atomic Rejection with Zero Partial Writes
- **Errors Injected:**
  - **Row 2 (Phone):** Incomplete phone number (only 5 digits)
  - **Row 3 (Aadhar Last 4):** 5 digits instead of exactly 4 numeric digits
  - **Row 4 (Date of Birth):** Invalid date format (`invalid-date`)
  - **Row 5 (Father Name):** Missing mandatory father/guardian name
  - **Row 6 (Phone):** Invalid prefix (starts with `1` instead of `6-9`)
- **Expected Result:**
  - HTTP `422 Unprocessable Entity`
  - Zero rows written to PostgreSQL
  - Frontend displays an exact row-by-row and column-by-column error resolution table.

### 4. `04_healthcare_assistants.xlsx` (Native Binary Excel Spreadsheet)
- **Format:** Microsoft Excel (`.xlsx`)
- **Course:** Healthcare Assistant & Phlebotomy
- **Candidate Count:** 10
- **Intended Workflow:** Demonstrates multi-format ingestion supporting both `.csv` and native binary `.xlsx` workbooks through the same strict Zod validation pipeline.

---

## 🚀 How to Upload

1. Navigate to the Staff Login Portal at [http://localhost:5173/login](http://localhost:5173/login).
2. Click **Anika (Training Centre)** for 1-click reviewer access.
3. On the dashboard, click the **"Upload Batch"** button in the top right.
4. Drag and drop any of the sample files above (or select from disk).
5. Enter or select the Course Name and click **"Upload & Validate Roster"**.
