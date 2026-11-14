'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import logo from '../../assets/logo.png';
import { login, submitMentorRequest } from '../../lib/api';
import { setAuth } from '../../lib/auth';
import { Alert } from '../../components/ui/Common';
import '../../components/ui/tn.css';
import './auth.css';

const ROLES = [
  ['mentee', 'Mentee', 'fa-user-graduate'],
  ['mentor', 'Mentor', 'fa-chalkboard-user'],
];

export default function LoginPage() {
  const router = useRouter();

  // Cohort chosen on /cohorts (optional)
  const [joinCohort, setJoinCohort] = useState(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('cohort') && /^[a-f\d]{24}$/i.test(q.get('cohort'))) setJoinCohort({ id: q.get('cohort'), name: q.get('name') || 'your cohort' });
  }, []);

  const [role, setRole] = useState('mentee');
  const [emailOrEnrollment, setEmailOrEnrollment] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Mentor request modal
  const [showModal, setShowModal] = useState(false);
  const [mentorName, setMentorName] = useState('');
  const [mentorEmail, setMentorEmail] = useState('');
  const [mentorReason, setMentorReason] = useState('');
  const [mentorRequestLoading, setMentorRequestLoading] = useState(false);
  const [mentorRequestError, setMentorRequestError] = useState('');
  const [mentorRequestSuccess, setMentorRequestSuccess] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(emailOrEnrollment, password, role);
      setAuth(data.token, data.user);
      if (data.user.mustChangePassword) { router.push('/change-password'); return; }
      if (data.user.role === 'mentor') router.push('/mentor');
      else router.push(joinCohort ? `/cohort/${joinCohort.id}` : '/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleMentorRequest = async (e) => {
    e.preventDefault();
    setMentorRequestError('');
    setMentorRequestLoading(true);
    try {
      await submitMentorRequest({ name: mentorName, email: mentorEmail, reason: mentorReason });
      setMentorRequestSuccess(true);
      setMentorName(''); setMentorEmail(''); setMentorReason('');
    } catch (err) {
      setMentorRequestError(err.message || 'Failed to submit request. Please try again.');
    } finally {
      setMentorRequestLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setMentorRequestSuccess(false);
    setMentorRequestError('');
  };

  return (
    <div className="au">
      <aside className="au-side">
        <span className="tn-eyebrow" style={{ color: '#7ee6e0', marginBottom: '1rem' }}><i className="fas fa-wand-magic-sparkles" /> TechNeeds 2.0</span>
        <h2>Learn together.<br /><span>Grow faster.</span></h2>
        <p>One place for cohorts, quizzes, a fair leaderboard and an AI profile that shows you what to learn next.</p>
        <ul className="au-points">
          <li><i className="fas fa-layer-group" /> Join a cohort led by senior mentors</li>
          <li><i className="fas fa-ranking-star" /> Earn points on a transparent leaderboard</li>
          <li><i className="fas fa-wand-magic-sparkles" /> Get your AI Tech Identity</li>
        </ul>
      </aside>

      <main className="au-main">
        <div className="au-card">
          <div className="au-logo"><Image src={logo} alt="TechNeeds logo" width={46} height={46} /></div>
          <h1>Welcome back</h1>
          <p className="au-sub">Sign in to your account</p>

          {joinCohort && (
            <Alert type="info"><i className="fas fa-layer-group" /><span>Logging in to <strong>{joinCohort.name}</strong>. Mentees use the enrollment number and password their mentor gave them.</span></Alert>
          )}

          <div className="au-roles" role="tablist" aria-label="Sign in as">
            {ROLES.map(([key, label, icon]) => (
              <button key={key} type="button" role="tab" aria-selected={role === key} className={`au-role${role === key ? ' active' : ''}`} onClick={() => { setRole(key); setError(''); }}>
                <i className={`fas ${icon}`} /> {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleLogin}>
            <Alert>{error}</Alert>
            <div className="tn-field">
              <label htmlFor="identity">{role === 'mentee' ? 'Enrollment number or email' : 'Email'}</label>
              <div className="tn-input-icon">
                <i className={`fas ${role === 'mentee' ? 'fa-id-card' : 'fa-envelope'}`} />
                <input id="identity" className="tn-input" type={role === 'mentee' ? 'text' : 'email'} value={emailOrEnrollment} onChange={(e) => setEmailOrEnrollment(e.target.value)} placeholder={role === 'mentee' ? 'TN26-0001' : 'you@college.edu'} autoComplete="username" required />
              </div>
            </div>
            <div className="tn-field">
              <label htmlFor="password">Password</label>
              <div className="tn-input-icon">
                <i className="fas fa-lock" />
                <input id="password" className="tn-input" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" autoComplete="current-password" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}><i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} style={{ position: 'static', transform: 'none' }} /></button>
              </div>
            </div>
            <button className="tn-btn tn-btn-lg" style={{ width: '100%', marginTop: '0.4rem' }} disabled={loading}>
              {loading ? <><i className="fas fa-circle-notch fa-spin" /> Signing in...</> : <>Log in <i className="fas fa-arrow-right" /></>}
            </button>
          </form>

          <p className="au-foot">Want to become a mentor? <button type="button" onClick={() => setShowModal(true)}>Apply here &rarr;</button></p>
        </div>
      </main>

      {showModal && (
        <div className="tn-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="tn-modal" style={{ maxWidth: 480 }} role="dialog" aria-modal="true" aria-labelledby="mr-title">
            {mentorRequestSuccess ? (
              <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
                <div className="au-icon" style={{ background: 'linear-gradient(135deg,#16a34a,#0fa3a3)' }}><i className="fas fa-check" /></div>
                <h2 id="mr-title">Request sent</h2>
                <p className="tn-muted" style={{ margin: '0.5rem 0 1.4rem' }}>The admin will review it. Once approved you&apos;ll get your login details.</p>
                <button className="tn-btn" onClick={closeModal}>Done</button>
              </div>
            ) : (
              <form onSubmit={handleMentorRequest}>
                <h2 id="mr-title">Become a mentor</h2>
                <p className="tn-muted" style={{ marginBottom: '1.2rem' }}>Tell us a bit about yourself. The admin approves every request.</p>
                <Alert>{mentorRequestError}</Alert>
                <div className="tn-field"><label htmlFor="mn">Full name</label><input id="mn" className="tn-input" value={mentorName} onChange={(e) => setMentorName(e.target.value)} required /></div>
                <div className="tn-field"><label htmlFor="me">Email</label><input id="me" className="tn-input" type="email" value={mentorEmail} onChange={(e) => setMentorEmail(e.target.value)} required /></div>
                <div className="tn-field"><label htmlFor="mr">Why do you want to mentor?</label><textarea id="mr" className="tn-textarea" value={mentorReason} onChange={(e) => setMentorReason(e.target.value)} required /></div>
                <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
                  <button type="button" className="tn-btn-outline" onClick={closeModal}>Cancel</button>
                  <button className="tn-btn" disabled={mentorRequestLoading}>{mentorRequestLoading ? 'Sending...' : 'Submit request'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
