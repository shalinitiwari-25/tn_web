'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useRoleGuard, handleAuthError } from '../../lib/useAuth';
import { clearAuth } from '../../lib/auth';
import {
  getAdminStats, getMentorRequests, approveMentorRequest, rejectMentorRequest,
  getAdminCohorts, createCohort, updateCohort, deleteCohort, assignMentor, removeMentor,
  getCohortAnalytics, getAdminMentors, getAdminMentorFeedback, adminLogoutAll, getAuditLog,
} from '../../lib/api';
import { Spinner, Alert, Empty } from '../../components/ui/Common';
import '../../components/ui/tn.css';

const toList = (d, key) => (Array.isArray(d) ? d : d[key] || []);
const idOf = (o) => o._id || o.id;
const when = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');

export default function AdminPage() {
  const router = useRouter();
  const { ready, token, user } = useRoleGuard('admin');
  const [tab, setTab] = useState('dashboard');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [stats, setStats] = useState(null);
  const [requests, setRequests] = useState(null);
  const [cohorts, setCohorts] = useState(null);
  const [mentors, setMentors] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [audit, setAudit] = useState(null); // { entries, total, page, limit }

  const [approved, setApproved] = useState(null); // { name, email, password }
  const [busyId, setBusyId] = useState(null);
  const [cohortModal, setCohortModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', syllabus: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [analytics, setAnalytics] = useState(null); // { cohort, data }
  const [assignFor, setAssignFor] = useState(null);
  const [mentorPick, setMentorPick] = useState('');

  const guard = async (fn) => { setError(''); try { return await fn(); } catch (e) { if (handleAuthError(e, router)) return; setError(e.message || 'Something went wrong'); } };

  const loadStats = useCallback(() => guard(async () => setStats(await getAdminStats(token))), [token]);
  const loadRequests = useCallback(() => guard(async () => setRequests(toList(await getMentorRequests(token), 'requests'))), [token]);
  const loadCohorts = useCallback(() => guard(async () => setCohorts(toList(await getAdminCohorts(token), 'cohorts'))), [token]);
  const loadMentors = useCallback(() => guard(async () => setMentors(toList(await getAdminMentors(token), 'mentors'))), [token]);
  const loadFeedback = useCallback(() => guard(async () => {
    const data = await getAdminMentorFeedback(token);
    setFeedback(Array.isArray(data) ? data : data.feedback || []);
  }), [token]);

  const loadAudit = useCallback((page = 0) => guard(async () => setAudit(await getAuditLog(token, page))), [token]);

  useEffect(() => {
    if (!ready) return;
    loadStats(); loadRequests(); loadCohorts(); loadMentors(); loadFeedback();
  }, [ready, loadStats, loadRequests, loadCohorts, loadMentors, loadFeedback]);

  useEffect(() => { if (ready && tab === 'audit') loadAudit(0); }, [ready, tab, loadAudit]);

  if (!ready) return <div className="tn-page"><Spinner /></div>;

  const signOutEverywhere = () => {
    if (!confirm('Sign out of every admin session, including this one?')) return;
    return guard(async () => { await adminLogoutAll(token); clearAuth(); router.push('/admin-access'); });
  };

  const feedbackSummary = (() => {
    const map = new Map();
    (feedback || []).forEach((f) => {
      const key = `${idOf(f.mentor || {})}-${idOf(f.cohort || {})}`;
      const cur = map.get(key) || { key, mentor: f.mentor?.name || '-', cohort: f.cohort?.name || '-', sum: 0, count: 0 };
      cur.sum += f.rating || 0; cur.count += 1; map.set(key, cur);
    });
    return [...map.values()].map((s) => ({ ...s, avg: s.sum / s.count })).sort((a, b) => b.avg - a.avg);
  })();

  const pending = (requests || []).filter((r) => !r.status || r.status === 'pending');

  const approve = (r) => guard(async () => {
    setBusyId(idOf(r));
    try {
      const d = await approveMentorRequest(token, idOf(r));
      setApproved({ name: r.name, email: r.email, password: d.tempPassword || d.password });
      await Promise.all([loadRequests(), loadStats(), loadMentors()]);
    } finally { setBusyId(null); }
  });
  const reject = (r) => {
    if (!confirm(`Reject the request from ${r.name}?`)) return;
    return guard(async () => { setBusyId(idOf(r)); try { await rejectMentorRequest(token, idOf(r)); await Promise.all([loadRequests(), loadStats()]); } finally { setBusyId(null); } });
  };

  const openCohort = (c) => {
    setEditing(c || null);
    setForm({ title: c ? c.name || c.title || '' : '', description: c?.description || '', syllabus: c?.syllabus || '' });
    setFormError(''); setCohortModal(true);
  };
  const saveCohort = async (e) => {
    e.preventDefault(); setSaving(true); setFormError('');
    try {
      if (editing) await updateCohort(token, idOf(editing), form); else await createCohort(token, form);
      setCohortModal(false);
      setToast(editing ? 'Cohort updated' : 'Cohort created');
      await Promise.all([loadCohorts(), loadStats()]);
    } catch (err) { if (!handleAuthError(err, router)) setFormError(err.message); } finally { setSaving(false); }
  };
  const removeCohort = (c) => {
    if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
    return guard(async () => { await deleteCohort(token, idOf(c)); setToast('Cohort deleted'); await Promise.all([loadCohorts(), loadStats()]); });
  };
  const showAnalytics = async (c) => {
    setAnalytics({ cohort: c, data: null });
    try { setAnalytics({ cohort: c, data: await getCohortAnalytics(token, idOf(c)) }); }
    catch (e) { setAnalytics({ cohort: c, data: { error: e.message } }); }
  };
  const doAssign = (c) => guard(async () => {
    if (!mentorPick) return;
    await assignMentor(token, idOf(c), mentorPick);
    setAssignFor(null); setMentorPick(''); setToast('Mentor assigned');
    await Promise.all([loadCohorts(), loadMentors()]);
  });
  const doRemoveMentor = (c, m) => {
    if (!confirm(`Remove ${m.name} from ${c.name}?`)) return;
    return guard(async () => { await removeMentor(token, idOf(c), idOf(m)); setToast('Mentor removed'); await Promise.all([loadCohorts(), loadMentors()]); });
  };

  const TABS = [
    ['dashboard', 'Overview', 'fa-gauge-high'],
    ['requests', `Mentor requests${pending.length ? ` (${pending.length})` : ''}`, 'fa-user-clock'],
    ['cohorts', 'Cohorts', 'fa-layer-group'],
    ['mentors', 'Mentors', 'fa-chalkboard-user'],
    ['feedback', 'Mentor Feedback', 'fa-star'],
    ['audit', 'Audit log', 'fa-clipboard-list'],
  ];

  return (
    <div className="tn-page">
      <div className="tn-container">
        <div className="tn-hero">
          <div>
            <span className="tn-eyebrow"><i className="fas fa-shield-halved" /> Admin panel</span>
            <h1>Hello, {user?.name || 'Admin'}</h1>
            <p>Approve mentors, run cohorts and keep an eye on progress.</p>
          </div>
          <div className="tn-hero-actions">
            <button className="tn-btn-ghost" onClick={() => { setTab('cohorts'); openCohort(null); }}><i className="fas fa-plus" /> New cohort</button>
            <button className="tn-btn-ghost" onClick={signOutEverywhere} title="Ends every admin session, on every device"><i className="fas fa-right-from-bracket" /> Sign out everywhere</button>
          </div>
        </div>

        {error && <Alert>{error}</Alert>}
        {toast && <Alert type="success"><i className="fas fa-circle-check" /><span style={{ flex: 1 }}>{toast}</span><button onClick={() => setToast('')} aria-label="Dismiss" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>×</button></Alert>}

        <div className="tn-tabs" role="tablist">
          {TABS.map(([k, l, i]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={`tn-tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}><i className={`fas ${i}`} /> {l}</button>
          ))}
        </div>

        {/* ───── Overview ───── */}
        {tab === 'dashboard' && (
          <>
            {!stats ? <Spinner /> : (
              <div className="tn-grid-stats">
                <div className="tn-stat"><span className="tn-stat-icon"><i className="fas fa-layer-group" /></span><div><div className="tn-stat-label">Cohorts</div><div className="tn-stat-value">{stats.cohorts}</div></div></div>
                <div className="tn-stat"><span className="tn-stat-icon violet"><i className="fas fa-chalkboard-user" /></span><div><div className="tn-stat-label">Mentors</div><div className="tn-stat-value">{stats.mentors}</div></div></div>
                <div className="tn-stat"><span className="tn-stat-icon amber"><i className="fas fa-user-graduate" /></span><div><div className="tn-stat-label">Mentees</div><div className="tn-stat-value">{stats.mentees}</div></div></div>
                <div className="tn-stat"><span className="tn-stat-icon coral"><i className="fas fa-user-clock" /></span><div><div className="tn-stat-label">Pending requests</div><div className="tn-stat-value">{stats.pendingRequests}</div></div></div>
              </div>
            )}
            {pending.length > 0 && (
              <Alert type="warn"><i className="fas fa-bell" /><span style={{ flex: 1 }}><strong>{pending.length}</strong> mentor request{pending.length > 1 ? 's' : ''} waiting for your review.</span><button className="tn-btn tn-btn-sm" onClick={() => setTab('requests')}>Review</button></Alert>
            )}
            <div className="tn-card">
              <h2>Cohorts at a glance</h2>
              {!cohorts ? <Spinner /> : cohorts.length === 0 ? <Empty icon="fa-layer-group">No cohorts yet. Create your first one.</Empty> : (
                <div className="tn-table-wrap"><table className="tn-table">
                  <thead><tr><th>Cohort</th><th>Mentors</th><th>Mentees</th><th /></tr></thead>
                  <tbody>{cohorts.map((c) => (
                    <tr key={idOf(c)}><td><strong>{c.name}</strong></td><td>{c.mentors?.length || 0}</td><td>{c.menteeCount ?? 0}</td>
                      <td style={{ textAlign: 'right' }}><button className="tn-btn-outline tn-btn-sm" onClick={() => showAnalytics(c)}><i className="fas fa-chart-simple" /> Analytics</button></td></tr>
                  ))}</tbody></table></div>
              )}
            </div>
          </>
        )}

        {/* ───── Mentor requests ───── */}
        {tab === 'requests' && (
          <div className="tn-card">
            <h2>Mentor requests</h2>
            {!requests ? <Spinner /> : requests.length === 0 ? <Empty icon="fa-inbox">No requests yet.</Empty> : (
              <div className="tn-table-wrap"><table className="tn-table">
                <thead><tr><th>Applicant</th><th>Reason</th><th>Date</th><th>Status</th><th /></tr></thead>
                <tbody>{requests.map((r) => {
                  const st = r.status || 'pending';
                  return (
                    <tr key={idOf(r)}>
                      <td><strong>{r.name}</strong><div className="tn-muted">{r.email}</div></td>
                      <td style={{ maxWidth: 320 }}><span title={r.reason}>{r.reason?.length > 90 ? r.reason.slice(0, 90) + '…' : r.reason}</span></td>
                      <td>{when(r.createdAt)}</td>
                      <td><span className={`tn-pill ${st === 'approved' ? 'done' : st === 'rejected' ? 'closed' : 'upcoming'}`}>{st}</span></td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {st === 'pending' && <>
                          <button className="tn-btn tn-btn-sm" disabled={busyId === idOf(r)} onClick={() => approve(r)}><i className="fas fa-check" /> Approve</button>{' '}
                          <button className="tn-btn-danger" disabled={busyId === idOf(r)} onClick={() => reject(r)}>Reject</button>
                        </>}
                      </td>
                    </tr>
                  );
                })}</tbody></table></div>
            )}
          </div>
        )}

        {/* ───── Cohorts ───── */}
        {tab === 'cohorts' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.2rem' }}>All cohorts</h2>
              <button className="tn-btn" onClick={() => openCohort(null)}><i className="fas fa-plus" /> Create cohort</button>
            </div>
            {!cohorts ? <Spinner /> : cohorts.length === 0 ? <div className="tn-card"><Empty icon="fa-layer-group">No cohorts yet.</Empty></div> : (
              <div className="tn-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
                {cohorts.map((c, i) => (
                  <div key={idOf(c)} className="tn-cohort">
                    <div className={`tn-cohort-top c${(i % 5) + 1}`}><span className="tn-cohort-icon"><i className="fas fa-layer-group" /></span></div>
                    <div className="tn-cohort-body">
                      <h2>{c.name}</h2>
                      <p>{c.description || 'No description yet.'}</p>
                      <div className="tn-cohort-meta"><span><i className="fas fa-user-graduate" />{c.menteeCount ?? 0} mentees</span></div>
                      <div style={{ marginBottom: '0.9rem' }}>
                        <div className="tn-label">Mentors</div>
                        {(c.mentors || []).length === 0 ? <span className="tn-muted">None assigned</span> : c.mentors.map((m) => (
                          <span key={idOf(m)} className="tn-chip">{m.name}<button onClick={() => doRemoveMentor(c, m)} aria-label={`Remove ${m.name}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}><i className="fas fa-xmark" /></button></span>
                        ))}
                        {assignFor === idOf(c) ? (
                          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
                            <select className="tn-select" value={mentorPick} onChange={(e) => setMentorPick(e.target.value)} aria-label="Choose mentor">
                              <option value="">Select a mentor</option>
                              {(mentors || []).filter((m) => !(c.mentors || []).some((x) => idOf(x) === idOf(m))).map((m) => <option key={idOf(m)} value={idOf(m)}>{m.name}</option>)}
                            </select>
                            <button className="tn-btn tn-btn-sm" disabled={!mentorPick} onClick={() => doAssign(c)}>Add</button>
                            <button className="tn-btn-outline tn-btn-sm" onClick={() => { setAssignFor(null); setMentorPick(''); }}>×</button>
                          </div>
                        ) : <div><button className="tn-btn-outline tn-btn-sm" onClick={() => setAssignFor(idOf(c))}><i className="fas fa-user-plus" /> Assign mentor</button></div>}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button className="tn-btn-outline tn-btn-sm" onClick={() => showAnalytics(c)}><i className="fas fa-chart-simple" /> Analytics</button>
                        <button className="tn-btn-outline tn-btn-sm" onClick={() => openCohort(c)}><i className="fas fa-pen" /> Edit</button>
                        <button className="tn-btn-danger" onClick={() => removeCohort(c)}><i className="fas fa-trash" /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ───── Mentors ───── */}
        {tab === 'mentors' && (
          <div className="tn-card">
            <h2>Approved mentors</h2>
            {!mentors ? <Spinner /> : mentors.length === 0 ? <Empty icon="fa-chalkboard-user">No mentors yet. Approve a request to add one.</Empty> : (
              <div className="tn-table-wrap"><table className="tn-table">
                <thead><tr><th>Mentor</th><th>Cohorts</th></tr></thead>
                <tbody>{mentors.map((m) => (
                  <tr key={idOf(m)}><td><strong>{m.name}</strong><div className="tn-muted">{m.email}</div></td>
                    <td>{(m.programs || []).length ? m.programs.map((p) => <span key={idOf(p)} className="tn-chip">{p.name}</span>) : <span className="tn-muted">Not assigned</span>}</td></tr>
                ))}</tbody></table></div>
            )}
          </div>
        )}

        {/* ───── Mentor Feedback (anonymous) ───── */}
        {tab === 'feedback' && (
          <>
            <Alert type="info"><i className="fas fa-user-secret" /><span>Feedback is anonymous. You can see the rating and comment, but not which mentee wrote it.</span></Alert>
            {!feedback ? <Spinner /> : feedback.length === 0 ? (
              <div className="tn-card"><Empty icon="fa-star">No feedback submitted yet.</Empty></div>
            ) : (
              <>
                <div className="tn-card">
                  <h2>Average rating per mentor</h2>
                  <div className="tn-table-wrap">
                    <table className="tn-table">
                      <thead><tr><th>Mentor</th><th>Cohort</th><th>Average</th><th>Reviews</th></tr></thead>
                      <tbody>
                        {feedbackSummary.map((s) => (
                          <tr key={s.key}>
                            <td><strong>{s.mentor}</strong></td>
                            <td>{s.cohort}</td>
                            <td style={{ whiteSpace: 'nowrap' }}><span style={{ color: '#f5b301' }}>★</span> <strong>{s.avg.toFixed(1)}</strong> / 5</td>
                            <td>{s.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="tn-card">
                  <h2>All feedback</h2>
                  <div className="tn-table-wrap">
                    <table className="tn-table">
                      <thead><tr><th>Mentor</th><th>Cohort</th><th>Rating</th><th>Comment</th><th>Date</th></tr></thead>
                      <tbody>
                        {feedback.map((f) => (
                          <tr key={idOf(f)}>
                            <td>{f.mentor?.name || '-'}</td>
                            <td>{f.cohort?.name || '-'}</td>
                            <td style={{ whiteSpace: 'nowrap' }}><span style={{ color: '#f5b301' }}>{'★'.repeat(f.rating || 0)}</span> {f.rating}/5</td>
                            <td style={{ maxWidth: 380 }}>{f.comment}</td>
                            <td>{when(f.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ───── Audit log ───── */}
        {tab === 'audit' && (
          <div className="tn-card">
            <h2>Audit log</h2>
            <p className="tn-muted" style={{ marginBottom: '1rem' }}>Sign-ins (including failed and locked-out attempts) and every change made in this panel. Passwords and codes are never recorded.</p>
            {!audit ? <Spinner /> : audit.entries.length === 0 ? <Empty icon="fa-clipboard-list">Nothing recorded yet.</Empty> : (
              <>
                <div className="tn-table-wrap"><table className="tn-table">
                  <thead><tr><th>When</th><th>Action</th><th>By</th><th>Target</th><th>IP</th><th>Result</th></tr></thead>
                  <tbody>{audit.entries.map((e) => (
                    <tr key={e._id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{new Date(e.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td><code>{e.action}</code></td>
                      <td>{e.actorLabel || '-'}</td>
                      <td>{e.targetLabel ? `${e.targetType}: ${e.targetLabel}` : '-'}</td>
                      <td>{e.ip || '-'}</td>
                      <td><span className={`tn-pill ${e.success ? 'done' : 'closed'}`}>{e.success ? 'OK' : 'Failed'}</span></td>
                    </tr>
                  ))}</tbody></table></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                  <span className="tn-muted">{audit.page * audit.limit + 1}-{audit.page * audit.limit + audit.entries.length} of {audit.total}</span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="tn-btn-outline tn-btn-sm" disabled={audit.page === 0} onClick={() => loadAudit(audit.page - 1)}>Newer</button>
                    <button className="tn-btn-outline tn-btn-sm" disabled={(audit.page + 1) * audit.limit >= audit.total} onClick={() => loadAudit(audit.page + 1)}>Older</button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ───── Modals ───── */}
      {approved && (
        <div className="tn-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setApproved(null); }}>
          <div className="tn-modal" style={{ maxWidth: 460 }}>
            <h2><i className="fas fa-circle-check" style={{ color: '#16a34a' }} /> Mentor approved</h2>
            <p className="tn-muted" style={{ marginBottom: '1rem' }}>Share these login details with <strong>{approved.name}</strong>. The password is shown only once.</p>
            <div className="tn-card" style={{ background: '#f4f8fc', boxShadow: 'none' }}>
              <div className="tn-label">Email</div><code>{approved.email}</code>
              <div className="tn-label" style={{ marginTop: '0.8rem' }}>Temporary password</div><code style={{ fontSize: '1.1rem' }}>{approved.password}</code>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="tn-btn-outline" onClick={() => navigator.clipboard.writeText(`Email: ${approved.email}\nPassword: ${approved.password}`).then(() => setToast('Copied to clipboard'))}><i className="fas fa-copy" /> Copy</button>
              <button className="tn-btn" onClick={() => setApproved(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {cohortModal && (
        <div className="tn-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setCohortModal(false); }}>
          <form className="tn-modal" onSubmit={saveCohort}>
            <h2>{editing ? 'Edit cohort' : 'Create cohort'}</h2>
            <Alert>{formError}</Alert>
            <div className="tn-field"><label htmlFor="ct">Name</label><input id="ct" className="tn-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Web Development" required /></div>
            <div className="tn-field"><label htmlFor="cd">Description</label><textarea id="cd" className="tn-textarea" style={{ minHeight: 80 }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What will mentees learn?" /></div>
            <div className="tn-field"><label htmlFor="cs">Syllabus</label><textarea id="cs" className="tn-textarea" value={form.syllabus} onChange={(e) => setForm({ ...form, syllabus: e.target.value })} placeholder={'Week 1: HTML & CSS\nWeek 2: JavaScript basics'} /></div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="tn-btn-outline" onClick={() => setCohortModal(false)}>Cancel</button>
              <button className="tn-btn" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save changes' : 'Create cohort'}</button>
            </div>
          </form>
        </div>
      )}

      {analytics && (
        <div className="tn-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setAnalytics(null); }}>
          <div className="tn-modal" style={{ maxWidth: 560 }}>
            <h2>Analytics: {analytics.cohort.name}</h2>
            {!analytics.data ? <Spinner /> : analytics.data.error ? <Alert>{analytics.data.error}</Alert> : (
              <>
                <div className="tn-grid-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  <div className="tn-stat" style={{ flexDirection: 'column', alignItems: 'flex-start' }}><div className="tn-stat-label">Mentees</div><div className="tn-stat-value">{analytics.data.menteeCount}</div></div>
                  <div className="tn-stat" style={{ flexDirection: 'column', alignItems: 'flex-start' }}><div className="tn-stat-label">Avg quiz score</div><div className="tn-stat-value">{analytics.data.avgQuizScore}%</div></div>
                  <div className="tn-stat" style={{ flexDirection: 'column', alignItems: 'flex-start' }}><div className="tn-stat-label">Completion</div><div className="tn-stat-value">{analytics.data.completionRate}%</div></div>
                </div>
                {analytics.data.topMentee && <p className="tn-muted"><i className="fas fa-trophy" style={{ color: '#f5b301' }} /> Top mentee: <strong>{analytics.data.topMentee.name}</strong> with {analytics.data.topMentee.points} points.</p>}
              </>
            )}
            <div style={{ textAlign: 'right', marginTop: '1rem' }}><button className="tn-btn" onClick={() => setAnalytics(null)}>Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
