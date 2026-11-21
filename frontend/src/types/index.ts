export type Role = 'TRAINING_CENTRE' | 'DISTRICT_OFFICER' | 'QUALITY_TEAM' | 'STATE_OFFICE' | 'PUBLIC';

export type BatchStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'DISTRICT_APPROVED'
  | 'QUALITY_APPROVED'
  | 'STATE_APPROVED'
  | 'CHANGES_REQUESTED'
  | 'ESCALATED';

export type ReviewLevel = 'DISTRICT' | 'QUALITY' | 'STATE' | 'COMPLETED' | 'REJECTED';

export type CertificateStatus = 'VALID' | 'REVOKED';

export type DeliveryStatus = 'PENDING' | 'DELIVERED' | 'FAILED';

export interface Persona {
  id: string;
  name: string;
  role: Role;
  district?: string | null;
  description: string;
  badgeColor: string;
}

export interface TrainingCentre {
  id: string;
  name: string;
  code: string;
  district: string;
}

export interface DeliveryLog {
  id: string;
  status: DeliveryStatus;
  attempts: number;
  lastAttemptAt?: string;
  deliveredAt?: string;
  errorMessage?: string;
}

export interface Certificate {
  id: string;
  certNumber: string;
  batchId: string;
  candidateId: string;
  candidateName: string;
  courseName: string;
  centreName: string;
  district: string;
  issueDate: string;
  status: CertificateStatus;
  revocationReason?: string | null;
  revokedAt?: string | null;
  revokedBy?: string | null;
  pdfPath?: string;
  qrCodeData?: string;
  deliveryLogs?: DeliveryLog[];
}

export interface Candidate {
  id: string;
  batchId: string;
  name: string;
  fatherName: string;
  dateOfBirth: string;
  gender: string;
  aadharLast4: string;
  phone: string;
  course: string;
  grade: string;
  completionDate: string;
  certificate?: Certificate;
  delivery?: DeliveryLog;
}

export interface BatchApproval {
  id: string;
  batchId: string;
  officerId: string;
  officerName: string;
  role: Role;
  level: string;
  version: number;
  status: string;
  comments?: string;
  approvedAt: string;
}

export interface AuditLogItem {
  id: string;
  actorId: string;
  actorName: string;
  role: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: any;
  timestamp: string;
}

export interface Batch {
  id: string;
  batchNumber: string;
  centreId: string;
  centre?: TrainingCentre;
  courseName: string;
  totalCandidates: number;
  status: BatchStatus;
  currentReviewLevel: ReviewLevel;
  version: number;
  rejectionReason?: string | null;
  rejectedBy?: string | null;
  createdAt: string;
  updatedAt: string;
  candidates?: Candidate[];
  approvals?: BatchApproval[];
  certificates?: Certificate[];
  auditLogs?: AuditLogItem[];
  _count?: {
    candidates: number;
    certificates: number;
  };
}

export interface ValidationErrorItem {
  row: number;
  column: string;
  value: any;
  reason: string;
}
