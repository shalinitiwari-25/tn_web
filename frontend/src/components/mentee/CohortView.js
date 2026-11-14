'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useRoleGuard, handleAuthError } from '../../lib/useAuth';
import { getMenteeCohort, completeVideo, getCohortMentorsForFeedback, submitMentorFeedback } from '../../lib/api';
import { toEmbedUrl, formatDateTime } from '../../lib/video';
import Avatar from '../ui/Avatar';
import { Spinner, Alert, Empty, RankBadge, HowPoints } from '../ui/Common';
import QuizTaker from './QuizTaker';
import '../ui/tn.css';
import CommunityChat from '../ui/CommunityChat';

const TABS = [
  ['syllabus', 'Syllabus', 'fa-list-check'],
  ['videos', 'Videos', 'fa-circle-play'],
  ['quizzes', 'Quizzes', 'fa-pen-to-square'],
  ['leaderboard', 'Leaderboard', 'fa-ranking-star'],
  ['feedback', 'Mentor Feedback', 'fa-star'],
  ['community', 'Community Chat', 'fa-comments'],
];

export default function CohortView() {
  const { id } = useParams();
  const router = useRouter();
  const { ready, token } = useRoleGuard('mentee');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('syllabus');
  const [openVideo, setOpenVideo] = useState(null);
  const [quizId, setQuizId] = useState(null);
  const [toast, setToast] = useState('');
  const [feedbackMentors, setFeedbackMentors] = useState([]);
  const [ratings, setRatings] = useState({});
  const [comments, setComments] = useState({});
  const [feedbackError, setFeedbackError] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  const load = useCallback(() => {
    getMenteeCohort(token, id)
      .then(setData)
      .catch((err) => {
        if (!handleAuthError(err, router)) setError(err.message);
      });
  }, [token, id, router]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  // Roadmap links open a specific tab: /cohort/:id?tab=videos
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('tab');
    if (wanted && TABS.some(([k]) => k === wanted)) setTab(wanted);
  }, []);

  const markDone = async (video) => {
    try {
      const res = await completeVideo(token, video._id);
      setToast(res.message);
      load();
    } catch (e) {
      setToast(e.message);
    }
  };

  const loadFeedback = async () => {
    setFeedbackLoading(true);
    setFeedbackError('');

    try {
      const res = await getCohortMentorsForFeedback(token, id);
      setFeedbackMentors(res.mentors);
    } catch (err) {
      setFeedbackError(err.message);
    } finally {
      setFeedbackLoading(false);
    }
  };

  const handleFeedbackSubmit = async (mentorId) => {
    setFeedbackError('');

    try {
      await submitMentorFeedback(
        token,
        id,
        mentorId,
        ratings[mentorId],
        comments[mentorId]
      );

      setFeedbackMentors(prev =>
        prev.map(mentor =>
          mentor._id === mentorId
            ? { ...mentor, hasSubmitted: true }
            : mentor
        )
      );

      setToast('Feedback submitted successfully!');
    } catch (err) {
      setFeedbackError(err.message);
    }
  };

  useEffect(() => {
    if (ready && tab === 'feedback') {
      loadFeedback();
    }
  }, [ready, tab, token, id]);

  if (!ready || (!data && !error)) return <div className="tn-page"><Spinner /></div>;

  if (error) {
    return (
      <div className="tn-page"><div className="tn-container">
        <Alert>{error}</Alert>
        <Link href="/dashboard" className="tn-btn">Back to dashboard</Link>
      </div></div>
    );
  }

  const videos = data.resources.filter((r) => r.type === 'video');
  const quizzes = data.resources.filter((r) => r.type === 'quiz');

  return (
    <div className="tn-page">
      <div className="tn-container">
        <div className="tn-hero">
          <div>
            <Link href="/dashboard" className="tn-eyebrow" style={{ color: '#7ee6e0' }}><i className="fas fa-arrow-left" /> Dashboard</Link>
            <h1 style={{ marginTop: '0.4rem' }}>{data.cohort.name}</h1>
            <p>{data.cohort.description}{data.mentors.length > 0 && ` · Mentor${data.mentors.length > 1 ? 's' : ''}: ${data.mentors.join(', ')}`}</p>
          </div>
          {data.me && (
            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: '0.7rem 1.2rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1.1 }}>#{data.me.rank}</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>of {data.me.of}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: '0.7rem 1.2rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1.1 }}>{data.me.points}</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>points</div>
              </div>
            </div>
          )}
        </div>

        {toast && <Alert type="success">{toast} <button onClick={() => setToast('')} style={{ background: 'none', border: 'none', float: 'right', cursor: 'pointer' }} aria-label="Dismiss">×</button></Alert>}

        <div className="tn-tabs" role="tablist">
          {TABS.map(([key, label, icon]) => (
            <button key={key} role="tab" aria-selected={tab === key} className={`tn-tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
              <i className={`fas ${icon}`} /> {label}
            </button>
          ))}
        </div>

        {tab === 'syllabus' && (
          <div className="tn-card">
            <h2>Syllabus</h2>
            {data.cohort.syllabus ? <pre className="tn-pre">{data.cohort.syllabus}</pre> : <Empty icon="fa-list-check">Your mentor has not added a syllabus yet.</Empty>}
          </div>
        )}

        {tab === 'videos' && (
          <div className="tn-card">
            <h2>Lecture videos</h2>
            {videos.length === 0 ? <Empty icon="fa-circle-play">No videos yet. Check back soon.</Empty> : videos.map((v) => {
              const embed = toEmbedUrl(v.url);
              const isOpen = openVideo === v._id;
              return (
                <div key={v._id} className="tn-video-row" style={{ display: 'block' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                      <span className={`tn-video-icon${v.completed ? ' done' : ''}`}><i className={`fas ${v.completed ? 'fa-check' : 'fa-play'}`} /></span>
                      <div><strong>{v.title}</strong>{v.completed && <div><span className="tn-pill done">Completed</span></div>}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {embed ? (
                        <button className="tn-btn-outline tn-btn-sm" onClick={() => setOpenVideo(isOpen ? null : v._id)}>{isOpen ? 'Hide' : 'Watch'}</button>
                      ) : (
                        <a className="tn-btn-outline tn-btn-sm" href={v.url} target="_blank" rel="noopener noreferrer">Open <i className="fas fa-up-right-from-square" /></a>
                      )}
                      {!v.completed && <button className="tn-btn tn-btn-sm" onClick={() => markDone(v)}>Mark complete (+{v.points})</button>}
                    </div>
                  </div>
                  {isOpen && embed && (
                    <div style={{ marginTop: '0.75rem' }} className="tn-video-frame">
                      <iframe src={embed} title={v.title} allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'quizzes' && (
          <div className="tn-card">
            <h2>Quizzes</h2>
            {quizzes.length === 0 ? <Empty icon="fa-pen-to-square">No quizzes yet.</Empty> : (
              <div className="tn-table-wrap">
                <table className="tn-table">
                  <thead><tr><th>Quiz</th><th>Status</th><th>Closes</th><th>Result</th><th /></tr></thead>
                  <tbody>
                    {quizzes.map((q) => (
                      <tr key={q._id}>
                        <td><strong>{q.title}</strong><div className="tn-muted">{q.maxScore} marks</div></td>
                        <td><span className={`tn-pill ${q.status}`}>{q.status}</span></td>
                        <td>{formatDateTime(q.endTime)}</td>
                        <td>{q.result ? <>{q.result.score}/{q.result.max} <span className="tn-muted">(+{q.result.base + q.result.bonus} pts)</span></> : '-'}</td>
                        <td style={{ textAlign: 'right' }}>
                          {q.status === 'open' && <button className="tn-btn tn-btn-sm" onClick={() => setQuizId(q._id)}>Take quiz</button>}
                          {q.status === 'submitted' && <button className="tn-btn-outline tn-btn-sm" onClick={() => setQuizId(q._id)}>View</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'leaderboard' && (
          <div className="tn-card">
            <h2>Cohort leaderboard</h2>
            <HowPoints />
            <div className="tn-table-wrap">
              <table className="tn-table">
                <thead><tr><th>Rank</th><th>Name</th><th>Quizzes</th><th>Points</th></tr></thead>
                <tbody>
                  {data.leaderboard.map((r) => (
                    <tr key={r.rank} className={r.isMe ? 'me' : ''}>
                      <td><RankBadge rank={r.rank} /></td>
                      <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Avatar avatarKey={r.avatar} name={r.name} size={28} />{r.name}{r.isMe && ' (you)'}</span></td>
                      <td>{r.quizzesCompleted}</td>
                      <td><strong>{r.points}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {tab === 'feedback' && (
          <div className="tn-card">
            <h2>Mentor Feedback</h2>
            <p className="tn-muted" style={{ marginBottom: '1rem' }}>Rate your mentor and share your experience. Your feedback is anonymous: your mentor and the admin will not see your name.</p>

            {feedbackLoading && <Spinner />}

            {feedbackError && <Alert>{feedbackError}</Alert>}

            {!feedbackLoading && feedbackMentors.length === 0 && (
              <Empty icon="fa-star">No mentors assigned to this cohort yet.</Empty>
            )}

            {feedbackMentors.map((mentor) => (
              <div key={mentor._id} style={{ padding: '1.2rem 0', borderBottom: '1px solid #eef2f7' }}>
                <h3 style={{ marginBottom: '0.5rem' }}><i className="fas fa-chalkboard-user" style={{ color: 'var(--tn-blue)', marginRight: 8 }} />{mentor.name}</h3>

                {mentor.hasSubmitted ? (
                  <p className="tn-muted">You have already submitted feedback.</p>
                ) : (
                  <>
                    <p className="tn-muted">How would you rate this mentor?</p>

                    <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0' }}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRatings(prev => ({
                            ...prev,
                            [mentor._id]: star
                          }))}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '2rem',
                            color: star <= (ratings[mentor._id] || 0) ? '#f5b50a' : '#ccc'
                          }}
                        >
                          ★
                        </button>
                      ))}
                    </div>

                    <textarea
                      className="tn-textarea"
                      aria-label={`Feedback for ${mentor.name}`}
                      placeholder="Write your feedback..."
                      value={comments[mentor._id] || ''}
                      onChange={(e) => setComments(prev => ({
                        ...prev,
                        [mentor._id]: e.target.value
                      }))}
                      rows={3}
                      style={{ minHeight: 90 }}
                    />

                    <button
                      className="tn-btn"
                      style={{ marginTop: '0.75rem' }}
                      disabled={!ratings[mentor._id] || !comments[mentor._id]?.trim()}
                      onClick={() => handleFeedbackSubmit(mentor._id)}
                    >
                      Submit Feedback
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'community' && (
          <CommunityChat token={token} cohortId={id} />
        )}
      </div>

      {quizId && <QuizTaker token={token} resourceId={quizId} onClose={() => setQuizId(null)} onSubmitted={load} />}
    </div>
  );
}
