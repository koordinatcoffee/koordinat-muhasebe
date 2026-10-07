import { createContext, useContext } from 'react';

/** { user, profile, canAccess(pageKey) } of the signed-in user; provided by App */
export const AccessContext = createContext(null);

export const useAccess = () => useContext(AccessContext);

/** Admins see every page; others only their allowed pages. A null page key is open to everyone. */
export function buildCanAccess(profile) {
  return (pageKey) =>
    Boolean(profile?.is_active) && (pageKey === null || profile.is_admin || profile.allowed_pages.includes(pageKey));
}
