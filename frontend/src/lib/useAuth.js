'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { requireAuth, getToken, getUser, clearAuth } from './auth';

/**
 * Client-side route guard. Redirects to /login (or the user's own home) when the
 * role does not match. The backend enforces the same rules on every request.
 */
export function useRoleGuard(...roles) {
  const router = useRouter();
  const [state, setState] = useState({ ready: false, token: null, user: null });

  useEffect(() => {
    if (!requireAuth(router, ...roles)) return;
    const user = getUser();
    if (user && user.mustChangePassword) {
      router.push('/change-password');
      return;
    }
    setState({ ready: true, token: getToken(), user });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return state;
}

/** If the session expired, clear it and go to login. Returns true when handled. */
export function handleAuthError(err, router) {
  if (err && err.status === 401) {
    // Admins get sent back to their own entry page (their session is only 1 hour)
    const wasAdmin = (getUser() || {}).role === 'admin';
    clearAuth();
    router.push(wasAdmin ? '/admin-access' : '/login');
    return true;
  }
  return false;
}
