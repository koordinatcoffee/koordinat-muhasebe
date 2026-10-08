import { BarChart3, CalendarClock, HandCoins, LayoutDashboard, Send, Settings, Wallet } from 'lucide-react';

export const ROUTES = {
  dashboard: '/',
  dailyRegister: '/daily-register',
  payments: '/payments',
  plannedPayments: '/planned-payments',
  employees: '/employees',
  reports: '/reports',
  settings: '/settings',
};

/**
 * Pages a non-admin user can be given access to (view, or view + edit). Keys must match
 * public.all_page_keys() in supabase/schema.sql, where they also decide who may write which table.
 * viewOnly: the page has nothing to edit, so it can only be viewed.
 */
export const PAGE_PERMISSIONS = [
  { key: 'dashboard', label: 'Özet', viewOnly: true },
  { key: 'daily-register', label: 'Günlük Kasa' },
  { key: 'payments', label: 'Yapılan Ödemeler' },
  { key: 'planned-payments', label: 'Yapılacak Ödemeler' },
  { key: 'employees', label: 'Personel Avansları' },
  { key: 'reports', label: 'Raporlar / Kâr-Zarar', viewOnly: true },
  { key: 'categories', label: 'Kategoriler (Ayarlar)' },
];

/** permission: page key required to see the item; null = every signed-in user (password change lives there) */
export const NAVIGATION_ITEMS = [
  { path: ROUTES.dashboard, label: 'Özet', icon: LayoutDashboard, end: true, permission: 'dashboard' },
  { path: ROUTES.dailyRegister, label: 'Günlük Kasa', icon: Wallet, permission: 'daily-register' },
  { path: ROUTES.payments, label: 'Yapılan Ödemeler', icon: Send, permission: 'payments' },
  { path: ROUTES.plannedPayments, label: 'Yapılacak Ödemeler', icon: CalendarClock, permission: 'planned-payments' },
  { path: ROUTES.employees, label: 'Personel Avansları', icon: HandCoins, permission: 'employees' },
  { path: ROUTES.reports, label: 'Raporlar / Kâr-Zarar', icon: BarChart3, permission: 'reports' },
  { path: ROUTES.settings, label: 'Ayarlar', icon: Settings, permission: null },
];
