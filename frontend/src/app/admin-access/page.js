import AdminAccess from '@/components/admin/AdminAccess';

// Not linked from anywhere and kept out of search engines. This is only to cut noise:
// the real protection is the password + authenticator code, lockout and short sessions.
export const metadata = { title: 'Sign in', robots: { index: false, follow: false } };

export default function AdminAccessPage() {
  return <AdminAccess />;
}
