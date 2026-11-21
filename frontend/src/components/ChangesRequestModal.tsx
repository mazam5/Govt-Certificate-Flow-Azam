import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { AlertCircle, RotateCcw } from 'lucide-react';

const reasonSchema = z.object({
  reason: z.string().min(5, 'A clear reason is mandatory (minimum 5 characters).'),
});

type ReasonFormData = z.infer<typeof reasonSchema>;

interface Props {
  isOpen: boolean;
  batchNumber: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}

export const ChangesRequestModal: React.FC<Props> = ({ isOpen, batchNumber, onClose, onSubmit }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReasonFormData>({
    resolver: zodResolver(reasonSchema),
  });

  if (!isOpen) return null;

  const handleFormSubmit = async (data: ReasonFormData) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(data.reason.trim());
      reset();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to request changes');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="bg-rose-700 px-6 py-4 text-white">
          <div className="flex items-center space-x-2">
            <RotateCcw className="w-5 h-5 text-rose-200" />
            <DialogTitle className="text-white text-base font-bold">Request Changes / Send Back</DialogTitle>
          </div>
          <DialogDescription className="text-rose-200 text-xs">
            Review Policy: Invalidates prior approvals on resubmit
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="p-6 space-y-4">
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
            <p className="font-semibold flex items-center mb-1">
              <AlertCircle className="w-4 h-4 mr-1 text-rose-600" />
              Batch: {batchNumber}
            </p>
            <p>
              <strong>Policy Reminder:</strong> Sending back this batch will notify the Training Centre. When the centre resubmits, all prior approvals will be marked <code className="bg-rose-100 px-1 py-0.5 rounded">REVOKED_ON_RESUBMIT</code> so reviewers never sign off on unreviewed data.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Mandatory Reason for Changes
            </label>
            <textarea
              rows={3}
              {...register('reason')}
              placeholder="e.g. Discrepancy observed in candidate practical completion records. Please rectify and re-verify attendance."
              className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500 transition"
            />
            {errors.reason && (
              <p className="text-xs text-rose-600 mt-1">{errors.reason.message}</p>
            )}
          </div>

          {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}

          <div className="flex items-center justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition disabled:opacity-50"
            >
              {isSubmitting ? 'Sending Back...' : 'Send Back to Training Centre'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
