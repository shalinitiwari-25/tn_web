'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import './navbar.css';
import logo from '../../assets/logo.png';
import { getUser, clearAuth } from '../../lib/auth';
import Avatar from '../ui/Avatar';

const PUBLIC_LINKS = [
  ['/', 'Home'],
  ['/cohorts', 'Cohorts'],
  ['/leaderboard', 'Leaderboard'],
  ['/faq', 'FAQs'],
];
const ROLE_LINKS = {
  mentee: [['/dashboard', 'Dashboard'], ['/roadmap', 'Roadmap'], ['/profile', 'AI Profile']],
  mentor: [['/mentor', 'Mentor panel']],
  admin: [['/admin', 'Admin panel']],
};

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => { setUser(getUser()); setOpen(false); }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = [...PUBLIC_LINKS, ...(user ? ROLE_LINKS[user.role] || [] : [])];
  const isActive = (href) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/'));

  const logout = () => {
    clearAuth();
    setUser(null);
    setOpen(false);
    router.push('/');
  };

  return (
    <header className={`nb${scrolled ? ' scrolled' : ''}`}>
      <nav className="nb-inner" aria-label="Main navigation">
        <Link href="/" className="nb-brand" aria-label="TechNeeds home">
          <Image src={logo} alt="" width={40} height={40} className="nb-logo" priority />
          <span>Tech<b>Needs</b></span>
        </Link>

        <button className="nb-toggle" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>
          <i className={`fas ${open ? 'fa-xmark' : 'fa-bars'}`} />
        </button>

        <div className={`nb-menu${open ? ' open' : ''}`}>
          <ul className="nb-links">
            {links.map(([href, label]) => (
              <li key={href}>
                <Link href={href} className={`nb-link${isActive(href) ? ' active' : ''}`} aria-current={isActive(href) ? 'page' : undefined}>{label}</Link>
              </li>
            ))}
          </ul>

          <div className="nb-actions">
            {user ? (
              <>
                <div className="nb-user">
                  <Avatar avatarKey={user.avatar} name={user.name} size={34} />
                  <div className="nb-user-text">
                    <span className="nb-user-name">{user.name}</span>
                    <span className={`nb-role ${user.role}`}>{user.role}</span>
                  </div>
                </div>
                <button className="nb-logout" onClick={logout}><i className="fas fa-arrow-right-from-bracket" /> Logout</button>
              </>
            ) : (
              <>
                <Link href="/login" className="nb-login">Log in</Link>
                <Link href="/cohorts" className="nb-cta">Get started <i className="fas fa-arrow-right" /></Link>
              </>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
}
