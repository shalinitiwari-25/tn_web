'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRoleGuard, handleAuthError } from '../../lib/useAuth';
import { getMentorCohorts, getMentorOverview, addMenteesBulk, addVideo, createQuiz } from '../../lib/api';
import { formatDateTime } from '../../lib/video';
import { Spinner, Alert, Empty, RankBadge } from '../ui/Common';
import '../ui/tn.css';

const blankQuestion = () => ({ questionText: '', options: ['', '', '', ''], correctOptionIndex: 0, marks: 1 });

// default quiz deadline: 7 days from now, in the format datetime-local expects
const defaultDeadline = () => {
  const d = new Date(Date.now() + 7 * 86400000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export default function MentorPanel() {
  const router = useRouter();
  const { ready, token, user } = useRoleGuard('mentor');
  const [cohorts, setCohorts] = useState(null);
  const [cohortId, setCohortId] = useState('');
  const [overview, setOverview] = useState(null);
  const [tab, setTab] = useState('mentees');
  const [error, setError] = useState('');

  const fail = useCallback((err) => { if (!handleAuthError(err, router)) setError(err.message); }, [router]);

  useEffect(() => {
    if (!ready) return;
    getMentorCohorts(token)
      .then((c) => { setCohorts(c); if (c.length) setCohortId(c[0]._id); })
      .catch(fail);
  }, [ready, token, fail]);

  const loadOverview = useCallback(() => {
    if (!cohortId) return;
    getMentorOverview(token, cohortId).then(setOverview).catch(fail);
  }, [token, cohortId, fail]);

  useEffect(() => { setOverview(null); loadOverview(); }, [loadOverview]);

  if (!ready || (!cohorts && !error)) return <div className="tn-page"><Spinner /></div>;

  return (
    <div className="tn-page">
      <div className="tn-container">
        <div className="tn-hero">
          <div>
            <h1>Mentor panel</h1>
            <p>Hello {user?.name}. Manage your cohorts, mentees, videos and quizzes.</p>
          </div>
          <div className="tn-hero-actions">
            <Link href="/chat" className="tn-btn-ghost"><i className="fas fa-comments" /> Chat</Link>
          {cohorts && cohorts.length > 0 && (
            <select className="tn-select" style={{ width: 'auto', minWidth: 220 }} value={cohortId} onChange={(e) => setCohortId(e.target.value)} aria-label="Select cohort">
              {cohorts.map((c) => <option key={c._id} value={c._id}>{c.name} ({c.menteeCount})</option>)}
            </select>
          )}
          </div>
        </div>

        {error && <Alert>{error}</Alert>}

        {cohorts && cohorts.length === 0 && (
          <div className="tn-card"><Empty icon="fa-layer-group">You are not assigned to a cohort yet. Ask the admin to assign you to one.</Empty></div>
        )}

        {cohorts && cohorts.length > 0 && (
          <>
            <div className="tn-tabs" role="tablist">
              {[['mentees', 'Mentees', 'fa-user-graduate'], ['videos', 'Videos', 'fa-circle-play'], ['quizzes', 'Quizzes', 'fa-pen-to-square']].map(([k, l, i]) => (
                <button key={k} role="tab" aria-selected={tab === k} className={`tn-tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}><i className={`fas ${i}`} /> {l}</button>
              ))}
            </div>
            {!overview ? <Spinner /> : (
              <>
                {tab === 'mentees' && <MenteesTab token={token} cohortId={cohortId} overview={overview} reload={loadOverview} />}
                {tab === 'videos' && <VideosTab token={token} cohortId={cohortId} overview={overview} reload={loadOverview} />}
                {tab === 'quizzes' && <QuizzesTab token={token} cohortId={cohortId} overview={overview} reload={loadOverview} />}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ───────────── Mentees ───────────── */
function MenteesTab({ token, cohortId, overview, reload }) {
  const [lines, setLines] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(''); setResults(null);
    try {
      const res = await addMenteesBulk(token, cohortId, lines);
      setResults(res);
      if (res.some((r) => r.status === 'created' || r.status === 'added-existing')) { setLines(''); reload(); }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const created = (results || []).filter((r) => r.status === 'created');
  const csv = () => {
    const rows = [['Name', 'Email', 'Enrollment Number', 'Temporary Password'], ...created.map((r) => [r.name, r.email, r.enrollmentNumber, r.tempPassword])];
    const blob = new Blob([rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mentee-credentials-${overview.cohort.name.replace(/\W+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const copy = () => navigator.clipboard.writeText(created.map((r) => `${r.name}\t${r.enrollmentNumber}\t${r.tempPassword}`).join('\n'));

  return (
    <>
      <div className="tn-card">
        <h2>Add mentees</h2>
        <p className="tn-muted" style={{ marginBottom: '0.75rem' }}>One per line: <code>Name, college email</code>. The system creates an enrollment number and a password for each.</p>
        <form onSubmit={submit}>
          <textarea className="tn-textarea" placeholder={'Aarav Singh, aarav@college.edu\nDiya Patel, diya@college.edu'} value={lines} onChange={(e) => setLines(e.target.value)} aria-label="Mentees to add" />
          {error && <Alert>{error}</Alert>}
          <button className="tn-btn" disabled={busy || !lines.trim()} style={{ marginTop: '0.75rem' }}>{busy ? 'Adding...' : 'Add mentees'}</button>
        </form>

        {results && (
          <div style={{ marginTop: '1.25rem' }}>
            {created.length > 0 && <Alert type="warn"><strong>Share these now.</strong> Passwords are shown only once. Mentees must change them at first login.</Alert>}
            <div className="tn-table-wrap">
              <table className="tn-table">
                <thead><tr><th>Name</th><th>Email</th><th>Enrollment no.</th><th>Password</th><th>Result</th></tr></thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i}>
                      <td>{r.name}</td><td>{r.email}</td>
                      <td>{r.enrollmentNumber || '-'}</td>
                      <td>{r.tempPassword ? <code>{r.tempPassword}</code> : '-'}</td>
                      <td>
                        {r.status === 'created' && <span className="tn-pill done">Created</span>}
                        {r.status === 'added-existing' && <span className="tn-pill submitted">Added to cohort</span>}
                        {r.status === 'already-enrolled' && <span className="tn-pill upcoming">Already in cohort</span>}
                        {r.status === 'error' && <span className="tn-pill closed" title={r.error}>{r.error}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {created.length > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <button className="tn-btn-outline tn-btn-sm" onClick={copy}><i className="fas fa-copy" /> Copy</button>
                <button className="tn-btn-outline tn-btn-sm" onClick={csv}><i className="fas fa-download" /> Download CSV</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="tn-card">
        <h2>Mentees in {overview.cohort.name}</h2>
        {overview.mentees.length === 0 ? <Empty icon="fa-user-graduate">No mentees yet. Add some above.</Empty> : (
          <div className="tn-table-wrap">
            <table className="tn-table">
              <thead><tr><th>Rank</th><th>Name</th><th>Enrollment</th><th>Quizzes</th><th>Videos</th><th>Points</th><th /></tr></thead>
              <tbody>
                {overview.mentees.map((m) => (
                  <tr key={m._id}>
                    <td><RankBadge rank={m.rank} /></td>
                    <td><strong>{m.name}</strong><div className="tn-muted">{m.email}</div></td>
                    <td>{m.enrollmentNumber}</td>
                    <td>{m.quizzesCompleted}</td>
                    <td>{m.videosCompleted}</td>
                    <td><strong>{m.points}</strong></td>
                    <td style={{ textAlign: 'right' }}><Link href={`/mentor/mentee/${m._id}`} className="tn-btn-outline tn-btn-sm">AI Profile</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* ───────────── Videos ───────────── */
function VideosTab({ token, cohortId, overview, reload }) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const videos = overview.resources.filter((r) => r.type === 'video');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(''); setOk('');
    try {
      await addVideo(token, { cohortId, title, url });
      setTitle(''); setUrl(''); setOk('Video added. Mentees can see it now.');
      reload();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="tn-card">
        <h2>Upload a lecture video</h2>
        <form onSubmit={submit}>
          <div className="tn-row">
            <div className="tn-field"><label htmlFor="vt">Title</label><input id="vt" className="tn-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Intro to React hooks" required /></div>
            <div className="tn-field"><label htmlFor="vu">Video link</label><input id="vu" className="tn-input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." required /></div>
          </div>
          <p className="tn-muted" style={{ marginBottom: '0.75rem' }}>Paste a YouTube or Google Drive link. YouTube videos play inside the cohort page.</p>
          {error && <Alert>{error}</Alert>}{ok && <Alert type="success">{ok}</Alert>}
          <button className="tn-btn" disabled={busy}>{busy ? 'Adding...' : 'Add video'}</button>
        </form>
      </div>
      <div className="tn-card">
        <h2>Videos ({videos.length})</h2>
        {videos.length === 0 ? <Empty icon="fa-circle-play">No videos yet.</Empty> : (
          <ul className="tn-list">{videos.map((v) => <li key={v._id}><strong>{v.title}</strong> <a href={v.url} target="_blank" rel="noopener noreferrer" className="tn-muted">open link</a></li>)}</ul>
        )}
      </div>
    </>
  );
}

/* ───────────── Quizzes ───────────── */
function QuizzesTab({ token, cohortId, overview, reload }) {
  const [title, setTitle] = useState('');
  const [endTime, setEndTime] = useState(defaultDeadline());
  const [questions, setQuestions] = useState([blankQuestion()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const quizzes = overview.resources.filter((r) => r.type === 'quiz');
  const totalMarks = questions.reduce((s, q) => s + (Number(q.marks) || 0), 0);

  const patch = (i, fn) => setQuestions((qs) => qs.map((q, idx) => (idx === i ? fn(q) : q)));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(''); setOk('');
    try {
      await createQuiz(token, { cohortId, title, endTime: new Date(endTime).toISOString(), questions });
      setTitle(''); setQuestions([blankQuestion()]); setEndTime(defaultDeadline());
      setOk('Quiz created. It is open for mentees now.');
      reload();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="tn-card">
        <h2>Create a quiz</h2>
        <form onSubmit={submit}>
          <div className="tn-row">
            <div className="tn-field"><label htmlFor="qt">Quiz title</label><input id="qt" className="tn-input" value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
            <div className="tn-field"><label htmlFor="qd">Deadline</label><input id="qd" className="tn-input" type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} required /></div>
          </div>

          {questions.map((q, i) => (
            <div key={i} style={{ background: '#f4f8fc', borderRadius: 10, padding: '1rem', marginBottom: '0.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong>Question {i + 1}</strong>
                {questions.length > 1 && <button type="button" className="tn-btn-danger" onClick={() => setQuestions(questions.filter((_, k) => k !== i))}>Remove</button>}
              </div>
              <div className="tn-field"><input className="tn-input" placeholder="Question text" aria-label={`Question ${i + 1} text`} value={q.questionText} onChange={(e) => patch(i, (x) => ({ ...x, questionText: e.target.value }))} required /></div>
              {q.options.map((opt, j) => (
                <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <input type="radio" name={`correct-${i}`} checked={q.correctOptionIndex === j} onChange={() => patch(i, (x) => ({ ...x, correctOptionIndex: j }))} aria-label={`Mark option ${j + 1} correct`} />
                  <input className="tn-input" placeholder={`Option ${j + 1}`} aria-label={`Question ${i + 1} option ${j + 1}`} value={opt} onChange={(e) => patch(i, (x) => ({ ...x, options: x.options.map((o, k) => (k === j ? e.target.value : o)) }))} required />
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <label htmlFor={`m${i}`} className="tn-muted">Marks</label>
                <input id={`m${i}`} className="tn-input" type="number" min="1" max="100" style={{ width: 80 }} value={q.marks} onChange={(e) => patch(i, (x) => ({ ...x, marks: e.target.value }))} />
                <span className="tn-muted">Select the radio next to the correct option.</span>
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="tn-btn-outline" onClick={() => setQuestions([...questions, blankQuestion()])}><i className="fas fa-plus" /> Add question</button>
            <span className="tn-muted">{questions.length} question{questions.length > 1 ? 's' : ''} &middot; {totalMarks} marks total</span>
          </div>
          {error && <div style={{ marginTop: '0.9rem' }}><Alert>{error}</Alert></div>}{ok && <div style={{ marginTop: '0.9rem' }}><Alert type="success">{ok}</Alert></div>}
          <button className="tn-btn" disabled={busy} style={{ marginTop: '0.9rem' }}>{busy ? 'Creating...' : 'Create quiz'}</button>
        </form>
      </div>

      <div className="tn-card">
        <h2>Quizzes ({quizzes.length})</h2>
        {quizzes.length === 0 ? <Empty icon="fa-pen-to-square">No quizzes yet.</Empty> : (
          <div className="tn-table-wrap">
            <table className="tn-table">
              <thead><tr><th>Quiz</th><th>Marks</th><th>Closes</th><th>Submissions</th></tr></thead>
              <tbody>{quizzes.map((q) => <tr key={q._id}><td><strong>{q.title}</strong></td><td>{q.maxScore}</td><td>{formatDateTime(q.endTime)}</td><td>{q.submissions}/{overview.mentees.length}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
