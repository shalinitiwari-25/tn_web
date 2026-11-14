'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRoleGuard, handleAuthError } from '../../lib/useAuth';
import { getMenteeDashboard } from '../../lib/api';
import { formatDateTime } from '../../lib/video';
import Avatar from '../ui/Avatar';
import { Spinner, Alert, Empty } from '../ui/Common';
import '../ui/tn.css';

const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

export default function MenteeDashboard() {
  const router = useRouter();
  const { ready, token } = useRoleGuard('mentee');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ready) return;
    getMenteeDashboard(token)
      .then(setData)
      .catch((err) => {
        if (!handleAuthError(err, router)) setError(err.message);
      });
  }, [ready, token, router]);

  if (!ready || (!data && !error)) return <div className="tn-page"><Spinner /></div>;

  return (
    <div className="tn-page">
      <div className="tn-container">
        {error && <Alert>{error}</Alert>}
        {data && (
          <>
            <div className="tn-hero">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem' }}>
                <span style={{ borderRadius: '50%', boxShadow: '0 0 0 4px rgba(255,255,255,0.25)', display: 'inline-flex' }}><Avatar avatarKey={data.avatar} name={data.name} size={64} /></span>
                <div>
                  <h1>Welcome back, {data.name.split(' ')[0]}</h1>
                  <p>{data.enrollmentNumber} &middot; keep the streak going</p>
                </div>
              </div>
              <div className="tn-hero-actions">
                <Link href="/roadmap" className="tn-btn-ghost"><i className="fas fa-route" /> My roadmap</Link>
                <Link href="/profile" className="tn-btn-ghost"><i className="fas fa-id-badge" /> My AI Profile</Link>
                <Link href="/chat" className="tn-btn-ghost"><i className="fas fa-comments" /> Chat</Link>
                <Link href="/leaderboard" className="tn-btn-ghost"><i className="fas fa-ranking-star" /> Leaderboard</Link>
              </div>
            </div>

            <div className="tn-grid-stats">
              <div className="tn-stat"><span className="tn-stat-icon"><i className="fas fa-star" /></span><div><div className="tn-stat-label">Total points</div><div className="tn-stat-value">{data.totalPoints}</div></div></div>
              <div className="tn-stat"><span className="tn-stat-icon amber"><i className="fas fa-trophy" /></span><div><div className="tn-stat-label">Best rank</div><div className="tn-stat-value">{data.bestRank ? `#${data.bestRank}` : '-'}</div></div></div>
              <div className="tn-stat"><span className="tn-stat-icon coral"><i className="fas fa-fire" /></span><div><div className="tn-stat-label">Day streak</div><div className="tn-stat-value">{data.streak}</div></div></div>
              <div className="tn-stat"><span className="tn-stat-icon violet"><i className="fas fa-layer-group" /></span><div><div className="tn-stat-label">Cohorts</div><div className="tn-stat-value">{data.cohorts.length}</div></div></div>
            </div>

            {data.nextDeadline && (
              <Alert type="warn">
                <i className="fas fa-hourglass-half" style={{ marginTop: 3 }} /><span>Next quiz deadline: <strong>{data.nextDeadline.title}</strong> ({data.nextDeadline.cohort}) closes {formatDateTime(data.nextDeadline.deadline)}.</span>
              </Alert>
            )}

            <div className="tn-card">
              <h2>My cohorts</h2>
              {data.cohorts.length === 0 ? (
                <Empty icon="fa-layer-group">
                  You are not in a cohort yet.<br />
                  <Link href="/cohorts" style={{ color: '#296c9e', fontWeight: 600 }}>Browse cohorts</Link>, then ask the cohort&apos;s mentor to add you.
                </Empty>
              ) : (
                <div className="tn-grid">
                  {data.cohorts.map((c) => {
                    const done = c.quizzesCompleted + c.videosCompleted;
                    const total = c.totalQuizzes + c.totalVideos;
                    return (
                      <div key={c._id} className="tn-card lift" style={{ margin: 0, background: '#fbfdff' }}>
                        <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'center', marginBottom: '0.9rem' }}>
                          <div className="tn-ring" style={{ '--p': pct(done, total) }}><span>{pct(done, total)}%</span></div>
                          <div><h3 style={{ margin: 0 }}>{c.name}</h3><div className="tn-muted">{done} of {total} activities done</div></div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                          <span className="tn-chip"><i className="fas fa-trophy" /> Rank #{c.rank} of {c.of}</span>
                          <span className="tn-chip"><i className="fas fa-star" /> {c.points} pts</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <Link href={`/cohort/${c._id}`} className="tn-btn tn-btn-sm">Open cohort <i className="fas fa-arrow-right" /></Link>
                          <Link href={`/roadmap?cohort=${c._id}`} className="tn-btn-outline tn-btn-sm"><i className="fas fa-route" /> Roadmap</Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {data.pending.length > 0 && (
              <div className="tn-card">
                <h2>Up next</h2>
                {data.pending.map((p, i) => (
                  <div key={i} className="tn-video-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                      <span className="tn-video-icon"><i className={`fas ${p.type === 'quiz' ? 'fa-pen-to-square' : 'fa-circle-play'}`} /></span>
                      <div><strong>{p.type === 'quiz' ? 'Take' : 'Watch'} {p.title}</strong><div className="tn-muted">{p.cohort}{p.deadline ? ` · closes ${formatDateTime(p.deadline)}` : ''}</div></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
