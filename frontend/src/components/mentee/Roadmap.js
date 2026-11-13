'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRoleGuard, handleAuthError } from '../../lib/useAuth';
import { getMenteeDashboard, getMenteeCohort } from '../../lib/api';
import { buildRoadmap } from '../../lib/roadmap';
import { formatDateTime } from '../../lib/video';
import { Spinner, Alert, Empty } from '../ui/Common';
import '../ui/tn.css';
import './roadmap.css';

const STATE_LABEL = { done: 'Done', available: 'Ready', upcoming: 'Opens soon', missed: 'Missed' };
const STATE_PILL = { done: 'done', available: 'open', upcoming: 'upcoming', missed: 'closed' };

function nodeIcon(step) {
  if (step.state === 'done') return 'fa-check';
  return step.type === 'quiz' ? 'fa-pen-to-square' : 'fa-circle-play';
}

function StepMeta({ step }) {
  if (step.type === 'video') {
    return <span>{step.state === 'done' ? 'Watched' : `+${step.points} pts when you mark it watched`}</span>;
  }
  if (step.state === 'done' && step.result) {
    return <span>Scored {step.result.score}/{step.result.max} · {step.result.base + step.result.bonus} pts</span>;
  }
  if (step.state === 'upcoming') return <span>Opens {formatDateTime(step.startTime)}</span>;
  if (step.state === 'missed') return <span>Closed {formatDateTime(step.endTime)}. No points for this one.</span>;
  return <span>Closes {formatDateTime(step.endTime)} · {step.maxScore} marks</span>;
}

export default function Roadmap() {
  const router = useRouter();
  const { ready, token } = useRoleGuard('mentee');
  const [cohorts, setCohorts] = useState(null);
  const [cohortId, setCohortId] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const fail = (err) => { if (!handleAuthError(err, router)) setError(err.message); };

  useEffect(() => {
    if (!ready) return;
    getMenteeDashboard(token)
      .then((d) => {
        setCohorts(d.cohorts);
        const wanted = new URLSearchParams(window.location.search).get('cohort');
        const pick = d.cohorts.find((c) => c._id === wanted) || d.cohorts[0];
        if (pick) setCohortId(pick._id);
      })
      .catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token]);

  useEffect(() => {
    if (!ready || !cohortId) return;
    setData(null);
    getMenteeCohort(token, cohortId).then(setData).catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token, cohortId]);

  const road = useMemo(() => (data ? buildRoadmap(data.resources) : null), [data]);

  if (!ready || (!cohorts && !error)) return <div className="tn-page"><Spinner /></div>;

  const tabFor = (step) => (step.type === 'quiz' ? 'quizzes' : 'videos');

  return (
    <div className="tn-page">
      <div className="tn-container">
        <div className="tn-hero">
          <div>
            <h1>My roadmap</h1>
            <p>Your path through the cohort, updated as you finish videos and quizzes.</p>
          </div>
          {cohorts && cohorts.length > 1 && (
            <select className="tn-select" style={{ width: 'auto', minWidth: 220 }} value={cohortId} onChange={(e) => setCohortId(e.target.value)} aria-label="Select cohort">
              {cohorts.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          )}
        </div>

        {error && <Alert>{error}</Alert>}

        {cohorts && cohorts.length === 0 && (
          <div className="tn-card">
            <Empty icon="fa-route">
              You are not in a cohort yet.<br />
              <Link href="/cohorts" style={{ color: '#296c9e', fontWeight: 600 }}>Browse cohorts</Link>, then ask the cohort&apos;s mentor to add you.
            </Empty>
          </div>
        )}

        {cohortId && !data && !error && <Spinner />}

        {road && (
          <>
            <div className="tn-card">
              <div style={{ display: 'flex', gap: '1.2rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="tn-ring" style={{ '--p': road.percent, width: 84, height: 84 }}><span style={{ width: 68, height: 68, fontSize: '1rem' }}>{road.percent}%</span></div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <h2 style={{ marginBottom: '0.3rem' }}>{data.cohort.name}</h2>
                  <div className="tn-muted" style={{ marginBottom: '0.6rem' }}>
                    {road.done} of {road.total} steps done
                    {road.missed > 0 && ` · ${road.missed} missed`}
                    {road.nextMilestone && road.stepsToMilestone && ` · ${road.stepsToMilestone} more for "${road.nextMilestone.label}"`}
                  </div>
                  <div className="tn-progress" role="progressbar" aria-valuenow={road.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Cohort progress"><div style={{ width: `${road.percent}%` }} /></div>
                </div>
              </div>
              <div className="rm-badges" style={{ marginTop: '1.1rem' }}>
                {road.milestones.map((m) => (
                  <span key={m.label} className={`rm-badge${m.earned ? ' earned' : ''}`} title={m.earned ? 'Earned' : 'Not earned yet'}>
                    <i className={`fas ${m.earned ? m.icon : 'fa-lock'}`} /> {m.label}
                  </span>
                ))}
              </div>
            </div>

            {road.total === 0 ? (
              <div className="tn-card"><Empty icon="fa-route">Your mentor has not added anything yet. Your path appears here as soon as they do.</Empty></div>
            ) : (
              <>
                {road.next ? (
                  <div className="tn-card rm-next" style={{ borderColor: 'var(--tn-blue)' }}>
                    <div>
                      <div className="tn-muted">Your next step</div>
                      <h2 style={{ margin: '0.15rem 0' }}>{road.next.type === 'quiz' ? 'Take' : 'Watch'} {road.next.title}</h2>
                      <div className="rm-meta" style={{ marginBottom: 0 }}><StepMeta step={road.next} /></div>
                    </div>
                    <Link href={`/cohort/${cohortId}?tab=${tabFor(road.next)}`} className="tn-btn">{road.next.type === 'quiz' ? 'Take quiz' : 'Watch video'} <i className="fas fa-arrow-right" /></Link>
                  </div>
                ) : (
                  <Alert type="success"><i className="fas fa-circle-check" style={{ marginTop: 3 }} /><span>Nothing left to do right now. New steps appear here when your mentor adds them. Check your <Link href="/profile" style={{ fontWeight: 700 }}>AI Profile</Link> for what to learn next.</span></Alert>
                )}

                <ol className="rm-path" aria-label="Learning path">
                  {road.steps.map((s) => (
                    <li key={s._id} className={`rm-step ${s.state}${s.isNext ? ' next' : ''}`}>
                      <span className="rm-node" aria-hidden="true"><i className={`fas ${nodeIcon(s)}`} /></span>
                      <div className="rm-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'flex-start' }}>
                          <h3>{s.title}</h3>
                          <span className={`tn-pill ${STATE_PILL[s.state]}`}>{s.isNext ? 'Next' : STATE_LABEL[s.state]}</span>
                        </div>
                        <div className="rm-meta">
                          <span><i className={`fas ${s.type === 'quiz' ? 'fa-pen-to-square' : 'fa-circle-play'}`} /> {s.type === 'quiz' ? 'Quiz' : 'Video'}</span>
                          <StepMeta step={s} />
                        </div>
                        {(s.state === 'available' && !s.isNext) && (
                          <Link href={`/cohort/${cohortId}?tab=${tabFor(s)}`} className="tn-btn-outline tn-btn-sm">{s.type === 'quiz' ? 'Take quiz' : 'Watch video'}</Link>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
