'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getUser, setAuth, requireAuth } from '../../lib/auth';
import { changePassword } from '../../lib/api';
import { Alert } from '../../components/ui/Common';
import '../../components/ui/tn.css';
import '../login/auth.css';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (!requireAuth(router)) return;
    setAuthChecked(true);
  }, [router]);

  const strength = Math.min(4, [newPassword.length >= 8, /[A-Z]/.test(newPassword), /[0-9]/.test(newPassword), /[^A-Za-z0-9]/.test(newPassword)].filter(Boolean).length);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const minLen = (getUser() || {}).role === 'admin' ? 12 : 8;
    if (newPassword.length < minLen) { setError(`Password must be at least ${minLen} characters long.`); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const token = getToken();
      const data = await changePassword(token, '', newPassword);
      const user = getUser();
      if (user) {
        const updatedUser = { ...user, mustChangePassword: false };
        setAuth(data.token || token, updatedUser);
        const role = updatedUser.role;
        if (role === 'admin') router.push('/admin');
        else if (role === 'mentor') router.push('/mentor');
        else router.push('/dashboard');
      }
    } catch (err) {
      setError(err.message || 'Failed to change password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!authChecked) return null;

  return (
    <div className="au-center">
      <div className="au-card">
        <div className="au-icon"><i className="fas fa-key" /></div>
        <h1>Set a new password</h1>
        <p className="au-sub">For your security, choose your own password before continuing.</p>
        <form onSubmit={handleSubmit}>
          <Alert>{error}</Alert>
          <div className="tn-field">
            <label htmlFor="np">New password</label>
            <div className="tn-input-icon">
              <i className="fas fa-lock" />
              <input id="np" className="tn-input" type={show ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters (12 for admins)" autoComplete="new-password" required />
              <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}><i className={`fas ${show ? 'fa-eye-slash' : 'fa-eye'}`} style={{ position: 'static', transform: 'none' }} /></button>
            </div>
            <div className="tn-progress" style={{ marginTop: '0.5rem' }} aria-hidden="true"><div style={{ width: `${strength * 25}%`, background: strength < 2 ? '#dc2626' : strength < 4 ? '#f5b301' : '#16a34a' }} /></div>
            <div className="tn-muted" style={{ fontSize: '0.8rem', marginTop: '0.3rem' }}>Tip: mix upper case, numbers and symbols.</div>
          </div>
          <div className="tn-field">
            <label htmlFor="cp">Confirm password</label>
            <div className="tn-input-icon">
              <i className="fas fa-lock" />
              <input id="cp" className="tn-input" type={show ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat your password" autoComplete="new-password" required />
            </div>
          </div>
          <button className="tn-btn tn-btn-lg" style={{ width: '100%' }} disabled={loading}>{loading ? 'Saving...' : 'Save and continue'}</button>
        </form>
      </div>
    </div>
  );
}
