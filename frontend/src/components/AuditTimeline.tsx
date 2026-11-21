import React from 'react';
import type { AuditLogItem } from '../types';
import { Clock, CheckCircle2, RotateCcw, AlertTriangle, ShieldCheck, FileText, Ban } from 'lucide-react';

interface Props {
  logs: AuditLogItem[];
}

export const AuditTimeline: React.FC<Props> = ({ logs }) => {
  if (!logs || logs.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-slate-400">
        No audit log events recorded yet.
      </div>
    );
  }

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'BATCH_CREATED':
        return {
          icon: <FileText className="w-4 h-4 text-emerald-600" />,
          bg: 'bg-emerald-50 border-emerald-200 text-emerald-900',
          title: 'Batch Created',
        };
      case 'BATCH_SUBMITTED_FOR_REVIEW':
        return {
          icon: <Clock className="w-4 h-4 text-blue-600" />,
          bg: 'bg-blue-50 border-blue-200 text-blue-900',
          title: 'Submitted for Review',
        };
      case 'BATCH_OFFICER_APPROVED':
      case 'BATCH_APPROVAL_ADVANCED':
        return {
          icon: <CheckCircle2 className="w-4 h-4 text-indigo-600" />,
          bg: 'bg-indigo-50 border-indigo-200 text-indigo-900',
          title: 'Approval Recorded',
        };
      case 'BATCH_CHANGES_REQUESTED':
        return {
          icon: <RotateCcw className="w-4 h-4 text-rose-600" />,
          bg: 'bg-rose-50 border-rose-200 text-rose-900',
          title: 'Changes Requested',
        };
      case 'BATCH_RESUBMITTED_APPROVALS_INVALIDATED':
        return {
          icon: <RotateCcw className="w-4 h-4 text-amber-600" />,
          bg: 'bg-amber-50 border-amber-200 text-amber-900',
          title: 'Resubmitted (Prior Approvals Invalidated)',
        };
      case 'BATCH_SLA_BREACH_ESCALATED':
        return {
          icon: <AlertTriangle className="w-4 h-4 text-rose-600" />,
          bg: 'bg-rose-100 border-rose-300 text-rose-950 font-bold',
          title: 'SLA Breach Escalated to State Office',
        };
      case 'BATCH_CERTIFICATES_ISSUED':
        return {
          icon: <ShieldCheck className="w-4 h-4 text-purple-600" />,
          bg: 'bg-purple-50 border-purple-200 text-purple-900',
          title: 'Certificates Cryptographically Issued',
        };
      case 'CERTIFICATE_REVOKED':
        return {
          icon: <Ban className="w-4 h-4 text-red-600" />,
          bg: 'bg-red-50 border-red-200 text-red-900',
          title: 'Certificate Revoked',
        };
      default:
        return {
          icon: <Clock className="w-4 h-4 text-slate-600" />,
          bg: 'bg-slate-50 border-slate-200 text-slate-900',
          title: action,
        };
    }
  };

  return (
    <div className="flow-root">
      <ul className="-mb-8">
        {logs.map((log, idx) => {
          const badge = getActionBadge(log.action);
          const isLast = idx === logs.length - 1;

          return (
            <li key={log.id || idx}>
              <div className="relative pb-6">
                {!isLast && (
                  <span
                    className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-slate-200"
                    aria-hidden="true"
                  />
                )}
                <div className="relative flex space-x-3">
                  <div>
                    <span className="h-8 w-8 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-xs">
                      {badge.icon}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-900">{badge.title}</span>
                      <time className="text-slate-500 font-mono text-[11px]">
                        {new Date(log.timestamp).toLocaleString()}
                      </time>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      By <span className="font-semibold text-slate-800">{log.actorName}</span> (
                      <span className="font-mono text-[11px] text-slate-500">{log.role}</span>)
                    </p>
                    {log.metadata && (
                      <div className="mt-1.5 p-2 bg-slate-50 rounded-lg border border-slate-200 text-[11px] font-mono text-slate-700">
                        {typeof log.metadata === 'object' ? (
                          <div className="space-y-0.5">
                            {Object.entries(log.metadata).map(([k, v]) => (
                              <div key={k} className="flex">
                                <span className="font-semibold text-slate-500 mr-1.5">{k}:</span>
                                <span className="truncate">{String(v)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          String(log.metadata)
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
