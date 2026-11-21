import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '../services/api';
import type { Persona, ValidationErrorItem } from '../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { UploadCloud, FileSpreadsheet, AlertCircle, Download, HelpCircle } from 'lucide-react';

const uploadSchema = z.object({
  courseName: z.string().min(3, 'Course name must be at least 3 characters'),
});

type UploadFormData = z.infer<typeof uploadSchema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  activePersona: Persona;
}

export const BatchUploadModal: React.FC<Props> = ({ isOpen, onClose, onSuccess, activePersona }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errors, setErrors] = useState<ValidationErrorItem[]>([]);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors: formErrors },
  } = useForm<UploadFormData>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      courseName: 'Solar PV Installation & Maintenance',
    },
  });

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setErrors([]);
      setGeneralError(null);
    }
  };

  const onSubmit = async (data: UploadFormData) => {
    if (!file) {
      setGeneralError('Please select a CSV or XLSX file to upload.');
      return;
    }

    setIsUploading(true);
    setErrors([]);
    setGeneralError(null);

    try {
      await api.uploadBatch(file, data.courseName, activePersona);
      onSuccess();
      onClose();
    } catch (err: any) {
      if (err.errors && Array.isArray(err.errors)) {
        setErrors(err.errors);
        setGeneralError(`Atomic Validation Failed: ${err.errorCount} issue(s) detected. Zero rows were written to the database.`);
      } else {
        setGeneralError(err.message || 'Failed to upload batch.');
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleLoadSample = (sampleType: 'valid5' | 'valid60' | 'invalid') => {
    let content = '';
    let filename = '';

    const headers = 'Name,Father Name,Date of Birth,Gender,Aadhar Last 4,Phone,Course,Grade,Completion Date\n';

    if (sampleType === 'valid5') {
      content = headers +
        'Aarav Sharma,Rajesh Sharma,2001-05-14,Male,4821,9876543210,Solar PV Installation & Maintenance,A+,2026-02-15\n' +
        'Priya Patel,Suresh Patel,2002-08-22,Female,9123,9812345678,Healthcare Assistant & Phlebotomy,A,2026-02-15\n' +
        'Rohan Gupta,Manoj Gupta,2000-11-03,Male,3412,9723456789,Electric Vehicle Specialist,B,2026-02-15\n' +
        'Sneha Verma,Anand Verma,2003-01-30,Female,6547,9634567890,Digital Executive,A+,2026-02-15\n' +
        'Vikas Kumar,Ramesh Kumar,2001-09-17,Male,7890,9545678901,CNC Operator,A,2026-02-15';
      filename = 'sample_valid_5_candidates.csv';
    } else if (sampleType === 'valid60') {
      const rows: string[] = [];
      for (let i = 1; i <= 60; i++) {
        rows.push(`Trainee ${i},Guardian ${i},2000-01-01,Male,${1000 + (i % 9000)},98${String(10000000 + i).slice(-8)},High Volume Skilling,A,2026-02-15`);
      }
      content = headers + rows.join('\n');
      filename = 'sample_large_batch_60_candidates.csv';
    } else {
      content = headers +
        'Sunil Rao,Prakash Rao,2001-05-14,Male,4821,98765,Solar PV Installation,A,2026-02-15\n' +
        'Ananya Sen,Bimal Sen,2002-08-22,Female,91234,9812345678,Healthcare,A,2026-02-15\n' +
        'Kunal Das,Amit Das,invalid-date,Male,3412,9723456789,EV Tech,B,2026-02-15';
      filename = 'sample_with_validation_errors.csv';
    }

    const blob = new Blob([content], { type: 'text/csv' });
    const dummyFile = new File([blob], filename, { type: 'text/csv' });
    setFile(dummyFile);
    setErrors([]);
    setGeneralError(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl overflow-hidden p-0 gap-0">
        <DialogHeader className="bg-gradient-to-r from-indigo-700 to-indigo-900 px-6 py-4 text-white">
          <div className="flex items-center space-x-2">
            <UploadCloud className="w-6 h-6 text-indigo-300" />
            <div>
              <DialogTitle className="text-white text-lg font-bold">Upload Candidate Batch</DialogTitle>
              <DialogDescription className="text-indigo-200 text-xs">
                Centre: Pragati Training Centre - District A (Radix Accessible Dialog)
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
          {/* Preset Buttons for Quick Demo Testing */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center">
                <HelpCircle className="w-3.5 h-3.5 mr-1 text-indigo-600" />
                Quick Test Data Presets:
              </span>
              <a
                href="/api/batches/sample-csv"
                download="pragati_sample_candidates.csv"
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center"
              >
                <Download className="w-3 h-3 mr-1" />
                Download CSV Template
              </a>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleLoadSample('valid5')}
                className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-medium text-left transition"
              >
                <div className="font-semibold">Standard Batch (5 Candidates)</div>
                <div className="text-[10px] text-emerald-600">Routes: District → State</div>
              </button>
              <button
                type="button"
                onClick={() => handleLoadSample('valid60')}
                className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-300 rounded-lg text-xs font-medium text-left transition"
              >
                <div className="font-semibold">Large Batch (60 Candidates)</div>
                <div className="text-[10px] text-purple-600">Routes: District → Quality → State</div>
              </button>
              <button
                type="button"
                onClick={() => handleLoadSample('invalid')}
                className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-lg text-xs font-medium text-left transition"
              >
                <div className="font-semibold">Invalid Batch (Test Rejection)</div>
                <div className="text-[10px] text-rose-600">Tests upfront atomic validation</div>
              </button>
            </div>
          </div>

          {/* Course Name with React Hook Form & Zod */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Course / Trade Name
            </label>
            <input
              type="text"
              {...register('courseName')}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
              placeholder="e.g. Solar PV Installation & Maintenance"
            />
            {formErrors.courseName && (
              <p className="text-xs text-rose-600 mt-1">{formErrors.courseName.message}</p>
            )}
          </div>

          {/* File Picker */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Candidate Spreadsheet (.csv, .xlsx)
            </label>
            <div className="border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-xl p-5 text-center transition bg-slate-50/50">
              <input
                type="file"
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                <FileSpreadsheet className="w-10 h-10 text-indigo-500 mb-2" />
                <span className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">
                  {file ? file.name : 'Choose a CSV / Excel file or drag & drop'}
                </span>
                <span className="text-xs text-slate-500 mt-1">
                  Required columns: Name, Father Name, DOB, Gender, Aadhar Last 4, Phone, Grade, Completion Date
                </span>
              </label>
            </div>
          </div>

          {/* General Error Message */}
          {generalError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">{generalError}</p>
              </div>
            </div>
          )}

          {/* Row-Level Errors Table */}
          {errors.length > 0 && (
            <div className="border border-rose-200 rounded-xl overflow-hidden">
              <div className="bg-rose-100/70 px-4 py-2 border-b border-rose-200 flex items-center justify-between">
                <span className="text-xs font-bold text-rose-900 uppercase">
                  Atomic Validation Errors ({errors.length})
                </span>
                <span className="text-[11px] text-rose-700 font-medium">
                  Zero rows committed. Fix the spreadsheet and re-upload.
                </span>
              </div>
              <div className="max-h-56 overflow-y-auto">
                <table className="min-w-full divide-y divide-rose-200 text-xs">
                  <thead className="bg-rose-50/50 text-rose-800">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Row</th>
                      <th className="px-3 py-2 text-left font-semibold">Column</th>
                      <th className="px-3 py-2 text-left font-semibold">Provided Value</th>
                      <th className="px-3 py-2 text-left font-semibold">Validation Rule</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-100 bg-white">
                    {errors.map((err, idx) => (
                      <tr key={idx} className="hover:bg-rose-50/30">
                        <td className="px-3 py-1.5 font-bold text-rose-900">Row {err.row}</td>
                        <td className="px-3 py-1.5 font-medium text-slate-800">{err.column}</td>
                        <td className="px-3 py-1.5 text-slate-600 font-mono text-[11px]">
                          {String(err.value || '<empty>')}
                        </td>
                        <td className="px-3 py-1.5 text-rose-700">{err.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading || !file}
              className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition disabled:opacity-50 flex items-center space-x-1.5"
            >
              {isUploading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
                  <span>Validating & Uploading...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4 mr-1" />
                  <span>Upload & Validate Atomically</span>
                </>
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
