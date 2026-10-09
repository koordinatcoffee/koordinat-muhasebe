import { useEffect, useState } from 'react';

const STORAGE_KEY = 'koordinat.selectedBranchId';

function readStoredBranchId() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * The branch being worked on, remembered on this device between visits.
 * Falls back to the first branch when nothing (or a deleted branch) was remembered.
 */
export function useSelectedBranch(branches) {
  const [storedId, setStoredId] = useState(readStoredBranchId);
  const branchId = branches?.some((branch) => branch.id === storedId) ? storedId : branches?.[0]?.id || '';

  useEffect(() => {
    if (!branchId) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, branchId);
    } catch {
      // Storage may be unavailable (private mode); the choice then lasts for this visit only
    }
  }, [branchId]);

  return [branchId, setStoredId];
}
