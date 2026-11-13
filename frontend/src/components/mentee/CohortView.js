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

const TABS = [
  ['roadmap', 'Roadmap', 'fa-route'],
  ['syllabus', 'Syllabus', 'fa-list-check'],
  ['videos', 'Videos', 'fa-circle-play'],
  ['quizzes', 'Quizzes', 'fa-pen-to-square'],
  ['leaderboard', 'Leaderboard', 'fa-ranking-star'],
  ['feedback', 'Mentor Feedback', 'fa-star'],
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
  const roadmapItems = data.resources.map((resource) => ({
    ...resource,
    completed: resource.type === 'video'
      ? resource.completed
      : resource.status === 'submitted',
  }));

  const completedCount = roadmapItems.filter((item) => item.completed).length;
  const progress = roadmapItems.length
    ? Math.round((completedCount / roadmapItems.length) * 100)
    : 0;

  const currentIndex = roadmapItems.findIndex((item) => !item.completed);

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

        {tab === 'roadmap' && (
          <div className="tn-card">
            <h2>Your Learning Roadmap</h2>

            <div style={{ margin: '1rem 0 2rem' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 8
              }}>
                <strong>Overall progress</strong>
                <strong>{progress}% complete</strong>
              </div>

              <div style={{
                height: 10,
                background: '#e5e7eb',
                borderRadius: 10,
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #0891b2, #10b981)',
                  borderRadius: 10,
                  transition: 'width 0.3s'
                }} />
              </div>

              <p className="tn-muted">
                {completedCount} of {roadmapItems.length} milestones completed
              </p>
            </div>

            {roadmapItems.length === 0 ? (
              <Empty icon="fa-route">
                Your mentor has not added any roadmap milestones yet.
              </Empty>
            ) : (
              <div style={{
                position: 'relative',
                padding: '1rem 0'
              }}>

                {/* Central connecting line */}
                <div style={{
                  position: 'absolute',
                  left: '50%',
                  top: 20,
                  bottom: 20,
                  width: 4,
                  transform: 'translateX(-50%)',
                  background: 'linear-gradient(#10b981, #0891b2, #dce5ee)',
                  borderRadius: 5
                }} />

                {roadmapItems.map((item, index) => {
                  const isCurrent = index === currentIndex && !item.completed;

                  const milestoneCard = (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (item.type === 'video') {
                          setTab('videos');
                          setOpenVideo(item._id);
                        } else {
                          setTab('quizzes');
                          setQuizId(item._id);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.currentTarget.click();
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '18px',
                        minHeight: 105,
                        borderRadius: 16,
                        cursor: 'pointer',
                        background: item.completed
                          ? '#f0fdf4'
                          : isCurrent ? '#eff6ff' : '#ffffff',
                        border: item.completed
                          ? '1px solid #bbf7d0'
                          : isCurrent ? '2px solid #60a5fa' : '1px solid #e2e8f0',
                        boxShadow: isCurrent
                          ? '0 5px 18px rgba(37,99,235,0.12)'
                          : '0 3px 12px rgba(0,0,0,0.05)',
                        transition: 'transform 0.2s, box-shadow 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-5px)';
                        e.currentTarget.style.boxShadow =
                          '0 10px 22px rgba(0,0,0,0.10)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = isCurrent
                          ? '0 5px 18px rgba(37,99,235,0.12)'
                          : '0 3px 12px rgba(0,0,0,0.05)';
                      }}
                    >
                      <div style={{
                        width: 48,
                        height: 48,
                        minWidth: 48,
                        borderRadius: 14,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20,
                        background: item.completed
                          ? '#d1fae5'
                          : isCurrent ? '#dbeafe' : '#e2e8f0',
                        color: item.completed
                          ? '#059669'
                          : isCurrent ? '#2563eb' : '#64748b'
                      }}>
                        <i className={`fas ${
                          item.type === 'video' ? 'fa-play' : 'fa-pen'
                        }`} />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong>{item.title}</strong>

                        <div className="tn-muted" style={{ marginTop: 5 }}>
                          {item.type === 'video' ? 'Lecture video' : 'Quiz'}
                        </div>

                        <span style={{
                          display: 'inline-block',
                          marginTop: 9,
                          padding: '5px 10px',
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 600,
                          background: item.completed
                            ? '#d1fae5'
                            : isCurrent ? '#dbeafe' : '#e2e8f0',
                          color: item.completed
                            ? '#047857'
                            : isCurrent ? '#1d4ed8' : '#475569'
                        }}>
                          {item.completed
                            ? 'Completed'
                            : isCurrent ? 'In Progress' : 'Upcoming'}
                        </span>
                      </div>

                      <i className="fas fa-chevron-right" style={{
                        color: '#64748b'
                      }} />
                    </div>
                  );

                  return (
                    <div
                      key={item._id}
                      className="roadmap-step-row"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) 56px minmax(0, 1fr)',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 24,
                        position: 'relative'
                      }}
                    >
                      {/* Left and right alternating cards */}
                      {index % 2 === 0
                        ? milestoneCard
                        : <div />}

                      {/* Numbered circle in the centre */}
                      <div style={{
                        width: 44,
                        height: 44,
                        justifySelf: 'center',
                        zIndex: 1,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 18,
                        fontWeight: 700,
                        background: item.completed
                          ? '#10b981'
                          : isCurrent ? '#2563eb' : '#64748b',
                        color: '#ffffff',
                        border: '4px solid white',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.12)'
                      }}>
                        {item.completed
                          ? <i className="fas fa-check" />
                          : index + 1}
                      </div>

                      {index % 2 !== 0
                        ? milestoneCard
                        : <div />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'feedback' && (
          <div className="tn-card">
            <h2>Mentor Feedback</h2>
            <p>Rate your mentor and share your experience.</p>

            {feedbackLoading && <Spinner />}

            {feedbackError && <Alert>{feedbackError}</Alert>}

            {!feedbackLoading && feedbackMentors.length === 0 && (
              <Empty icon="fa-star">No mentors assigned to this cohort yet.</Empty>
            )}

            {feedbackMentors.map((mentor) => (
              <div key={mentor._id} className="tn-video-row">
                <h3>{mentor.name}</h3>

                {mentor.hasSubmitted ? (
                  <p className="tn-muted">You have already submitted feedback.</p>
                ) : (
                  <>
                    <p>How would you rate this mentor?</p>

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
                      placeholder="Write your feedback..."
                      value={comments[mentor._id] || ''}
                      onChange={(e) => setComments(prev => ({
                        ...prev,
                        [mentor._id]: e.target.value
                      }))}
                      rows={3}
                      style={{ width: '100%', padding: '0.75rem', borderRadius: 8 }}
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
      </div>

      {quizId && <QuizTaker token={token} resourceId={quizId} onClose={() => setQuizId(null)} onSubmitted={load} />}
    </div>
  );
}
