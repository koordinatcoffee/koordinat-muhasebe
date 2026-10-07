import { BarChart3, BookOpen, LayoutDashboard, Send, Settings, Wallet } from 'lucide-react';

export const ROUTES = {
  dashboard: '/',
  dailyRegister: '/daily-register',
  ledger: '/ledger',
  payments: '/payments',
  reports: '/reports',
  settings: '/settings',
};

export const NAVIGATION_ITEMS = [
  { path: ROUTES.dashboard, label: 'Özet', icon: LayoutDashboard, end: true },
  { path: ROUTES.dailyRegister, label: 'Günlük Kasa', icon: Wallet },
  { path: ROUTES.ledger, label: 'Gelir - Gider Defteri', icon: BookOpen },
  { path: ROUTES.payments, label: 'Yapılan Ödemeler', icon: Send },
  { path: ROUTES.reports, label: 'Raporlar / Kâr-Zarar', icon: BarChart3 },
  { path: ROUTES.settings, label: 'Ayarlar', icon: Settings },
];
