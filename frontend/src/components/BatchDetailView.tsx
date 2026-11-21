import React, { useState } from 'react';
import type { Batch, Persona } from '../types';
import { api } from '../services/api';
import { AuditTimeline } from './AuditTimeline';
import { ChangesRequestModal } from './ChangesRequestModal';
import {
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Clock,
  Download,
  Send,
  Building,
  UserCheck,
  ShieldCheck,
  Smartphone,
  ExternalLink,
  ChevronLeft,
} from 'lucide-react';

interface Props {
  batch: Batch;
  activePersona: Persona;
  onBack: () => void;
  onRefresh: () => void;
  onOpenVerify: (certNumber: string) => void;
}

export const BatchDetailView: React.FC<Props> = ({
  batch,
  activePersona,
  onBack,
  onRefresh,
  onOpenVerify,
}) => {
  const [activeTab, setActiveTab] = useState<'candidates' | 'audit'>('candidates');
  const [isChangesModalOpen, setIsChangesModalOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Approvals breakdown
  const districtApprovals = (batch.approvals || []).filter(
    (a) => a.level === 'DISTRICT' && a.version === batch.version && a.status === 'APPROVED'
  );
  const qualityApprovals = (batch.approvals || []).filter(
    (a) => a.level === 'QUALITY' && a.version === batch.version && a.status === 'APPROVED'
  );

  const hasCurrentOfficerApproved = districtApprovals.some((a) => a.officerId === activePersona.id);

  // Status Badge Helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-700 border border-slate-300">DRAFT</span>;
      case 'SUBMITTED':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-blue-100 text-blue-800 border border-blue-300 animate-pulse">UNDER DISTRICT REVIEW</span>;
      case 'DISTRICT_APPROVED':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-teal-100 text-teal-800 border border-teal-300">DISTRICT APPROVED</span>;
      case 'QUALITY_APPROVED':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-purple-100 text-purple-800 border border-purple-300">QUALITY VERIFIED</span>;
      case 'STATE_APPROVED':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">STATE APPROVED / ISSUED</span>;
      case 'CHANGES_REQUESTED':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-rose-100 text-rose-800 border border-rose-300">CHANGES REQUESTED</span>;
      case 'ESCALATED':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-900 border border-amber-400 font-extrabold animate-bounce">⚠️ SLA ESCALATED</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-800">{status}</span>;
    }
  };

  // Actions
  const handleSubmitBatch = async () => {
    setIsActionLoading(true);
    try {
      await api.submitBatch(batch.id, activePersona);
      onRefresh();
    } catch (err: any) {
      alert(`Submission failed: ${err.message}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleApprove = async () => {
    setIsActionLoading(true);
    try {
      await api.approveBatch(batch.id, `Approved by ${activePersona.name} (${activePersona.role})`, activePersona);
      onRefresh();
    } catch (err: any) {
      alert(`Approval error: ${err.message}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRequestChanges = async (reason: string) => {
    await api.requestChanges(batch.id, reason, activePersona);
    onRefresh();
  };

  const handleResubmit = async () => {
    if (!confirm('Resubmitting will restart the review process and invalidate all prior approvals. Continue?')) {
      return;
    }
    setIsActionLoading(true);
    try {
      await api.resubmitBatch(batch.id, null, activePersona);
      onRefresh();
    } catch (err: any) {
      alert(`Resubmission error: ${err.message}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Batches
        </button>
        <div className="flex items-center space-x-2">
          <span className="text-xs font-mono text-slate-500">Version: v{batch.version}</span>
          {getStatusBadge(batch.status)}
        </div>
      </div>

      {/* Changes Requested Banner */}
      {batch.status === 'CHANGES_REQUESTED' && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs text-rose-900 flex items-start space-x-3">
          <RotateCcw className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <h4 className="font-bold">Changes Requested by {batch.rejectedBy || 'Reviewer'}</h4>
            <p className="mt-1 bg-white p-2.5 rounded-lg border border-rose-200 text-rose-800 font-medium">
              "{batch.rejectionReason}"
            </p>
            <p className="mt-2 text-rose-700">
              <strong>Explicit Policy:</strong> When resubmitted, all prior approvals will be revoked (marked REVOKED_ON_RESUBMIT in audit trail).
            </p>
          </div>
          {activePersona.role === 'TRAINING_CENTRE' && (
            <button
              onClick={handleResubmit}
              disabled={isActionLoading}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs shadow-xs transition"
            >
              Resubmit Batch
            </button>
          )}
        </div>
      )}

      {/* SLA Escalation Banner */}
      {batch.status === 'ESCALATED' && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-xs text-amber-900 flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <h4 className="font-extrabold text-amber-950">⚠️ SLA Review Breach Escalation</h4>
            <p className="mt-0.5 text-amber-800">
              This batch exceeded the maximum SLA turnaround time without required officer actions. It is now escalated directly to Farah (State Office) for priority sanction.
            </p>
          </div>
        </div>
      )}

      {/* Batch Overview Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
              {batch.batchNumber}
            </span>
            <h2 className="text-xl font-bold text-slate-900 mt-1">{batch.courseName}</h2>
            <div className="flex items-center space-x-4 text-xs text-slate-500 mt-2">
              <span className="flex items-center">
                <Building className="w-3.5 h-3.5 mr-1 text-slate-400" />
                {batch.centre?.name || 'Pragati Centre'} ({batch.centre?.district || 'District A'})
              </span>
              <span>•</span>
              <span>{batch.totalCandidates} Candidates</span>
              <span>•</span>
              <span>Created {new Date(batch.createdAt).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Action Buttons for Active Persona */}
          <div className="flex items-center flex-wrap gap-2">
            {/* Training Centre (Anika) */}
            {activePersona.role === 'TRAINING_CENTRE' && batch.status === 'DRAFT' && (
              <button
                onClick={handleSubmitBatch}
                disabled={isActionLoading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center space-x-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Submit for District Approval</span>
              </button>
            )}

            {/* District Officers (Dev, Meera, Kabir) */}
            {activePersona.role === 'DISTRICT_OFFICER' && (batch.status === 'SUBMITTED' || batch.status === 'ESCALATED') && (
              <>
                <button
                  onClick={handleApprove}
                  disabled={isActionLoading || hasCurrentOfficerApproved}
                  className={`px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition flex items-center space-x-1.5 ${
                    hasCurrentOfficerApproved
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {hasCurrentOfficerApproved
                      ? 'You Have Already Approved'
                      : `Approve as District Officer (${activePersona.name})`}
                  </span>
                </button>
                <button
                  onClick={() => setIsChangesModalOpen(true)}
                  className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold transition flex items-center space-x-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Request Changes</span>
                </button>
              </>
            )}

            {/* Quality Team (Neha - required only for >= 50 candidates) */}
            {activePersona.role === 'QUALITY_TEAM' && batch.status === 'DISTRICT_APPROVED' && batch.totalCandidates >= 50 && (
              <>
                <button
                  onClick={handleApprove}
                  disabled={isActionLoading}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center space-x-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Approve Quality Verification (Neha)</span>
                </button>
                <button
                  onClick={() => setIsChangesModalOpen(true)}
                  className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold transition"
                >
                  Request Changes
                </button>
              </>
            )}

            {/* State Office (Farah - Final Approval & Issuance) */}
            {activePersona.role === 'STATE_OFFICE' && (
              (batch.totalCandidates >= 50 && batch.status === 'QUALITY_APPROVED') ||
              (batch.totalCandidates < 50 && batch.status === 'DISTRICT_APPROVED') ||
              batch.status === 'ESCALATED'
            ) && (
              <>
                <button
                  onClick={handleApprove}
                  disabled={isActionLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center space-x-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Final Sanction & Issue Certificates (Farah)</span>
                </button>
                <button
                  onClick={() => setIsChangesModalOpen(true)}
                  className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold transition"
                >
                  Request Changes
                </button>
              </>
            )}
          </div>
        </div>

        {/* Workflow Approval Stepper */}
        <div className="pt-5">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
            Workflow Governance State
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {/* Step 1: Centre Submission */}
            <div className={`p-3 rounded-xl border text-xs ${
              batch.status !== 'DRAFT'
                ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}>
              <div className="flex items-center justify-between font-bold">
                <span>1. Centre Upload</span>
                {batch.status !== 'DRAFT' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Uploaded by Anika</p>
            </div>

            {/* Step 2: District Approval (Requires 2 distinct officers) */}
            <div className={`p-3 rounded-xl border text-xs ${
              districtApprovals.length >= 2
                ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                : batch.status === 'SUBMITTED'
                ? 'bg-blue-50/70 border-blue-200 text-blue-900 ring-1 ring-blue-300'
                : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}>
              <div className="flex items-center justify-between font-bold">
                <span>2. District Approvals</span>
                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-white border border-slate-200">
                  {districtApprovals.length}/2
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {districtApprovals.length === 0
                  ? 'Awaiting Dev, Meera, or Kabir'
                  : districtApprovals.map((a) => a.officerName).join(', ')}
              </p>
            </div>

            {/* Step 3: Quality Audit (If >= 50 candidates) */}
            <div className={`p-3 rounded-xl border text-xs ${
              batch.totalCandidates < 50
                ? 'bg-slate-50/40 border-slate-200 text-slate-400 opacity-60'
                : qualityApprovals.length > 0
                ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                : batch.status === 'DISTRICT_APPROVED'
                ? 'bg-purple-50/70 border-purple-200 text-purple-900 ring-1 ring-purple-300'
                : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}>
              <div className="flex items-center justify-between font-bold">
                <span>3. Quality Audit</span>
                {batch.totalCandidates < 50 ? (
                  <span className="text-[10px] text-slate-400">Skipped (&lt;50)</span>
                ) : qualityApprovals.length > 0 ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : null}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {batch.totalCandidates < 50
                  ? 'Auto-skipped (Direct to State)'
                  : qualityApprovals.length > 0
                  ? 'Verified by Neha'
                  : 'Required (≥50 candidates)'}
              </p>
            </div>

            {/* Step 4: State Sanction & Issuance */}
            <div className={`p-3 rounded-xl border text-xs ${
              batch.status === 'STATE_APPROVED'
                ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}>
              <div className="flex items-center justify-between font-bold">
                <span>4. State Sanction</span>
                {batch.status === 'STATE_APPROVED' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {batch.status === 'STATE_APPROVED'
                  ? 'Sanctioned by Farah'
                  : 'Final approval & PDF/WA issuance'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-4 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('candidates')}
          className={`pb-3 text-xs font-bold transition flex items-center space-x-1.5 ${
            activeTab === 'candidates'
              ? 'border-b-2 border-indigo-600 text-indigo-600'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Candidates & Certificates ({batch.candidates?.length || 0})</span>
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-3 text-xs font-bold transition flex items-center space-x-1.5 ${
            activeTab === 'audit'
              ? 'border-b-2 border-indigo-600 text-indigo-600'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Immutable Audit Timeline ({batch.auditLogs?.length || 0})</span>
        </button>
      </div>

      {/* Tab 1: Candidates & Certificates */}
      {activeTab === 'candidates' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">#</th>
                  <th className="px-4 py-3 text-left font-semibold">Candidate Name</th>
                  <th className="px-4 py-3 text-left font-semibold">Contact & Aadhar</th>
                  <th className="px-4 py-3 text-left font-semibold">Grade</th>
                  <th className="px-4 py-3 text-left font-semibold">Certificate Number</th>
                  <th className="px-4 py-3 text-left font-semibold">WhatsApp Delivery</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(batch.candidates || []).map((candidate, idx) => {
                  const cert = candidate.certificate;
                  const delivery = candidate.delivery;

                  return (
                    <tr key={candidate.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 text-slate-400 font-mono">{idx + 1}</td>
                      <td className="px-4 py-2.5">
                        <div className="font-bold text-slate-900">{candidate.name}</div>
                        <div className="text-[11px] text-slate-500">S/o {candidate.fatherName}</div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 font-mono text-[11px]">
                        <div>+91-{candidate.phone}</div>
                        <div className="text-slate-400">UID: •••• {candidate.aadharLast4}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                          {candidate.grade}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {cert ? (
                          <div className="space-y-0.5">
                            <button
                              onClick={() => onOpenVerify(cert.certNumber)}
                              className="font-mono font-bold text-indigo-600 hover:text-indigo-800 flex items-center text-[11px]"
                            >
                              <span>{cert.certNumber}</span>
                              <ExternalLink className="w-3 h-3 ml-1" />
                            </button>
                            <span className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              cert.status === 'VALID'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-rose-50 text-rose-700'
                            }`}>
                              {cert.status}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Pending sanction</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {delivery ? (
                          <div className="space-y-0.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              delivery.status === 'DELIVERED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : delivery.status === 'FAILED'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              <Smartphone className="w-3 h-3 mr-1" />
                              {delivery.status} (Attempts: {delivery.attempts})
                            </span>
                            {delivery.errorMessage && (
                              <div className="text-[10px] text-rose-600 truncate max-w-xs" title={delivery.errorMessage}>
                                {delivery.errorMessage}
                              </div>
                            )}
                          </div>
                        ) : cert ? (
                          <span className="text-slate-400 text-[11px] animate-pulse">Enqueued...</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {cert && (
                          <a
                            href={`/api/certificates/${cert.certNumber}/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md font-semibold text-[11px] transition"
                          >
                            <Download className="w-3 h-3 mr-1" />
                            PDF
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Immutable Audit Timeline */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <AuditTimeline logs={batch.auditLogs || []} />
        </div>
      )}

      {/* Changes Request Modal */}
      <ChangesRequestModal
        isOpen={isChangesModalOpen}
        batchNumber={batch.batchNumber}
        onClose={() => setIsChangesModalOpen(false)}
        onSubmit={handleRequestChanges}
      />
    </div>
  );
};
