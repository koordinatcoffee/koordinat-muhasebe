import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LogOut, Menu, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { NAVIGATION_ITEMS } from '../../config/navigation';
import { useAccess } from '../../hooks/useAccess';
import { supabase } from '../../lib/supabaseClient';
import compactLogo from '../../assets/brand/logo-compact.png';

export default function AppLayout({ user }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const isOnline = useOnlineStatus();
  const { profile, canAccess } = useAccess();

  // Close the mobile drawer after navigating
  useEffect(() => setIsMenuOpen(false), [location.pathname]);

  // Lock page scroll and allow Escape while the drawer is open
  useEffect(() => {
    if (!isMenuOpen) return undefined;
    const closeOnEscape = (event) => event.key === 'Escape' && setIsMenuOpen(false);
    document.body.classList.add('is-scroll-locked');
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.classList.remove('is-scroll-locked');
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isMenuOpen]);

  return (
    <div className="app-shell">
      <header className="topbar no-print">
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={() => setIsMenuOpen(true)}
          aria-label="Menüyü aç"
          aria-expanded={isMenuOpen}
          aria-controls="app-sidebar"
        >
          <Menu size={22} />
        </button>
        <img src={compactLogo} alt="Koordinat" className="topbar__logo" />
        <span className="topbar__spacer" />
      </header>

      <div
        className={`sidebar-backdrop no-print ${isMenuOpen ? 'is-visible' : ''}`}
        onClick={() => setIsMenuOpen(false)}
        aria-hidden="true"
      />

      <aside id="app-sidebar" className={`sidebar no-print ${isMenuOpen ? 'is-open' : ''}`}>
        <div className="sidebar__header">
          <img src={compactLogo} alt="Koordinat Coffee Factory" className="sidebar__logo" />
        </div>
        <div className="sidebar__caption">Muhasebe · Gelir Gider Takibi</div>

        <nav className="sidebar__nav">
          {NAVIGATION_ITEMS.filter((item) => canAccess(item.permission)).map(({ path, label, icon: Icon, end }) => (
            <NavLink key={path} to={path} end={end} className="nav-link">
              <Icon size={18} strokeWidth={2} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__user" title={user.email}>
            {profile.full_name || user.email}
            <div className="text-small">{profile.is_admin ? 'Yönetici' : 'Kullanıcı'}</div>
          </div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => supabase.auth.signOut()}>
            <LogOut size={16} />
            Çıkış yap
          </button>
        </div>
      </aside>

      <main className="main-content">
        {!isOnline && (
          <div className="alert alert--warning offline-banner no-print" role="status">
            <WifiOff size={16} />
            İnternet bağlantısı yok. Kayıtlar Supabase'e ulaşamaz; bağlantı gelince sayfayı yenileyin.
          </div>
        )}
        <Suspense fallback={<p className="text-muted">Yükleniyor…</p>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
