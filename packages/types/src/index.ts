// Core Enums
export enum PipelineStage {
  INTAKE = 'INTAKE',
  CLINICAL_REVIEW = 'CLINICAL_REVIEW',
  SCHEDULING = 'SCHEDULING',
  NP_VISIT = 'NP_VISIT',
  NOTES_QA = 'NOTES_QA',
  BILLING = 'BILLING',
}

export enum WorkStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  ON_HOLD = 'ON_HOLD',
  BLOCKED_NEEDS_INFO = 'BLOCKED_NEEDS_INFO',
  COMPLETED = 'COMPLETED',
}

export enum CaseOutcome {
  ACTIVE = 'ACTIVE',
  REJECTED = 'REJECTED',
  PATIENT_DECLINED = 'PATIENT_DECLINED',
  DUPLICATE = 'DUPLICATE',
  DISCHARGED = 'DISCHARGED',
  CLOSED = 'CLOSED',
}

export enum BillingStatus {
  NOT_READY = 'NOT_READY',
  READY = 'READY',
  SUBMITTED = 'SUBMITTED',
  REJECTED = 'REJECTED',
  DENIED = 'DENIED',
  PAID = 'PAID',
}

export enum UserRole {
  INTAKE_SPECIALIST = 'INTAKE_SPECIALIST',
  CLINICAL_REVIEWER = 'CLINICAL_REVIEWER',
  CLINICAL_COORDINATOR = 'CLINICAL_COORDINATOR',
  OFFICE_MANAGER = 'OFFICE_MANAGER',
  SCHEDULER = 'SCHEDULER',
  NURSE_PRACTITIONER = 'NURSE_PRACTITIONER',
  BILLING_COORDINATOR = 'BILLING_COORDINATOR',
  ADMIN = 'ADMIN',
  COMPLIANCE = 'COMPLIANCE',
}

export enum ClinicalReviewDecision {
  ACCEPT = 'ACCEPT',
  RETURN = 'RETURN',
  REJECT = 'REJECT',
}

export enum VisitOutcome {
  COMPLETED = 'COMPLETED',
  NO_SHOW = 'NO_SHOW',
  RESCHEDULED = 'RESCHEDULED',
  CANCELLED = 'CANCELLED',
}

export enum NoteReviewDecision {
  APPROVE = 'APPROVE',
  RETURN_FOR_CORRECTION = 'RETURN_FOR_CORRECTION',
}

export enum DocumentType {
  REFERRAL_FORM = 'REFERRAL_FORM',
  INSURANCE_CARD = 'INSURANCE_CARD',
  CLINICAL_ORDER = 'CLINICAL_ORDER',
  MEDICAL_RECORD = 'MEDICAL_RECORD',
  IDENTIFICATION = 'IDENTIFICATION',
  CLINICAL_NOTE = 'CLINICAL_NOTE',
  SUPPORTING_DOCUMENT = 'SUPPORTING_DOCUMENT',
  OTHER = 'OTHER',
}

export enum Priority {
  ROUTINE = 'ROUTINE',
  URGENT = 'URGENT',
  STAT = 'STAT',
}

// User Types
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: UserRole[];
  sites: string[];
  states: string[];
  legalEntities: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  roles: UserRole[];
  scopes: {
    sites: string[];
    states: string[];
    legalEntities: string[];
  };
  sessionId: string;
  iat: number;
  exp: number;
}

// Patient Types
export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  medicalRecordNumber?: string;
  phone?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Referral Types
export interface Referral {
  id: string;
  patientId: string;
  patient?: Patient;
  pipelineStage: PipelineStage;
  workStatus: WorkStatus;
  caseOutcome: CaseOutcome;
  billingStatus: BillingStatus;
  priority: Priority;
  referralSource?: string;
  referringProvider?: string;
  referringFacility?: string;
  insurancePayer?: string;
  insuranceMemberId?: string;
  insuranceGroupNumber?: string;
  coverageVerified: boolean;
  coverageVerificationDate?: Date;
  site?: string;
  state?: string;
  legalEntity?: string;
  assignedTo?: string;
  assignedRole?: UserRole;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

// Document Types
export interface Document {
  id: string;
  referralId: string;
  type: DocumentType;
  filename: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  uploadedById: string;
  uploadedAt: Date;
  extractionStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  extractionData?: Record<string, any>;
  verifiedAt?: Date;
  verifiedById?: string;
}

// Clinical Review Types
export interface ClinicalReview {
  id: string;
  referralId: string;
  reviewerId: string;
  decision: ClinicalReviewDecision;
  reason?: string;
  notes?: string;
  reviewedAt: Date;
}

// Appointment Types
export interface Appointment {
  id: string;
  referralId: string;
  scheduledDate: Date;
  scheduledTime: string;
  durationMinutes: number;
  nursPractitionerId: string;
  location?: string;
  confirmedAt?: Date;
  confirmedBy?: string;
  cancelledAt?: Date;
  cancellationReason?: string;
  rescheduledFromId?: string;
  createdById: string;
  createdAt: Date;
}

// Visit/Encounter Types
export interface Encounter {
  id: string;
  referralId: string;
  appointmentId?: string;
  outcome: VisitOutcome;
  dateOfService?: Date;
  nursePractitionerId: string;
  servicesProvided?: string[];
  notes?: string;
  completedAt?: Date;
}

// Clinical Note Types
export interface ClinicalNote {
  id: string;
  referralId: string;
  encounterId: string;
  content: string;
  noteType: string;
  createdById: string;
  createdAt: Date;
  submittedAt?: Date;
  signedAt?: Date;
  signedById?: string;
}

// Note Review Types
export interface NoteReview {
  id: string;
  clinicalNoteId: string;
  referralId: string;
  reviewerId: string;
  decision: NoteReviewDecision;
  reason?: string;
  correctionRequired?: string;
  reviewedAt: Date;
}

// Claim Types
export interface Claim {
  id: string;
  referralId: string;
  claimNumber?: string;
  submittedAt?: Date;
  submittedById?: string;
  externalReference?: string;
  status: BillingStatus;
  rejectionReason?: string;
  denialReason?: string;
  paidAmount?: number;
  paidAt?: Date;
}

// Audit Event Types
export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  STAGE_TRANSITION = 'STAGE_TRANSITION',
  STATUS_CHANGE = 'STATUS_CHANGE',
  ASSIGNMENT = 'ASSIGNMENT',
  CLINICAL_REVIEW = 'CLINICAL_REVIEW',
  CLINICAL_APPROVAL = 'CLINICAL_APPROVAL',
  NOTE_REVIEW = 'NOTE_REVIEW',
  NOTE_APPROVAL = 'NOTE_APPROVAL',
  CLAIM_SUBMISSION = 'CLAIM_SUBMISSION',
  VIEW = 'VIEW',
  EXPORT = 'EXPORT',
}

export interface AuditEvent {
  id: string;
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: Record<string, any>;
  after?: Record<string, any>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

// WebSocket Event Types
export enum WebSocketEvent {
  REFERRAL_UPDATED = 'referral.updated',
  REFERRAL_ASSIGNED = 'referral.assigned',
  DOCUMENT_PROCESSED = 'document.processed',
  COMMENT_ADDED = 'comment.added',
  NOTIFICATION_CREATED = 'notification.created',
  DASHBOARD_REFRESH = 'dashboard.refresh',
}

export interface WebSocketMessage<T = any> {
  event: WebSocketEvent;
  data: T;
  timestamp: Date;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Array<{ field?: string; message: string }>;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// Permission Types
export interface Permission {
  resource: string;
  action: string;
  scope?: 'own' | 'site' | 'state' | 'all';
}

// Dashboard Types
export interface DashboardMetrics {
  totalActive: number;
  byStage: Record<PipelineStage, number>;
  byStatus: Record<WorkStatus, number>;
  overdue: number;
  dueToday: number;
  averageTimePerStage?: Record<PipelineStage, number>;
}

// Notification Types
export enum NotificationType {
  ASSIGNMENT = 'ASSIGNMENT',
  MENTION = 'MENTION',
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
  RETURNED_FOR_CORRECTION = 'RETURNED_FOR_CORRECTION',
  APPROVED = 'APPROVED',
  OVERDUE = 'OVERDUE',
  SYSTEM = 'SYSTEM',
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  referralId?: string;
  read: boolean;
  readAt?: Date;
  createdAt: Date;
}

// Document Management Types

export enum ExtractionStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

