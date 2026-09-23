import type { CurriculumIndicatorRecord } from '../data/curriculum/types';
import { canonicalizeCurriculumRecordSubject } from '../data/curriculum/subjectGroups';
import { supabase } from './supabase';

const STORAGE_KEY = 'ksp-curriculum-indicator-store-v1';
const LEGACY_HIDDEN_KEY = 'ksp-hidden-curriculum-indicator-ids';

interface CurriculumIndicatorStoreData {
  hiddenIds: string[];
  customRecords: CurriculumIndicatorRecord[];
  overrides: Record<string, CurriculumIndicatorRecord>;
}

let sharedStore: CurriculumIndicatorStoreData | null = null;

/** Load the school-wide edits before reading curriculum in admin or grade entry. */
export async function loadSharedCurriculumStore(): Promise<boolean> {
  const { data, error } = await supabase
    .from('curriculum_indicator_edits')
    .select('data')
    .maybeSingle();
  if (error) throw error;
  if (!data?.data) {
    sharedStore = { hiddenIds: [], customRecords: [], overrides: {} };
    return false;
  }
  const parsed = data.data as Partial<CurriculumIndicatorStoreData>;
  sharedStore = {
    hiddenIds: Array.isArray(parsed.hiddenIds) ? parsed.hiddenIds : [],
    customRecords: Array.isArray(parsed.customRecords)
      ? parsed.customRecords.map(canonicalizeCurriculumRecordSubject) : [],
    overrides: parsed.overrides && typeof parsed.overrides === 'object'
      ? Object.fromEntries(Object.entries(parsed.overrides).map(([id, row]) => [id, canonicalizeCurriculumRecordSubject(row)]))
      : {},
  };
  return true;
}

export async function persistSharedCurriculumStore(schoolId: string): Promise<void> {
  const { error } = await supabase.from('curriculum_indicator_edits').upsert({
    school_id: schoolId,
    data: readStore(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export function hasLocalCurriculumEdits(): boolean {
  const data = readLocalStore();
  return data.hiddenIds.length > 0 || data.customRecords.length > 0 || Object.keys(data.overrides).length > 0;
}

export function promoteLocalCurriculumEdits(): void {
  sharedStore = readLocalStore();
}

function readStore(): CurriculumIndicatorStoreData {
  if (sharedStore) return sharedStore;
  return readLocalStore();
}

function readLocalStore(): CurriculumIndicatorStoreData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const base: CurriculumIndicatorStoreData = raw
      ? (() => {
          const parsed = JSON.parse(raw) as Partial<CurriculumIndicatorStoreData>;
          return {
            hiddenIds: Array.isArray(parsed.hiddenIds)
              ? parsed.hiddenIds.filter((id): id is string => typeof id === 'string')
              : [],
            customRecords: Array.isArray(parsed.customRecords) ? parsed.customRecords : [],
            overrides: parsed.overrides && typeof parsed.overrides === 'object' ? parsed.overrides : {},
          };
        })()
      : { hiddenIds: [], customRecords: [], overrides: {} };

    const migrated = migrateLegacyHiddenIds(base);
    return {
      ...migrated,
      customRecords: migrated.customRecords.map(canonicalizeCurriculumRecordSubject),
      overrides: Object.fromEntries(
        Object.entries(migrated.overrides).map(([id, row]) => [
          id,
          canonicalizeCurriculumRecordSubject(row),
        ]),
      ),
    };
  } catch {
    return { hiddenIds: [], customRecords: [], overrides: {} };
  }
}

function migrateLegacyHiddenIds(store: CurriculumIndicatorStoreData): CurriculumIndicatorStoreData {
  try {
    const legacy = localStorage.getItem(LEGACY_HIDDEN_KEY);
    if (!legacy) return store;
    const parsed = JSON.parse(legacy) as unknown;
    if (!Array.isArray(parsed)) return store;
    const merged = new Set([
      ...store.hiddenIds,
      ...parsed.filter((id): id is string => typeof id === 'string'),
    ]);
    localStorage.removeItem(LEGACY_HIDDEN_KEY);
    return { ...store, hiddenIds: [...merged] };
  } catch {
    return store;
  }
}

function writeStore(data: CurriculumIndicatorStoreData): void {
  sharedStore = data;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function isCustomCurriculumIndicatorId(id: string): boolean {
  return id.startsWith('custom-');
}

export function getHiddenCurriculumIndicatorIds(): Set<string> {
  return new Set(readStore().hiddenIds);
}

export function applyCurriculumStoreToBase(
  baseRecords: CurriculumIndicatorRecord[],
): CurriculumIndicatorRecord[] {
  const store = readStore();
  const hidden = new Set(store.hiddenIds);
  return baseRecords
    .filter((row) => !hidden.has(row.id))
    .map((row) => canonicalizeCurriculumRecordSubject(store.overrides[row.id] ?? row));
}

export function getVisibleCustomCurriculumRecords(): CurriculumIndicatorRecord[] {
  const store = readStore();
  const hidden = new Set(store.hiddenIds);
  return store.customRecords.filter((row) => !hidden.has(row.id));
}

/** @deprecated Use applyCurriculumStoreToBase instead */
export function mergeCurriculumRecords(baseRecords: CurriculumIndicatorRecord[]): CurriculumIndicatorRecord[] {
  return [
    ...applyCurriculumStoreToBase(baseRecords),
    ...getVisibleCustomCurriculumRecords(),
  ];
}

export function hideCurriculumIndicatorIds(ids: string[]): void {
  if (ids.length === 0) return;
  const store = readStore();
  const hidden = new Set(store.hiddenIds);
  ids.forEach((id) => hidden.add(id));
  writeStore({ ...store, hiddenIds: [...hidden] });
}

export function deleteCurriculumIndicator(id: string): void {
  const store = readStore();
  const hidden = new Set(store.hiddenIds);
  hidden.add(id);

  if (isCustomCurriculumIndicatorId(id)) {
    writeStore({
      ...store,
      hiddenIds: [...hidden],
      customRecords: store.customRecords.filter((row) => row.id !== id),
    });
    return;
  }

  const { [id]: _removed, ...overrides } = store.overrides;
  writeStore({
    ...store,
    hiddenIds: [...hidden],
    overrides,
  });
}

export function saveCurriculumIndicator(record: CurriculumIndicatorRecord): void {
  const store = readStore();
  const normalizedRecord = canonicalizeCurriculumRecordSubject(record);

  if (isCustomCurriculumIndicatorId(normalizedRecord.id)) {
    const exists = store.customRecords.some((row) => row.id === normalizedRecord.id);
    const customRecords = exists
      ? store.customRecords.map((row) => (row.id === normalizedRecord.id ? normalizedRecord : row))
      : [...store.customRecords, normalizedRecord];
    writeStore({ ...store, customRecords });
    return;
  }

  writeStore({
    ...store,
    overrides: { ...store.overrides, [normalizedRecord.id]: normalizedRecord },
  });
}

export function createCurriculumIndicatorId(): string {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
