'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import logo from '../../assets/logo.png';
import { adminLogin, adminVerify2fa } from '../../lib/api';
import { setAuth } from '../../lib/auth';
import { Alert } from '../ui/Common';
import '../ui/tn.css';
import '../../app/login/auth.css';

/** Hidden admin entry: password, then a 6-digit authenticator code (or a one-time recovery code). Not linked anywhere. */
export default function AdminAccess() {
  const router = useRouter();
  const [step, setStep] = useState('password'); // password | code
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [challenge, setChallenge] = useState('');
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const finish = (data) => {
    setAuth(data.token, data.user);
    router.push(data.user.mustChangePassword ? '/change-password' : '/admin');
  };

  const submitPassword = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const data = await adminLogin(email, password);
      if (data.step === 'otp') { setChallenge(data.challenge); setStep('code'); setPassword(''); }
      else finish(data); // 2FA switched off (demo mode)
    } catch (err) { setError(err.message || 'Sign-in failed.'); }
    finally { setLoading(false); }
  };

  const submitCode = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try { finish(await adminVerify2fa(challenge, code)); }
    catch (err) {
      setError(err.message || 'Verification failed.');
      if (/expired|start again/i.test(err.message || '')) { setStep('password'); setChallenge(''); }
    } finally { setLoading(false); }
  };

  return (
    <div className="au-center">
      <div className="au-card">
        <div className="au-logo"><Image src={logo} alt="TechNeeds logo" width={46} height={46} /></div>
        <h1>Admin access</h1>
        <p className="au-sub">{step === 'password' ? 'Authorised staff only.' : useRecovery ? 'Enter one of your recovery codes.' : 'Enter the 6-digit code from your authenticator app.'}</p>

        {step === 'password' ? (
          <form onSubmit={submitPassword}>
            <Alert>{error}</Alert>
            <div className="tn-field">
              <label htmlFor="ae">Email</label>
              <div className="tn-input-icon"><i className="fas fa-envelope" /><input id="ae" className="tn-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></div>
            </div>
            <div className="tn-field">
              <label htmlFor="ap">Password</label>
              <div className="tn-input-icon">
                <i className="fas fa-lock" />
                <input id="ap" className="tn-input" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}><i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} style={{ position: 'static', transform: 'none' }} /></button>
              </div>
            </div>
            <button className="tn-btn tn-btn-lg" style={{ width: '100%' }} disabled={loading}>{loading ? 'Checking...' : <>Continue <i className="fas fa-arrow-right" /></>}</button>
          </form>
        ) : (
          <form onSubmit={submitCode}>
            <Alert>{error}</Alert>
            <div className="tn-field">
              <label htmlFor="ac">{useRecovery ? 'Recovery code' : 'Authenticator code'}</label>
              <div className="tn-input-icon">
                <i className="fas fa-shield-halved" />
                <input id="ac" className="tn-input" value={code} onChange={(e) => setCode(e.target.value)} inputMode={useRecovery ? 'text' : 'numeric'} autoComplete="one-time-code" maxLength={useRecovery ? 14 : 7} placeholder={useRecovery ? 'xxxxx-xxxxx' : '123456'} autoFocus required />
              </div>
            </div>
            <button className="tn-btn tn-btn-lg" style={{ width: '100%' }} disabled={loading}>{loading ? 'Verifying...' : <>Sign in <i className="fas fa-arrow-right" /></>}</button>
            <p className="au-foot">
              <button type="button" onClick={() => { setUseRecovery(!useRecovery); setCode(''); setError(''); }}>{useRecovery ? 'Use authenticator code' : 'Use a recovery code instead'}</button>
              {' · '}
              <button type="button" onClick={() => { setStep('password'); setChallenge(''); setCode(''); setError(''); }}>Back</button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
