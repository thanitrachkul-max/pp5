import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { createWorker as createTesseractWorker, OEM } from 'tesseract.js';
import tesseractWorkerUrl from 'tesseract.js/dist/worker.min.js?url';
import type { Classroom, Profile, Subject, UserRole } from '../types';

export interface AssignmentImportRow {
  teacherName: string;
  coTeacherName?: string;
  subjectCode: string;
  subjectName: string;
  classroomName: string;
  hoursPerWeek: number | null;
  hoursPerSemester: number | null;
}

export interface AssignmentReviewRow {
  key: string;
  line: number;
  teacherName: string;
  teacherId: string | null;
  teacherMatchConfidence?: 'exact' | 'compact' | 'fuzzy' | 'manual' | null;
  coTeacherName: string;
  subjectCode: string;
  subjectName: string;
  subjectId: string | null;
  classroomName: string;
  classroomId: string | null;
  hoursPerWeek: number | null;
  hoursPerSemester: number | null;
  issues: string[];
  warnings: string[];
}

const HEADER_ALIASES: Record<Exclude<keyof AssignmentImportRow, 'coTeacherName'>, string[]> = {
  teacherName: ['ครู', 'ชื่อครู', 'ครูผู้สอน', 'ผู้สอน', 'teacher', 'teacher_name'],
  subjectCode: ['รหัสวิชา', 'รหัส', 'subject_code', 'code'],
  subjectName: ['ชื่อวิชา', 'วิชา', 'รายวิชา', 'subject_name', 'subject'],
  classroomName: ['ห้อง', 'ห้องเรียน', 'ชั้น', 'ชั้นเรียน', 'ระดับชั้น', 'classroom', 'class'],
  hoursPerWeek: ['ชม./สัปดาห์', 'ชม/สัปดาห์', 'ชั่วโมง/สัปดาห์', 'hours_per_week'],
  hoursPerSemester: ['ชม./ภาค', 'ชม/ภาค', 'ชั่วโมง/ภาค', 'ชั่วโมง/ภาคเรียน', 'hours_per_semester'],
};

const XML_ELEMENT_NODE = 1;

function normalizeHeader(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeName(value: string): string {
  return value.trim().replace(/\u200b/g, '').replace(/\s+/g, ' ').toLowerCase();
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  return headers.findIndex((header) => aliases.some((alias) => header === alias.toLowerCase()));
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

const THAI_DIGIT_MAP: Record<string, string> = {
  '๐': '0',
  '๑': '1',
  '๒': '2',
  '๓': '3',
  '๔': '4',
  '๕': '5',
  '๖': '6',
  '๗': '7',
  '๘': '8',
  '๙': '9',
};

const TIMETABLE_SKIP_WORDS = [
  'กิจกรรม',
  'พักรับประทาน',
  'แนะแนว',
  'ชุมนุม',
  'ลูกเสือ',
  'เนตรนารี',
  'PLC',
  'หน้าเสาธง',
  'อบรมคุณธรรม',
  'คุณธรรมจริยธรรม',
  'กิจกรรมส่งเสริม',
  'กิจกรรมชุมชน',
];

const WEEKDAYS = new Set(['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์']);

const TEACHER_MARKER_PATTERN = /(?:ครู|รองฯ|ว่าที่ร้อยตรีหญิง|ว่าที่ร้อยตรี|นางสาว|นาง|นาย)\s*/;
const TEACHER_SPLIT_PATTERN = /(?=(?:ครู|รองฯ|ว่าที่ร้อยตรีหญิง|ว่าที่ร้อยตรี|นางสาว|นาง|นาย)\s*)/g;
const MANAGEMENT_TEACHER_PREFIX = /^(?:รองฯ|ผู้อำนวยการ|หัวหน้า)/u;

function normalizeThaiDigits(value: string): string {
  return value.replace(/[๐-๙]/g, (digit) => THAI_DIGIT_MAP[digit] ?? digit);
}

const SUBJECT_CODE_PATTERN = /[A-Za-zก-ฮ][\u0e31-\u0e4e]*\s*(?:[0-9ดตIl|]\s*){5}/u;
const SUBJECT_CODE_GLOBAL_PATTERN = /[A-Za-zก-ฮ][\u0e31-\u0e4e]*\s*(?:[0-9ดตIl|]\s*){5}/gu;

function normalizeSubjectCode(value: string): string {
  const normalized = normalizeThaiDigits(value).replace(/\s+/g, '');
  const match = normalized.match(/([A-Za-zก-ฮ])[\u0e31-\u0e4e]*((?:[0-9ดตIl|]){5})/u);
  const digits = match?.[2].replace(/[ดตIl|]/g, '1');
  return match && digits ? `${match[1]}${digits}` : normalized;
}

function normalizeTimetableText(value: string): string {
  return normalizeThaiDigits(value).replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
}

function stripTeacherPrefix(value: string): string {
  let next = normalizeTimetableText(value);
  let changed = true;
  while (changed) {
    const before = next;
    next = next.replace(/^(?:ครู|รองฯ|ว่าที่ร้อยตรีหญิง|ว่าที่ร้อยตรี|นางสาว|นาง|นาย)\s*/u, '').trim();
    changed = next !== before;
  }
  return next.replace(/^[,，;:|]+|[,，;:|]+$/g, '').trim();
}

function classroomNameFromHeading(text: string): string | null {
  const normalized = normalizeTimetableText(text);
  const compact = normalized.replace(/\s+/g, '');

  const secondary = normalized.match(/มัธยมศึกษาปี(?:ที่|ที)?\s*(\d+)\s*\/\s*(\d+)/);
  if (secondary) return `ม.${secondary[1]}/${secondary[2]}`;

  const primary = normalized.match(/(?:ชั้น)?ประถมศึกษาปี(?:ที่|ที)?\s*(\d+)(?:\s*\/\s*(\d+))?/);
  if (primary) return `ป.${primary[1]}/${primary[2] ?? '1'}`;

  const shortSecondary = normalized.match(/ม\.?\s*(\d+)\s*\/\s*(\d+)/);
  if (shortSecondary) return `ม.${shortSecondary[1]}/${shortSecondary[2]}`;

  const shortPrimary = normalized.match(/ป\.?\s*(\d+)\s*\/\s*(\d+)/);
  if (shortPrimary) return `ป.${shortPrimary[1]}/${shortPrimary[2]}`;

  const compactSecondary = compact.match(/มัธยมศึกษาปี(?:ที่|ที)?(\d+)\/(\d+)/);
  if (compactSecondary) return `ม.${compactSecondary[1]}/${compactSecondary[2]}`;

  const compactPrimary = compact.match(/(?:ชั้น)?ประถมศึกษาปี(?:ที่|ที)?(\d+)(?:\/(\d+))?/);
  if (compactPrimary) return `ป.${compactPrimary[1]}/${compactPrimary[2] ?? '1'}`;

  const compactShortSecondary = compact.match(/ม\.?(\d+)\/(\d+)/);
  if (compactShortSecondary) return `ม.${compactShortSecondary[1]}/${compactShortSecondary[2]}`;

  const compactShortPrimary = compact.match(/ป\.?(\d+)\/(\d+)/);
  if (compactShortPrimary) return `ป.${compactShortPrimary[1]}/${compactShortPrimary[2]}`;

  return null;
}

function classroomNameFromTable(table: Element): string | null {
  const rows = childElementsByLocalName(table, 'tr').slice(0, 5);
  for (const row of rows) {
    for (const cell of childElementsByLocalName(row, 'tc')) {
      const name = classroomNameFromHeading(docxText(cell));
      if (name) return name;
    }
    const rowText = rowTextContent(row);
    const name = classroomNameFromHeading(rowText);
    if (name) return name;
  }
  return null;
}

function rowTextContent(row: Element): string {
  return normalizeTimetableText(
    childElementsByLocalName(row, 'tc')
      .map((cell) => docxText(cell))
      .filter(Boolean)
      .join(' '),
  );
}

function elementsByLocalName(parent: Document | Element, localName: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS('*', localName));
}

function childElementsByLocalName(parent: ParentNode, localName: string): Element[] {
  return Array.from(parent.childNodes).filter(
    (node): node is Element => node.nodeType === XML_ELEMENT_NODE && (node as Element).localName === localName,
  );
}

function docxText(element: Element): string {
  return normalizeTimetableText(elementsByLocalName(element, 't').map((node) => node.textContent ?? '').join(''));
}

interface DocxTableCell {
  text: string;
  span: number;
}

function docxCellGridSpan(cell: Element): number {
  const gridSpan = elementsByLocalName(cell, 'gridSpan')[0];
  const raw = gridSpan?.getAttribute('w:val') ?? gridSpan?.getAttribute('val');
  const span = Number(raw);
  return Number.isFinite(span) && span > 0 ? span : 1;
}

function parseDocxTable(table: Element): DocxTableCell[][] {
  return childElementsByLocalName(table, 'tr').map((row) =>
    childElementsByLocalName(row, 'tc').map((cell) => ({
      text: docxText(cell),
      span: docxCellGridSpan(cell),
    })),
  );
}

function splitTeachersFromCell(rest: string, teacherMatchIndex: number): string[] {
  return rest
    .slice(teacherMatchIndex)
    .split(TEACHER_SPLIT_PATTERN)
    .map((part) => ({
      raw: normalizeTimetableText(part),
      name: stripTeacherPrefix(part),
    }))
    .filter(({ raw, name }) => {
      if (!name) return false;
      if (MANAGEMENT_TEACHER_PREFIX.test(raw)) return false;
      return true;
    })
    .map(({ name }) => name);
}

function parseTimetableCell(value: string): { code: string; subjectName: string; teachers: string[] } | null {
  const text = normalizeTimetableText(value);
  if (!text || TIMETABLE_SKIP_WORDS.some((word) => text.includes(word))) return null;

  const subjectMatch = text.match(SUBJECT_CODE_PATTERN);
  if (!subjectMatch || subjectMatch.index === undefined) return null;

  const code = normalizeSubjectCode(subjectMatch[0]);
  const rest = text.slice(subjectMatch.index + subjectMatch[0].length).trim();
  const teacherMatch = rest.match(TEACHER_MARKER_PATTERN);
  if (!teacherMatch || teacherMatch.index === undefined) return null;

  const subjectName = rest.slice(0, teacherMatch.index).trim();
  const teachers = splitTeachersFromCell(rest, teacherMatch.index);

  if (!subjectName || teachers.length === 0) return null;
  return { code, subjectName, teachers };
}

interface TimetableAggregate {
  classroomName: string;
  subjectCode: string;
  subjectName: string;
  periods: number;
  firstTeacherIndex: Map<string, number>;
  teacherPeriods: Map<string, number>;
}

type PdfJsModule = typeof import('pdfjs-dist');

interface PdfTextItemLike {
  str: string;
  transform: unknown[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
}

interface PdfTextFragment {
  page: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hasEOL: boolean;
}

interface PdfTextLine {
  page: number;
  y: number;
  text: string;
  fragments: PdfTextFragment[];
}

interface PdfDayBand {
  page: number;
  day: string;
  y: number;
  top: number;
  bottom: number;
  dayX: number;
}

let pdfJsModulePromise: Promise<PdfJsModule> | null = null;

async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = (async () => {
      if (typeof window === 'undefined') {
        const legacyPdfJs = ['pdfjs-dist', 'legacy', 'build', 'pdf.mjs'].join('/');
        return import(/* @vite-ignore */ legacyPdfJs) as Promise<PdfJsModule>;
      }

      const pdfjs = await import('pdfjs-dist');
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        const worker = await import('pdfjs-dist/build/pdf.worker.mjs?url');
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      }
      return pdfjs;
    })();
  }
  return pdfJsModulePromise;
}

function isPdfTextItem(item: unknown): item is PdfTextItemLike {
  return Boolean(item) && typeof item === 'object' && typeof (item as { str?: unknown }).str === 'string';
}

function weekdayFromText(value: string): string | null {
  const text = normalizeTimetableText(value).replace(/^วัน/u, '').replace(/\s+/g, '');
  const match = text.match(/^(จันทร์|อังคาร|พุธ|พฤหัสบดี|ศุกร์)/u);
  return match?.[1] ?? null;
}

function subjectCodeAnchorFromPdfFragments(fragments: PdfTextFragment[]): Array<{ x: number; y: number }> {
  const anchors: Array<{ x: number; y: number }> = [];

  for (const line of groupPdfFragmentsIntoLines(fragments)) {
    const sorted = [...line.fragments].sort((a, b) => a.x - b.x || b.y - a.y);

    sorted.forEach((fragment, index) => {
      const normalized = normalizeThaiDigits(fragment.text).replace(/\s+/g, '');
      if (SUBJECT_CODE_PATTERN.test(normalized)) {
        anchors.push({ x: fragment.x, y: line.y });
        return;
      }

      if (!/^[A-Za-zก-ฮ]$/u.test(normalized)) return;

      let combined = normalized;
      for (const next of sorted.slice(index + 1, index + 4)) {
        if (Math.abs(next.y - fragment.y) > Math.max(2.5, fragment.height * 0.6)) break;
        const gap = next.x - (fragment.x + fragment.width);
        if (gap > 6) break;
        combined += normalizeThaiDigits(next.text).replace(/\s+/g, '');
        if (SUBJECT_CODE_PATTERN.test(combined)) {
          anchors.push({ x: fragment.x, y: line.y });
          break;
        }
      }
    });
  }

  return anchors
    .sort((a, b) => a.x - b.x || b.y - a.y)
    .filter((anchor, index, list) => {
      const duplicateIndex = list.findIndex((item) => Math.abs(item.x - anchor.x) <= 3 && Math.abs(item.y - anchor.y) <= 3);
      return duplicateIndex === index;
    });
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function estimatePdfPeriodColumnWidth(anchors: Array<{ x: number; y: number }>): number {
  const xPositions = Array.from(new Set(anchors.map((anchor) => Math.round(anchor.x)))).sort((a, b) => a - b);
  const closeGaps = xPositions
    .slice(0, -1)
    .map((x, index) => xPositions[index + 1] - x)
    .filter((gap) => gap >= 35 && gap <= 120);
  return median(closeGaps) ?? 72;
}

function pdfFragmentFromTextItem(item: PdfTextItemLike, page: number): PdfTextFragment | null {
  const text = normalizeTimetableText(item.str);
  if (!text) return null;

  const x = Number(item.transform[4]);
  const y = Number(item.transform[5]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const width = Number(item.width);
  const height = Number(item.height);
  return {
    page,
    text,
    x,
    y,
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) && height > 0 ? height : 8,
    hasEOL: Boolean(item.hasEOL),
  };
}

function pdfInlineText(fragments: PdfTextFragment[]): string {
  const sorted = [...fragments].sort((a, b) => a.x - b.x || b.y - a.y);
  let text = '';
  let previous: PdfTextFragment | null = null;

  for (const fragment of sorted) {
    if (previous && text) {
      const gap = fragment.x - (previous.x + previous.width);
      const spaceThreshold = Math.max(2, Math.min(10, previous.height * 0.45));
      if (gap > spaceThreshold || previous.hasEOL) text += ' ';
    }
    text += fragment.text;
    previous = fragment;
  }

  return normalizeTimetableText(text);
}

function groupPdfFragmentsIntoLines(fragments: PdfTextFragment[]): PdfTextLine[] {
  const sorted = [...fragments].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const openLines: Array<{ page: number; y: number; fragments: PdfTextFragment[] }> = [];

  for (const fragment of sorted) {
    const tolerance = Math.max(2.5, fragment.height * 0.55);
    let line = openLines.find(
      (candidate) => candidate.page === fragment.page && Math.abs(candidate.y - fragment.y) <= tolerance,
    );

    if (!line) {
      line = { page: fragment.page, y: fragment.y, fragments: [] };
      openLines.push(line);
    }

    line.fragments.push(fragment);
    line.y = line.fragments.reduce((sum, item) => sum + item.y, 0) / line.fragments.length;
  }

  return openLines
    .map((line) => ({
      page: line.page,
      y: line.y,
      fragments: line.fragments,
      text: pdfInlineText(line.fragments),
    }))
    .filter((line) => Boolean(line.text))
    .sort((a, b) => a.page - b.page || b.y - a.y);
}

function pdfBlockText(fragments: PdfTextFragment[]): string {
  return groupPdfFragmentsIntoLines(fragments)
    .map((line) => line.text)
    .join(' ');
}

function extractTimetableEntriesFromText(text: string): Array<{ code: string; subjectName: string; teachers: string[] }> {
  const normalized = normalizeTimetableText(text);
  const matches = Array.from(normalized.matchAll(SUBJECT_CODE_GLOBAL_PATTERN));

  return matches
    .map((match, index) => {
      const start = match.index ?? 0;
      const end = matches[index + 1]?.index ?? normalized.length;
      return parseTimetableCell(normalized.slice(start, end));
    })
    .filter((entry): entry is { code: string; subjectName: string; teachers: string[] } => Boolean(entry));
}

function classroomForPdfPosition(lines: PdfTextLine[], page: number, y: number): string | null {
  let currentClassroomName = '';
  for (const line of lines) {
    if (line.page > page) break;
    if (line.page === page && line.y < y - 1) break;

    const maybeClassroomName = classroomNameFromHeading(line.text);
    if (maybeClassroomName) currentClassroomName = maybeClassroomName;
  }
  return currentClassroomName || null;
}

function findPdfDayBands(page: number, lines: PdfTextLine[]): PdfDayBand[] {
  const candidates: PdfDayBand[] = [];

  for (const line of lines.filter((item) => item.page === page)) {
    const day = weekdayFromText(line.text);
    if (!day) continue;

    const dayFragment = line.fragments.find((fragment) => weekdayFromText(fragment.text) === day) ?? line.fragments[0];
    candidates.push({
      page,
      day,
      y: line.y,
      top: line.y,
      bottom: line.y,
      dayX: dayFragment?.x ?? 0,
    });
  }

  const unique = candidates
    .sort((a, b) => b.y - a.y)
    .filter((candidate, index, list) => {
      const duplicateIndex = list.findIndex(
        (item) => item.day === candidate.day && Math.abs(item.y - candidate.y) <= 4,
      );
      return duplicateIndex === index;
    });

  if (unique.length === 0) return [];

  const gaps = unique
    .slice(0, -1)
    .map((item, index) => item.y - unique[index + 1].y)
    .filter((gap) => gap > 8)
    .sort((a, b) => a - b);
  const medianGap = gaps[Math.floor(gaps.length / 2)] ?? 34;
  const fallbackHalf = Math.max(16, Math.min(44, medianGap / 2));

  return unique.map((candidate, index) => {
    const previousY = unique[index - 1]?.y;
    const nextY = unique[index + 1]?.y;
    return {
      ...candidate,
      top: previousY === undefined ? candidate.y + fallbackHalf : (previousY + candidate.y) / 2,
      bottom: nextY === undefined ? candidate.y - fallbackHalf : (candidate.y + nextY) / 2,
    };
  });
}

function addTimetableEntry(
  aggregates: Map<string, TimetableAggregate>,
  classroomName: string,
  entry: { code: string; subjectName: string; teachers: string[] },
  periods: number,
) {
  const key = `${classroomName}|${entry.code}`;
  const current = aggregates.get(key) ?? {
    classroomName,
    subjectCode: entry.code,
    subjectName: entry.subjectName,
    periods: 0,
    firstTeacherIndex: new Map<string, number>(),
    teacherPeriods: new Map<string, number>(),
  };

  current.periods += periods;
  if (entry.subjectName.length > current.subjectName.length) current.subjectName = entry.subjectName;

  for (const teacher of entry.teachers) {
    if (!current.firstTeacherIndex.has(teacher)) {
      current.firstTeacherIndex.set(teacher, current.firstTeacherIndex.size);
    }
    current.teacherPeriods.set(teacher, (current.teacherPeriods.get(teacher) ?? 0) + periods);
  }
  aggregates.set(key, current);
}

function aggregateToImportRows(row: TimetableAggregate): AssignmentImportRow[] {
  const teachers = Array.from(row.teacherPeriods.entries())
    .sort((a, b) => {
      const periodDiff = b[1] - a[1];
      if (periodDiff !== 0) return periodDiff;
      return (row.firstTeacherIndex.get(a[0]) ?? 0) - (row.firstTeacherIndex.get(b[0]) ?? 0);
    })
    .map(([teacher]) => teacher);

  return teachers.map((teacherName) => ({
    teacherName,
    coTeacherName: teachers.filter((teacher) => teacher !== teacherName).join(', '),
    subjectCode: row.subjectCode,
    subjectName: row.subjectName,
    classroomName: row.classroomName,
    hoursPerWeek: row.teacherPeriods.get(teacherName) ?? row.periods,
    hoursPerSemester: (row.teacherPeriods.get(teacherName) ?? row.periods) * 20,
  }));
}

function addPdfBandEntries(
  aggregates: Map<string, TimetableAggregate>,
  fragments: PdfTextFragment[],
  lines: PdfTextLine[],
) {
  const pages = Array.from(new Set(fragments.map((fragment) => fragment.page))).sort((a, b) => a - b);

  for (const page of pages) {
    const pageFragments = fragments.filter((fragment) => fragment.page === page);
    const dayBands = findPdfDayBands(page, lines);

    for (const band of dayBands) {
      const classroomName = classroomForPdfPosition(lines, page, band.y);
      if (!classroomName) continue;

      const bandFragments = pageFragments.filter(
        (fragment) => fragment.y <= band.top && fragment.y >= band.bottom,
      );
      const contentFragments = bandFragments.filter((fragment) => {
        if (fragment.x <= band.dayX + 8) return false;
        const weekday = weekdayFromText(fragment.text);
        return !weekday || weekday !== band.day;
      });
      const anchors = subjectCodeAnchorFromPdfFragments(contentFragments);
      const periodColumnWidth = estimatePdfPeriodColumnWidth(anchors);
      const halfColumnWidth = periodColumnWidth * 0.52;

      for (const [index, anchor] of anchors.entries()) {
        const previousAnchor = anchors[index - 1];
        const nextAnchor = anchors[index + 1];
        const leftBoundary =
          previousAnchor && anchor.x - previousAnchor.x <= periodColumnWidth * 1.35
            ? (previousAnchor.x + anchor.x) / 2
            : Math.max(band.dayX + 8, anchor.x - halfColumnWidth);
        const rightBoundary =
          nextAnchor && nextAnchor.x - anchor.x <= periodColumnWidth * 1.35
            ? (anchor.x + nextAnchor.x) / 2
            : anchor.x + halfColumnWidth;
        const cellText = pdfBlockText(
          contentFragments.filter((fragment) => fragment.x >= leftBoundary && fragment.x < rightBoundary),
        );

        for (const entry of extractTimetableEntriesFromText(cellText)) {
          addTimetableEntry(aggregates, classroomName, entry, 1);
        }
      }
    }
  }
}

function addPdfLineEntries(aggregates: Map<string, TimetableAggregate>, lines: PdfTextLine[]) {
  let currentClassroomName = '';

  for (const line of lines) {
    const maybeClassroomName = classroomNameFromHeading(line.text);
    if (maybeClassroomName) {
      currentClassroomName = maybeClassroomName;
      continue;
    }

    if (!currentClassroomName || !weekdayFromText(line.text)) continue;

    for (const entry of extractTimetableEntriesFromText(line.text)) {
      addTimetableEntry(aggregates, currentClassroomName, entry, 1);
    }
  }
}

function parsePdfTimetableFragments(fragments: PdfTextFragment[]): AssignmentImportRow[] {
  const lines = groupPdfFragmentsIntoLines(fragments);
  const aggregates = new Map<string, TimetableAggregate>();

  addPdfBandEntries(aggregates, fragments, lines);
  if (aggregates.size === 0) {
    addPdfLineEntries(aggregates, lines);
  }

  return Array.from(aggregates.values()).flatMap(aggregateToImportRows);
}

interface OcrWord {
  text: string;
  confidence: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

interface OcrResultData {
  text?: string;
  blocks?: unknown[];
}

interface OcrWorkerLike {
  recognize(image: string, options?: unknown, output?: unknown): Promise<{ data: OcrResultData }>;
  terminate(): Promise<unknown>;
}

interface RenderedPdfPage {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  dataUrl: string;
}

interface PdfPageLike {
  getViewport(options: { scale: number }): { width: number; height: number };
  render(options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<unknown> };
}

interface PdfDocumentLike {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageLike>;
}

interface ScheduleRowBand {
  top: number;
  bottom: number;
}

interface ScheduleGrid {
  rowBands: ScheduleRowBand[];
  canonicalVerticalLines: number[];
  basePeriodWidth: number;
}

const FALLBACK_VERTICAL_LINE_RATIOS = [
  30 / 1684,
  120 / 1684,
  218 / 1684,
  390 / 1684,
  577 / 1684,
  750 / 1684,
  850 / 1684,
  953 / 1684,
  1139 / 1684,
  1326 / 1684,
  1499 / 1684,
  1644 / 1684,
];

const FALLBACK_ROW_LINE_RATIOS = [378 / 1192, 507 / 1192, 635 / 1192, 762 / 1192, 889 / 1192, 993 / 1192];

async function createThaiOcrWorker(): Promise<OcrWorkerLike> {
  const options = {
    corePath: `${window.location.origin}/ocr/core`,
    langPath: `${window.location.origin}/ocr`,
    workerPath: tesseractWorkerUrl,
    workerBlobURL: false,
  };

  try {
    return (await createTesseractWorker('tha+eng', OEM.LSTM_ONLY, options)) as unknown as OcrWorkerLike;
  } catch (initialError) {
    console.warn('OCR worker startup failed; refreshing the language cache', initialError);
    try {
      return (await createTesseractWorker('tha+eng', OEM.LSTM_ONLY, {
        ...options,
        cacheMethod: 'refresh',
      })) as unknown as OcrWorkerLike;
    } catch (retryError) {
      console.error('OCR worker startup failed after cache refresh', retryError);
      throw new Error('เริ่มระบบ OCR ไม่สำเร็จ กรุณารีเฟรชหน้าแล้วอัปโหลด PDF ใหม่');
    }
  }
}

function luminance(data: Uint8ClampedArray, offset: number): number {
  return data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
}

function clusteredLineCenters(counts: number[], threshold: number, maxGap = 2): number[] {
  const centers: number[] = [];
  let start = -1;
  let previous = -1;

  counts.forEach((count, index) => {
    if (count <= threshold) return;
    if (start < 0) {
      start = index;
      previous = index;
      return;
    }

    if (index <= previous + maxGap) {
      previous = index;
      return;
    }

    centers.push(Math.round((start + previous) / 2));
    start = index;
    previous = index;
  });

  if (start >= 0) centers.push(Math.round((start + previous) / 2));
  return centers;
}

function rowLineCentersFromImage(
  imageData: ImageData,
  width: number,
  height: number,
  xStart: number,
  xEnd: number,
): number[] {
  const counts = Array.from({ length: height }, () => 0);
  const data = imageData.data;

  for (let y = 0; y < height; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const offset = (y * width + x) * 4;
      if (luminance(data, offset) < 90) counts[y] += 1;
    }
  }

  return clusteredLineCenters(counts, Math.round((xEnd - xStart) * 0.25));
}

function columnLineCentersFromImage(
  imageData: ImageData,
  width: number,
  yStart: number,
  yEnd: number,
  luminanceLimit: number,
  coverageRatio: number,
): number[] {
  const counts = Array.from({ length: width }, () => 0);
  const data = imageData.data;

  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (luminance(data, offset) < luminanceLimit) counts[x] += 1;
    }
  }

  return clusteredLineCenters(counts, Math.round((yEnd - yStart) * coverageRatio));
}

function fallbackRowBands(height: number): ScheduleRowBand[] {
  return FALLBACK_ROW_LINE_RATIOS.slice(0, -1).map((ratio, index) => ({
    top: Math.round(ratio * height),
    bottom: Math.round(FALLBACK_ROW_LINE_RATIOS[index + 1] * height),
  }));
}

function fallbackVerticalLines(width: number): number[] {
  return FALLBACK_VERTICAL_LINE_RATIOS.map((ratio) => Math.round(ratio * width));
}

function cleanupLineCenters(centers: number[], minDistance: number): number[] {
  const sorted = [...centers].sort((a, b) => a - b);
  const cleaned: number[] = [];

  for (const center of sorted) {
    const previous = cleaned[cleaned.length - 1];
    if (previous === undefined || center - previous >= minDistance) {
      cleaned.push(center);
    }
  }

  return cleaned;
}

function detectScheduleGrid(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): ScheduleGrid {
  const width = canvas.width;
  const height = canvas.height;
  const imageData = context.getImageData(0, 0, width, height);
  const xStart = Math.round(width * 0.02);
  const xEnd = Math.round(width * 0.98);
  const horizontalLines = rowLineCentersFromImage(imageData, width, height, xStart, xEnd);
  const rowBands = horizontalLines
    .slice(0, -1)
    .map((top, index) => ({ top, bottom: horizontalLines[index + 1] }))
    .filter((band) => {
      const bandHeight = band.bottom - band.top;
      return band.top > height * 0.25 && band.bottom < height * 0.9 && bandHeight >= height * 0.07 && bandHeight <= height * 0.16;
    });

  const usableRowBands = rowBands.length >= 5 ? rowBands.slice(0, 5) : fallbackRowBands(height);
  const yStart = usableRowBands[0]?.top ?? Math.round(height * 0.32);
  const yEnd = usableRowBands[usableRowBands.length - 1]?.bottom ?? Math.round(height * 0.83);
  const detectedVerticalLines = cleanupLineCenters(
    columnLineCentersFromImage(imageData, width, yStart, yEnd, 90, 0.1),
    Math.round(width * 0.03),
  );
  const canonicalVerticalLines = detectedVerticalLines.length >= 8 ? detectedVerticalLines : fallbackVerticalLines(width);
  const gaps = canonicalVerticalLines
    .slice(1)
    .map((line, index) => line - canonicalVerticalLines[index])
    .filter((gap) => gap >= width * 0.05 && gap <= width * 0.14);

  return {
    rowBands: usableRowBands,
    canonicalVerticalLines,
    basePeriodWidth: median(gaps) ?? width * 0.1,
  };
}

function snapToCanonicalLine(center: number, canonicalLines: number[], tolerance: number): number | null {
  let closest: number | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const line of canonicalLines) {
    const distance = Math.abs(line - center);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = line;
    }
  }

  return closestDistance <= tolerance ? closest : null;
}

function verticalLinesForRow(
  imageData: ImageData,
  width: number,
  band: ScheduleRowBand,
  canonicalLines: number[],
): number[] {
  const yStart = Math.max(0, Math.round(band.top + 2));
  const yEnd = Math.min(imageData.height, Math.round(band.bottom - 2));
  const detected = columnLineCentersFromImage(imageData, width, yStart, yEnd, 130, 0.4);
  const tolerance = Math.round(width * 0.025);
  const snapped = detected
    .map((center) => snapToCanonicalLine(center, canonicalLines, tolerance))
    .filter((center): center is number => center !== null);
  const lines = Array.from(new Set([canonicalLines[0], canonicalLines[1], ...snapped, canonicalLines[canonicalLines.length - 1]])).sort(
    (a, b) => a - b,
  );

  return lines.length >= 4 ? lines : canonicalLines;
}

function isOcrWord(value: unknown): value is OcrWord {
  const candidate = value as Partial<OcrWord> | null;
  const bbox = candidate?.bbox;
  return (
    Boolean(candidate) &&
    typeof candidate?.text === 'string' &&
    typeof candidate?.confidence === 'number' &&
    Boolean(bbox) &&
    typeof bbox?.x0 === 'number' &&
    typeof bbox?.y0 === 'number' &&
    typeof bbox?.x1 === 'number' &&
    typeof bbox?.y1 === 'number'
  );
}

function flattenOcrWords(data: OcrResultData): OcrWord[] {
  const words: OcrWord[] = [];
  const blocks = Array.isArray(data.blocks) ? data.blocks : [];

  for (const block of blocks as Array<{ paragraphs?: Array<{ lines?: Array<{ words?: unknown[] }> }> }>) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          if (isOcrWord(word) && word.text.trim()) words.push(word);
        }
      }
    }
  }

  return words;
}

function wordCenter(word: OcrWord): { x: number; y: number } {
  return {
    x: (word.bbox.x0 + word.bbox.x1) / 2,
    y: (word.bbox.y0 + word.bbox.y1) / 2,
  };
}

function ocrCellText(words: OcrWord[], band: ScheduleRowBand): string {
  const lineTolerance = Math.max(10, Math.min(18, (band.bottom - band.top) * 0.11));
  const lines: Array<{ y: number; words: OcrWord[] }> = [];

  for (const word of words) {
    if (word.confidence < 15) continue;
    const { y } = wordCenter(word);
    let line = lines.find((candidate) => Math.abs(candidate.y - y) <= lineTolerance);
    if (!line) {
      line = { y, words: [] };
      lines.push(line);
    }
    line.words.push(word);
    line.y = line.words.reduce((sum, item) => sum + wordCenter(item).y, 0) / line.words.length;
  }

  return lines
    .sort((a, b) => a.y - b.y)
    .map((line) =>
      line.words
        .sort((a, b) => a.bbox.x0 - b.bbox.x0)
        .map((word) => word.text)
        .join(''),
    )
    .join(' ')
    .replace(/[|"'`“”‘’=;]+/g, ' ')
    .trim();
}

function addOcrGridEntries(
  aggregates: Map<string, TimetableAggregate>,
  imageData: ImageData,
  width: number,
  grid: ScheduleGrid,
  words: OcrWord[],
  classroomName: string,
) {
  for (const band of grid.rowBands) {
    const verticalLines = verticalLinesForRow(imageData, width, band, grid.canonicalVerticalLines);
    const rowEntryKeys = new Set<string>();
    const rowCodes = new Set<string>();

    const wordsInBox = (left: number, right: number) =>
      words.filter((word) => {
        const center = wordCenter(word);
        return center.x >= left && center.x < right && center.y >= band.top && center.y < band.bottom;
      });

    const addEntriesFromCell = (
      left: number,
      right: number,
      cellText: string,
      options?: { allowExistingCode?: boolean; maxTeachers?: number; maxSubjectNameLength?: number },
    ) => {
      const entries = extractTimetableEntriesFromText(cellText);
      const periods = Math.max(1, Math.min(4, Math.round((right - left) / grid.basePeriodWidth)));

      for (const entry of entries) {
        if (options?.allowExistingCode === false && rowCodes.has(entry.code)) continue;
        if (options?.maxTeachers !== undefined && entry.teachers.length > options.maxTeachers) continue;
        if (options?.maxSubjectNameLength !== undefined && entry.subjectName.length > options.maxSubjectNameLength) continue;

        const key = `${entry.code}|${entry.teachers.map(compactName).sort().join('|')}`;
        if (rowEntryKeys.has(key)) continue;
        rowEntryKeys.add(key);
        rowCodes.add(entry.code);
        addTimetableEntry(aggregates, classroomName, entry, periods);
      }
    };

    for (let columnIndex = 1; columnIndex < verticalLines.length - 1; columnIndex += 1) {
      const left = verticalLines[columnIndex];
      const right = verticalLines[columnIndex + 1];
      addEntriesFromCell(left, right, ocrCellText(wordsInBox(left, right), band));
    }

    for (let columnIndex = 1; columnIndex < grid.canonicalVerticalLines.length - 1; columnIndex += 1) {
      for (let span = 1; span <= 4 && columnIndex + span < grid.canonicalVerticalLines.length; span += 1) {
        const left = grid.canonicalVerticalLines[columnIndex];
        const right = grid.canonicalVerticalLines[columnIndex + span];
        addEntriesFromCell(left, right, ocrCellText(wordsInBox(left, right), band), {
          allowExistingCode: false,
          maxTeachers: 3,
          maxSubjectNameLength: 80,
        });
      }
    }
  }
}

async function renderPdfPage(page: PdfPageLike, scale = 2): Promise<RenderedPdfPage> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('ไม่สามารถสร้างพื้นที่อ่านภาพ PDF ได้');

  await page.render({ canvasContext: context, viewport }).promise;
  return {
    canvas,
    context,
    dataUrl: canvas.toDataURL('image/png'),
  };
}

function clearRenderedPage(page: RenderedPdfPage) {
  page.canvas.width = 0;
  page.canvas.height = 0;
}

async function parseImageOnlyPdfWithOcr(pdf: PdfDocumentLike): Promise<AssignmentImportRow[]> {
  if (typeof document === 'undefined') return [];

  const worker = await createThaiOcrWorker();
  const aggregates = new Map<string, TimetableAggregate>();
  let currentClassroomName = '';

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const pdfPage = await pdf.getPage(pageNumber);
      const renderedPage = await renderPdfPage(pdfPage);

      try {
        const grid = detectScheduleGrid(renderedPage.canvas, renderedPage.context);
        const imageData = renderedPage.context.getImageData(0, 0, renderedPage.canvas.width, renderedPage.canvas.height);
        const result = await worker.recognize(renderedPage.dataUrl, {}, { text: true, blocks: true });
        const maybeClassroomName = classroomNameFromHeading(result.data.text ?? '');
        if (maybeClassroomName) currentClassroomName = maybeClassroomName;
        if (!currentClassroomName) continue;

        addOcrGridEntries(
          aggregates,
          imageData,
          renderedPage.canvas.width,
          grid,
          flattenOcrWords(result.data),
          currentClassroomName,
        );
      } finally {
        clearRenderedPage(renderedPage);
      }
    }
  } finally {
    await worker.terminate();
  }

  return Array.from(aggregates.values()).flatMap(aggregateToImportRows);
}

export async function parseAssignmentExcel(file: File): Promise<AssignmentImportRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('ไม่พบชีตในไฟล์ Excel');

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = normalizeHeader(cell.value);
  });

  const cols = {
    teacher: findColumnIndex(headers, HEADER_ALIASES.teacherName),
    code: findColumnIndex(headers, HEADER_ALIASES.subjectCode),
    name: findColumnIndex(headers, HEADER_ALIASES.subjectName),
    classroom: findColumnIndex(headers, HEADER_ALIASES.classroomName),
    hpw: findColumnIndex(headers, HEADER_ALIASES.hoursPerWeek),
    hps: findColumnIndex(headers, HEADER_ALIASES.hoursPerSemester),
  };

  if (cols.teacher < 0 || cols.classroom < 0) {
    throw new Error('ต้องมีคอลัมน์: ครู และ ห้อง (อย่างน้อย)');
  }
  if (cols.code < 0 && cols.name < 0) {
    throw new Error('ต้องมีคอลัมน์รหัสวิชา หรือ ชื่อวิชา');
  }

  const rows: AssignmentImportRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const teacherName = String(row.getCell(cols.teacher + 1).value ?? '').trim();
    const subjectCode = cols.code >= 0 ? String(row.getCell(cols.code + 1).value ?? '').trim() : '';
    const subjectName = cols.name >= 0 ? String(row.getCell(cols.name + 1).value ?? '').trim() : '';
    const classroomName = String(row.getCell(cols.classroom + 1).value ?? '').trim();

    if (!teacherName && !subjectCode && !subjectName && !classroomName) return;
    if (!teacherName || !classroomName) return;
    if (!subjectCode && !subjectName) return;

    rows.push({
      teacherName,
      coTeacherName: '',
      subjectCode,
      subjectName,
      classroomName,
      hoursPerWeek: cols.hpw >= 0 ? parseNumber(row.getCell(cols.hpw + 1).value) : null,
      hoursPerSemester: cols.hps >= 0 ? parseNumber(row.getCell(cols.hps + 1).value) : null,
    });
  });

  return rows;
}

export async function parseAssignmentWordBuffer(buffer: ArrayBuffer): Promise<AssignmentImportRow[]> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) throw new Error('ไม่พบเนื้อหาเอกสาร Word');

  const xml = new DOMParser().parseFromString(documentXml, 'application/xml');
  if (xml.getElementsByTagName('parsererror').length > 0) {
    throw new Error('อ่านโครงสร้างไฟล์ Word ไม่สำเร็จ');
  }

  const body = elementsByLocalName(xml, 'body')[0];
  if (!body) throw new Error('ไม่พบเนื้อหาเอกสาร Word');

  const aggregates = new Map<string, TimetableAggregate>();
  let currentClassroomName = '';

  for (const child of Array.from(body.childNodes)) {
    if (child.nodeType !== XML_ELEMENT_NODE) continue;
    const element = child as Element;

    if (element.localName === 'p') {
      const maybeClassroomName = classroomNameFromHeading(docxText(element));
      if (maybeClassroomName) currentClassroomName = maybeClassroomName;
      continue;
    }

    if (element.localName !== 'tbl') continue;

    const tableClassroomName = classroomNameFromTable(element);
    if (tableClassroomName) currentClassroomName = tableClassroomName;
    if (!currentClassroomName) continue;

    for (const tableRow of parseDocxTable(element)) {
      const day = tableRow[0] ? normalizeTimetableText(tableRow[0].text) : '';
      if (!WEEKDAYS.has(day)) continue;

      for (const cell of tableRow.slice(1)) {
        const entry = parseTimetableCell(cell.text);
        if (!entry) continue;
        addTimetableEntry(aggregates, currentClassroomName, entry, cell.span);
      }
    }
  }

  const rows = Array.from(aggregates.values()).flatMap(aggregateToImportRows);

  if (rows.length === 0) {
    throw new Error('ไม่พบรายการวิชาจากตารางสอน Word');
  }

  return rows;
}

export async function parseAssignmentWord(file: File): Promise<AssignmentImportRow[]> {
  return parseAssignmentWordBuffer(await file.arrayBuffer());
}

export async function parseAssignmentPdfBuffer(buffer: ArrayBuffer): Promise<AssignmentImportRow[]> {
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  const fragments: PdfTextFragment[] = [];
  let ocrRows: AssignmentImportRow[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!isPdfTextItem(item)) continue;
        const fragment = pdfFragmentFromTextItem(item, pageNumber);
        if (fragment) fragments.push(fragment);
      }
    }

    if (fragments.length === 0) {
      ocrRows = await parseImageOnlyPdfWithOcr(pdf as unknown as PdfDocumentLike);
    }
  } finally {
    await loadingTask.destroy();
  }

  if (fragments.length === 0) {
    if (ocrRows.length > 0) return ocrRows;
    throw new Error('อ่านข้อความจาก PDF ไม่ได้ และ OCR ไม่พบรายการวิชา กรุณาตรวจสอบว่าไฟล์เป็นตารางสอนที่ภาพชัดและมีรหัสวิชา');
  }

  const rows = parsePdfTimetableFragments(fragments);
  if (rows.length === 0) {
    throw new Error('ไม่พบรายการวิชาจากตารางสอน PDF กรุณาตรวจสอบว่าไฟล์เป็นตารางสอนแบบข้อความและมีรหัสวิชา 5 หลัก');
  }

  return rows;
}

export async function parseAssignmentPdf(file: File): Promise<AssignmentImportRow[]> {
  return parseAssignmentPdfBuffer(await file.arrayBuffer());
}

function compactName(value: string): string {
  return normalizeName(value).replace(/\s+/g, '');
}

function teacherLookupAliases(teacher: Profile): string[] {
  const labels = [
    teacher.full_name,
    [teacher.title, teacher.full_name].filter(Boolean).join(' '),
    stripTeacherPrefix(teacher.full_name),
    stripTeacherPrefix([teacher.title, teacher.full_name].filter(Boolean).join(' ')),
  ];
  const normalized = Array.from(new Set(labels.map(normalizeName).filter(Boolean)));
  const compact = normalized.map(compactName).filter(Boolean);
  return Array.from(new Set([...normalized, ...compact]));
}

interface TeacherLookupCandidate {
  id: string;
  alias: string;
  compactAlias: string;
  firstName: string;
}

interface TeacherLookup {
  exact: Map<string, string>;
  compactExact: Map<string, string>;
  candidates: TeacherLookupCandidate[];
}

type TeacherMatchConfidence = 'exact' | 'compact' | 'fuzzy';

interface TeacherMatchResult {
  teacherId: string | null;
  confidence: TeacherMatchConfidence | null;
}

function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length];
}

function buildTeacherLookup(teachers: Profile[]): TeacherLookup {
  const exact = new Map<string, string>();
  const compactExact = new Map<string, string>();
  const compactOwner = new Map<string, string | 'ambiguous'>();
  const candidates: TeacherLookupCandidate[] = [];
  const seenCandidateKeys = new Set<string>();

  for (const teacher of teachers) {
    for (const alias of teacherLookupAliases(teacher)) {
      if (!exact.has(alias)) exact.set(alias, teacher.id);

      const compactAlias = compactName(alias);
      if (compactAlias) {
        const owner = compactOwner.get(compactAlias);
        if (!owner) compactOwner.set(compactAlias, teacher.id);
        else if (owner !== teacher.id) compactOwner.set(compactAlias, 'ambiguous');
      }

      const firstName = alias.split(' ')[0] ?? '';
      const candidateKey = `${teacher.id}|${compactAlias}`;
      if (firstName && compactAlias && !seenCandidateKeys.has(candidateKey)) {
        candidates.push({ id: teacher.id, alias, compactAlias, firstName });
        seenCandidateKeys.add(candidateKey);
      }
    }
    if (teacher.username) exact.set(normalizeName(teacher.username), teacher.id);
  }

  for (const [compactAlias, owner] of compactOwner.entries()) {
    if (owner !== 'ambiguous') compactExact.set(compactAlias, owner);
  }

  return { exact, compactExact, candidates };
}

function resolveTeacherMatch(value: string, lookup: TeacherLookup): TeacherMatchResult {
  const aliases = Array.from(
    new Set([normalizeName(value), normalizeName(stripTeacherPrefix(value))].filter(Boolean)),
  );
  for (const alias of aliases) {
    const exactMatch = lookup.exact.get(alias);
    if (exactMatch) return { teacherId: exactMatch, confidence: 'exact' };
  }

  const compactAliases = Array.from(
    new Set(aliases.map(compactName).filter(Boolean)),
  );
  for (const alias of compactAliases) {
    const compactMatch = lookup.compactExact.get(alias);
    if (compactMatch) return { teacherId: compactMatch, confidence: 'compact' };
  }

  const normalized = normalizeName(stripTeacherPrefix(value));
  const firstName = normalized.split(' ')[0] ?? '';
  const compact = compactName(normalized);
  if (!firstName || compact.length < 6) return { teacherId: null, confidence: null };

  const fuzzyMatches = lookup.candidates.filter((candidate) => {
    if (candidate.compactAlias === compact) return true;
    if (candidate.firstName !== firstName && !candidate.compactAlias.startsWith(firstName)) return false;
    if (Math.abs(candidate.compactAlias.length - compact.length) > 2) return false;
    return editDistance(candidate.compactAlias, compact) <= 2;
  });

  const uniqueIds = Array.from(new Set(fuzzyMatches.map((candidate) => candidate.id)));
  if (uniqueIds.length === 1) {
    return { teacherId: uniqueIds[0], confidence: 'fuzzy' };
  }

  return { teacherId: null, confidence: null };
}

function buildSubjectMaps(subjects: Subject[]) {
  const byCode = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const subject of subjects) {
    byCode.set(subject.subject_code.trim().toLowerCase(), subject.id);
    byName.set(normalizeName(subject.subject_name), subject.id);
  }
  return { byCode, byName };
}

function buildClassroomMap(classrooms: Classroom[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const classroom of classrooms) {
    map.set(normalizeName(classroom.name), classroom.id);
    map.set(normalizeName(`${classroom.class_level_code}/${classroom.room_number}`), classroom.id);
    map.set(normalizeName(`${classroom.class_level_code}${classroom.room_number}`), classroom.id);
  }
  return map;
}

export function resolveAssignmentRows(
  rows: AssignmentImportRow[],
  teachers: Profile[],
  subjects: Subject[],
  classrooms: Classroom[],
  options?: { teacherRoles?: UserRole[] },
): AssignmentReviewRow[] {
  const allowedRoles = options?.teacherRoles;
  const eligibleTeachers =
    allowedRoles && allowedRoles.length > 0
      ? teachers.filter((teacher) => allowedRoles.includes(teacher.role))
      : teachers;
  const teacherLookup = buildTeacherLookup(eligibleTeachers);
  const { byCode, byName } = buildSubjectMaps(subjects);
  const classroomMap = buildClassroomMap(classrooms);

  return rows.map((row, index) => {
    const issues: string[] = [];
    const warnings: string[] = [];
    const teacherMatch = resolveTeacherMatch(row.teacherName, teacherLookup);
    const teacherId = teacherMatch.teacherId;
    if (!teacherId) {
      issues.push(allowedRoles ? 'ไม่พบครูผู้สอน' : 'ไม่พบครู');
    } else if (teacherMatch.confidence === 'compact' || teacherMatch.confidence === 'fuzzy') {
      warnings.push('กรุณาตรวจสอบ');
    }

    let subjectId: string | null = null;
    if (row.subjectCode) {
      subjectId = byCode.get(row.subjectCode.toLowerCase()) ?? null;
    }
    if (!subjectId && row.subjectName) {
      subjectId = byName.get(normalizeName(row.subjectName)) ?? null;
    }
    if (!subjectId) issues.push('ไม่พบวิชา');

    const classroomId = classroomMap.get(normalizeName(row.classroomName)) ?? null;
    if (!classroomId) issues.push('ไม่พบห้อง');

    return {
      key: `row-${index}`,
      line: index + 2,
      teacherName: row.teacherName,
      teacherId,
      teacherMatchConfidence: teacherMatch.confidence,
      coTeacherName: row.coTeacherName ?? '',
      subjectCode: row.subjectCode,
      subjectName: row.subjectName,
      subjectId,
      classroomName: row.classroomName,
      classroomId,
      hoursPerWeek: row.hoursPerWeek,
      hoursPerSemester: row.hoursPerSemester,
      issues,
      warnings,
    };
  });
}

export function validateReviewRow(row: AssignmentReviewRow): AssignmentReviewRow {
  const issues: string[] = [];
  const warnings = [...(row.warnings ?? [])];

  if (!row.teacherId) issues.push('ไม่พบครู');
  if (!row.subjectId) issues.push('ไม่พบวิชา');
  if (!row.classroomId) issues.push('ไม่พบห้อง');

  if (row.teacherId && row.teacherMatchConfidence === 'manual') {
    return { ...row, issues, warnings: warnings.filter((warning) => warning !== 'กรุณาตรวจสอบ') };
  }

  if (
    row.teacherId &&
    (row.teacherMatchConfidence === 'compact' || row.teacherMatchConfidence === 'fuzzy') &&
    !warnings.includes('กรุณาตรวจสอบ')
  ) {
    warnings.push('กรุณาตรวจสอบ');
  }

  return { ...row, issues, warnings };
}
