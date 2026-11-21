import xlsx from 'xlsx';
import { AppError } from '../middleware/errorHandler.js';
import { LlmService } from './llm.service.js';

export interface RawCandidateRow {
  name?: string;
  fatherName?: string;
  dateOfBirth?: string;
  gender?: string;
  aadharLast4?: string;
  phone?: string;
  course?: string;
  grade?: string;
  completionDate?: string;
  [key: string]: any;
}

export interface ValidationErrorItem {
  row: number;
  column: string;
  value: any;
  reason: string;
}

export interface ValidatedCandidate {
  name: string;
  fatherName: string;
  dateOfBirth: string;
  gender: string;
  aadharLast4: string;
  phone: string;
  course: string;
  grade: string;
  completionDate: string;
}

export class SpreadsheetService {
  /**
   * Parse CSV or XLSX buffer with LLM-assisted / fuzzy header normalization
   */
  public static parseFile(buffer: Buffer): RawCandidateRow[] {
    const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new AppError('The uploaded spreadsheet contains no sheets or readable data.', 400);
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rawData = xlsx.utils.sheet_to_json<Record<string, any>>(worksheet, { raw: false, defval: '' });

    if (!rawData || rawData.length === 0) {
      throw new AppError('The uploaded spreadsheet is empty. Please provide at least one candidate row.', 400);
    }

    // Extract headers from first row
    const rawHeaders = Object.keys(rawData[0] || {});
    // Generate header mappings (AI-assisted or deterministic)
    const headerMappings: Record<string, string> = {};
    for (const header of rawHeaders) {
      const clean = header.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      if (/^(name|candidatename|studentname|traineename|fullname)$/.test(clean)) headerMappings[header] = 'name';
      else if (/^(fathername|fathersname|guardianname|parentname|father)$/.test(clean)) headerMappings[header] = 'fatherName';
      else if (/^(dateofbirth|dob|birthdate|birthday)$/.test(clean)) headerMappings[header] = 'dateOfBirth';
      else if (/^(gender|sex)$/.test(clean)) headerMappings[header] = 'gender';
      else if (/^(aadhar|aadharlast4|aadhaarno|uid|uidai|last4aadhar)$/.test(clean)) headerMappings[header] = 'aadharLast4';
      else if (/^(phone|mobile|contact|phonenumber|mobileno|cell)$/.test(clean)) headerMappings[header] = 'phone';
      else if (/^(course|coursename|trade|program|trainingtrade)$/.test(clean)) headerMappings[header] = 'course';
      else if (/^(grade|score|result|marks)$/.test(clean)) headerMappings[header] = 'grade';
      else if (/^(completiondate|passedon|examdate|enddate|completedon)$/.test(clean)) headerMappings[header] = 'completionDate';
      else headerMappings[header] = clean;
    }

    return rawData.map((row) => {
      const normalized: RawCandidateRow = {};
      for (const [key, value] of Object.entries(row)) {
        const targetField = headerMappings[key] || key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        const strVal = typeof value === 'string' ? value.trim() : String(value ?? '').trim();

        if (targetField === 'name') normalized.name = strVal;
        else if (targetField === 'fatherName' || targetField === 'fathername') normalized.fatherName = strVal;
        else if (targetField === 'dateOfBirth' || targetField === 'dateofbirth') normalized.dateOfBirth = strVal;
        else if (targetField === 'gender') normalized.gender = strVal;
        else if (targetField === 'aadharLast4' || targetField === 'aadharlast4') normalized.aadharLast4 = strVal;
        else if (targetField === 'phone') normalized.phone = strVal;
        else if (targetField === 'course') normalized.course = strVal;
        else if (targetField === 'grade') normalized.grade = strVal;
        else if (targetField === 'completionDate' || targetField === 'completiondate') normalized.completionDate = strVal;
        else normalized[key] = strVal;
      }
      return normalized;
    });
  }

  /**
   * Strictly validate all rows upfront. Zero partial writes if ANY row fails.
   */
  public static validateRows(rows: RawCandidateRow[]): {
    isValid: boolean;
    errors: ValidationErrorItem[];
    candidates: ValidatedCandidate[];
  } {
    const errors: ValidationErrorItem[] = [];
    const candidates: ValidatedCandidate[] = [];

    const phoneRegex = /^[6-9]\d{9}$/;
    const aadharRegex = /^\d{4}$/;
    const validGenders = ['male', 'female', 'other', 'm', 'f', 'o'];

    rows.forEach((row, index) => {
      const rowNum = index + 2;
      const rowErrors: ValidationErrorItem[] = [];

      // 1. Candidate Name
      if (!row.name || row.name.trim().length < 2) {
        rowErrors.push({
          row: rowNum,
          column: 'Name',
          value: row.name || '',
          reason: 'Name must be at least 2 characters long.',
        });
      }

      // 2. Father's Name
      if (!row.fatherName || row.fatherName.trim().length < 2) {
        rowErrors.push({
          row: rowNum,
          column: 'Father Name',
          value: row.fatherName || '',
          reason: "Father's name is mandatory (min 2 characters).",
        });
      }

      // 3. Date of Birth
      if (!row.dateOfBirth || isNaN(Date.parse(row.dateOfBirth))) {
        rowErrors.push({
          row: rowNum,
          column: 'Date of Birth',
          value: row.dateOfBirth || '',
          reason: 'Valid date of birth required (e.g. YYYY-MM-DD or DD/MM/YYYY).',
        });
      }

      // 4. Gender
      if (!row.gender || !validGenders.includes(row.gender.toLowerCase())) {
        rowErrors.push({
          row: rowNum,
          column: 'Gender',
          value: row.gender || '',
          reason: "Gender must be 'Male', 'Female', or 'Other'.",
        });
      }

      // 5. Aadhar Last 4
      const cleanAadhar = (row.aadharLast4 || '').replace(/[^0-9]/g, '');
      if (!cleanAadhar || !aadharRegex.test(cleanAadhar)) {
        rowErrors.push({
          row: rowNum,
          column: 'Aadhar Last 4',
          value: row.aadharLast4 || '',
          reason: 'Aadhar must contain exactly 4 numeric digits.',
        });
      }

      // 6. Phone Number
      const cleanPhone = (row.phone || '').replace(/[^0-9]/g, '');
      if (!cleanPhone || !phoneRegex.test(cleanPhone)) {
        rowErrors.push({
          row: rowNum,
          column: 'Phone',
          value: row.phone || '',
          reason: 'Phone must be a valid 10-digit mobile number starting with 6, 7, 8, or 9.',
        });
      }

      // 7. Course
      if (!row.course || row.course.trim().length < 2) {
        rowErrors.push({
          row: rowNum,
          column: 'Course',
          value: row.course || '',
          reason: 'Course name is mandatory.',
        });
      }

      // 8. Grade
      if (!row.grade || row.grade.trim().length === 0) {
        rowErrors.push({
          row: rowNum,
          column: 'Grade',
          value: row.grade || '',
          reason: 'Grade is required (e.g., A+, A, B, C, Distinction).',
        });
      }

      // 9. Completion Date
      if (!row.completionDate || isNaN(Date.parse(row.completionDate))) {
        rowErrors.push({
          row: rowNum,
          column: 'Completion Date',
          value: row.completionDate || '',
          reason: 'Valid completion date is required.',
        });
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
      } else {
        candidates.push({
          name: row.name!.trim(),
          fatherName: row.fatherName!.trim(),
          dateOfBirth: row.dateOfBirth!.trim(),
          gender: row.gender!.trim(),
          aadharLast4: cleanAadhar,
          phone: cleanPhone,
          course: row.course!.trim(),
          grade: row.grade!.trim().toUpperCase(),
          completionDate: row.completionDate!.trim(),
        });
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      candidates: errors.length === 0 ? candidates : [],
    };
  }

  public static generateSampleCsv(count = 5): string {
    const headers = [
      'Name',
      'Father Name',
      'Date of Birth',
      'Gender',
      'Aadhar Last 4',
      'Phone',
      'Course',
      'Grade',
      'Completion Date',
    ];

    const rows = [
      ['Aarav Sharma', 'Rajesh Sharma', '2001-05-14', 'Male', '4821', '9876543210', 'Solar Panel Installation Technician', 'A+', '2026-02-15'],
      ['Priya Patel', 'Suresh Patel', '2002-08-22', 'Female', '9123', '9812345678', 'Healthcare Assistant & Phlebotomy', 'A', '2026-02-15'],
      ['Rohan Gupta', 'Manoj Gupta', '2000-11-03', 'Male', '3412', '9723456789', 'Electric Vehicle Service Specialist', 'B', '2026-02-15'],
      ['Sneha Verma', 'Anand Verma', '2003-01-30', 'Female', '6547', '9634567890', 'Digital Marketing & E-Commerce Executive', 'A+', '2026-02-15'],
      ['Vikas Kumar', 'Ramesh Kumar', '2001-09-17', 'Male', '7890', '9545678901', 'CNC Operator & Precision Machining', 'A', '2026-02-15'],
    ];

    return [headers.join(','), ...rows.slice(0, count).map((r) => r.join(','))].join('\n');
  }
}
