export function isoDateToDisplay(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

export function displayToIsoDate(display: string): string | null {
  const match = display.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 2400 || year > 2800 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getFullYear() !== year || parsed.getMonth() + 1 !== month || parsed.getDate() !== day) return null;
  return iso;
}

export function isWithinEntryWindow(start: string | null | undefined, end: string | null | undefined): boolean {
  if (!start && !end) return true;
  const today = new Date().toISOString().slice(0, 10);
  const normalizedStart = normalizeThaiOrIsoDate(start);
  const normalizedEnd = normalizeThaiOrIsoDate(end);
  if (normalizedStart && today < normalizedStart) return false;
  if (normalizedEnd && today > normalizedEnd) return false;
  return true;
}

function normalizeThaiOrIsoDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || null;
  const [rawYear, month, day] = value.split('-');
  const year = Number(rawYear);
  if (!Number.isFinite(year)) return value;
  const normalizedYear = year >= 2400 ? year - 543 : year;
  return `${normalizedYear}-${month}-${day}`;
}
