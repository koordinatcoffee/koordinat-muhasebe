import { NavLink, Outlet } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const MENU = [
  { to: '/', label: 'Özet', icon: '◎', end: true },
  { to: '/kasa', label: 'Günlük Kasa', icon: '▣' },
  { to: '/defter', label: 'Gelir - Gider Defteri', icon: '≡' },
  { to: '/odemeler', label: 'Yapılan Ödemeler', icon: '↗' },
  { to: '/raporlar', label: 'Raporlar / Kâr-Zarar', icon: '▤' },
  { to: '/ayarlar', label: 'Ayarlar', icon: '⚙' },
];

export default function Layout({ user }) {
  return (
    <div className="app">
      <aside className="sidebar no-print">
        <div className="brand">
          <div className="brand-mark">K</div>
          <div>
            <div className="brand-name">Koordinat</div>
            <div className="brand-sub">Coffee Factory · Muhasebe</div>
          </div>
        </div>
        <nav>
          {MENU.map((m) => (
            <NavLink key={m.to} to={m.to} end={m.end} className="nav-link">
              <span className="nav-icon">{m.icon}</span>
              {m.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-email" title={user.email}>{user.email}</div>
          <button className="btn btn-ghost btn-sm" onClick={() => supabase.auth.signOut()}>
            Çıkış yap
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
