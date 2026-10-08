import { createContext, useContext } from 'react';

/** { user, profile, canAccess(pageKey), canEdit(pageKey) } of the signed-in user; provided by App */
export const AccessContext = createContext(null);

export const useAccess = () => useContext(AccessContext);

/** Admins see every page; others only their allowed pages. A null page key is open to everyone. */
export function buildCanAccess(profile) {
  return (pageKey) =>
    Boolean(profile?.is_active) && (pageKey === null || profile.is_admin || profile.allowed_pages.includes(pageKey));
}

/** Adding, changing and deleting a page's records; other allowed pages are view only */
export function buildCanEdit(profile) {
  const canAccess = buildCanAccess(profile);
  // Before schema.sql added editable_pages every allowed page was editable
  const editablePages = profile?.editable_pages ?? profile?.allowed_pages ?? [];
  return (pageKey) => canAccess(pageKey) && (profile.is_admin || editablePages.includes(pageKey));
}
