// Job Triage Storage: Manages local persistence for saved, archived, and deleted job IDs

const STORAGE_KEYS = {
  SAVED: 'iwantajob_saved_job_ids',
  ARCHIVED: 'iwantajob_archived_job_ids',
  DELETED: 'iwantajob_deleted_job_ids',
};

function readIds(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeIds(key: string, ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(ids)));
  } catch {
    // Ignore storage write errors (e.g. storage quota exceeded)
  }
}

export const triageStorage = {
  getSavedIds(): Set<string> {
    return readIds(STORAGE_KEYS.SAVED);
  },

  getArchivedIds(): Set<string> {
    return readIds(STORAGE_KEYS.ARCHIVED);
  },

  getDeletedIds(): Set<string> {
    return readIds(STORAGE_KEYS.DELETED);
  },

  toggleSave(jobId: string): boolean {
    const saved = readIds(STORAGE_KEYS.SAVED);
    const wasSaved = saved.has(jobId);
    if (wasSaved) {
      saved.delete(jobId);
    } else {
      saved.add(jobId);
      // Remove from archived if present
      const archived = readIds(STORAGE_KEYS.ARCHIVED);
      if (archived.has(jobId)) {
        archived.delete(jobId);
        writeIds(STORAGE_KEYS.ARCHIVED, archived);
      }
    }
    writeIds(STORAGE_KEYS.SAVED, saved);
    return !wasSaved;
  },

  archive(jobId: string): void {
    const archived = readIds(STORAGE_KEYS.ARCHIVED);
    archived.add(jobId);
    writeIds(STORAGE_KEYS.ARCHIVED, archived);

    // If it was saved, remove from saved
    const saved = readIds(STORAGE_KEYS.SAVED);
    if (saved.has(jobId)) {
      saved.delete(jobId);
      writeIds(STORAGE_KEYS.SAVED, saved);
    }
  },

  unarchive(jobId: string): void {
    const archived = readIds(STORAGE_KEYS.ARCHIVED);
    archived.delete(jobId);
    writeIds(STORAGE_KEYS.ARCHIVED, archived);
  },

  delete(jobId: string): void {
    const deleted = readIds(STORAGE_KEYS.DELETED);
    deleted.add(jobId);
    writeIds(STORAGE_KEYS.DELETED, deleted);

    // Also remove from saved and archived
    const saved = readIds(STORAGE_KEYS.SAVED);
    if (saved.has(jobId)) {
      saved.delete(jobId);
      writeIds(STORAGE_KEYS.SAVED, saved);
    }
    const archived = readIds(STORAGE_KEYS.ARCHIVED);
    if (archived.has(jobId)) {
      archived.delete(jobId);
      writeIds(STORAGE_KEYS.ARCHIVED, archived);
    }
  },

  restore(jobId: string): void {
    const deleted = readIds(STORAGE_KEYS.DELETED);
    deleted.delete(jobId);
    writeIds(STORAGE_KEYS.DELETED, deleted);

    const archived = readIds(STORAGE_KEYS.ARCHIVED);
    archived.delete(jobId);
    writeIds(STORAGE_KEYS.ARCHIVED, archived);
  },

  saveMany(jobIds: string[]): void {
    if (jobIds.length === 0) return;
    const saved = readIds(STORAGE_KEYS.SAVED);
    const archived = readIds(STORAGE_KEYS.ARCHIVED);
    for (const id of jobIds) {
      saved.add(id);
      archived.delete(id);
    }
    writeIds(STORAGE_KEYS.SAVED, saved);
    writeIds(STORAGE_KEYS.ARCHIVED, archived);
  },

  archiveMany(jobIds: string[]): void {
    if (jobIds.length === 0) return;
    const saved = readIds(STORAGE_KEYS.SAVED);
    const archived = readIds(STORAGE_KEYS.ARCHIVED);
    for (const id of jobIds) {
      archived.add(id);
      saved.delete(id);
    }
    writeIds(STORAGE_KEYS.ARCHIVED, archived);
    writeIds(STORAGE_KEYS.SAVED, saved);
  },

  unarchiveMany(jobIds: string[]): void {
    if (jobIds.length === 0) return;
    const archived = readIds(STORAGE_KEYS.ARCHIVED);
    for (const id of jobIds) {
      archived.delete(id);
    }
    writeIds(STORAGE_KEYS.ARCHIVED, archived);
  },

  deleteMany(jobIds: string[]): void {
    if (jobIds.length === 0) return;
    const deleted = readIds(STORAGE_KEYS.DELETED);
    const saved = readIds(STORAGE_KEYS.SAVED);
    const archived = readIds(STORAGE_KEYS.ARCHIVED);
    for (const id of jobIds) {
      deleted.add(id);
      saved.delete(id);
      archived.delete(id);
    }
    writeIds(STORAGE_KEYS.DELETED, deleted);
    writeIds(STORAGE_KEYS.SAVED, saved);
    writeIds(STORAGE_KEYS.ARCHIVED, archived);
  },
};
