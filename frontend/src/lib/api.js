const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').trim().replace(/\/+$/, ''); // no trailing slash

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['x-auth-token'] = token;

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the server. Please check your connection.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.message || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ───────── Auth ─────────
export const login = (email, password, role) => request('/api/auth/login', { method: 'POST', body: { email, password, role } });
// Admin sign-in is separate from the public login: password first, then a 6-digit authenticator code
export const adminLogin = (email, password) => request('/api/auth/admin/login', { method: 'POST', body: { email, password } });
export const adminVerify2fa = (challenge, code) => request('/api/auth/admin/verify-2fa', { method: 'POST', body: { challenge, code } });
export const adminLogoutAll = (token) => request('/api/admin/logout-all', { method: 'POST', token });
export const getAuditLog = (token, page = 0) => request(`/api/admin/audit-log?page=${page}&limit=25`, { token });
export const changePassword = (token, currentPassword, newPassword) =>
  request('/api/auth/change-password', { method: 'POST', token, body: { currentPassword, newPassword } });
export const submitMentorRequest = (data) => request('/api/mentor-requests', { method: 'POST', body: data });

// ───────── Public ─────────
export const getPublicCohorts = () => request('/api/public/cohorts');
export const getPublicLeaderboard = (cohortId) => request(`/api/public/leaderboard/${cohortId}`);

// ───────── Admin ─────────
export const getAdminStats = (token) => request('/api/admin/stats', { token });
export const getMentorRequests = (token) => request('/api/admin/mentor-requests', { token });
export const approveMentorRequest = (token, id) => request(`/api/admin/mentor-requests/${id}/approve`, { method: 'POST', token });
export const rejectMentorRequest = (token, id) => request(`/api/admin/mentor-requests/${id}/reject`, { method: 'POST', token });
export const getAdminCohorts = (token) => request('/api/admin/cohorts', { token });
export const createCohort = (token, data) => request('/api/admin/cohorts', { method: 'POST', token, body: data });
export const updateCohort = (token, id, data) => request(`/api/admin/cohorts/${id}`, { method: 'PUT', token, body: data });
export const deleteCohort = (token, id) => request(`/api/admin/cohorts/${id}`, { method: 'DELETE', token });
export const assignMentor = (token, cohortId, mentorId) =>
  request(`/api/admin/cohorts/${cohortId}/assign-mentor`, { method: 'POST', token, body: { mentorId } });
export const removeMentor = (token, cohortId, mentorId) =>
  request(`/api/admin/cohorts/${cohortId}/remove-mentor`, { method: 'POST', token, body: { mentorId } });
export const getCohortAnalytics = (token, cohortId) => request(`/api/admin/cohorts/${cohortId}/analytics`, { token });
export const getAdminMentors = (token) => request('/api/admin/mentors', { token });
export const getAdminMentorFeedback = (token) => request('/api/mentor-feedback/admin/all', { token });

// ───────── Mentor ─────────
export const getMentorCohorts = (token) => request('/api/mentor/cohorts', { token });
export const getMentorOverview = (token, cohortId) => request(`/api/mentor/cohorts/${cohortId}/overview`, { token });
export const addMenteesBulk = (token, cohortId, lines) =>
  request('/api/mentor/mentees/bulk', { method: 'POST', token, body: { cohortId, lines } });
export const addVideo = (token, data) => request('/api/mentor/videos', { method: 'POST', token, body: data });
export const createQuiz = (token, data) => request('/api/mentor/quizzes', { method: 'POST', token, body: data });
export const getMenteeProfileAsMentor = (token, menteeId) => request(`/api/mentor/mentees/${menteeId}/profile`, { token });
export const getMentorFeedback = (token, cohortId) => request(`/api/mentor-feedback/mentor/${cohortId}`, { token });

// ───────── Mentee ─────────
export const getMenteeDashboard = (token) => request('/api/m/dashboard', { token });
export const getMenteeCohort = (token, cohortId) => request(`/api/m/cohorts/${cohortId}`, { token });
export const completeVideo = (token, resourceId) => request(`/api/m/resources/${resourceId}/complete`, { method: 'POST', token });
export const getQuiz = (token, resourceId) => request(`/api/m/resources/${resourceId}/quiz`, { token });
export const submitQuiz = (token, resourceId, answers) =>
  request(`/api/m/resources/${resourceId}/quiz/submit`, { method: 'POST', token, body: { answers } });
export const getMyProfile = (token) => request('/api/m/profile', { token });
export const refreshMyProfile = (token) => request('/api/m/profile/refresh', { method: 'POST', token });
export const setAvatar = (token, avatar) => request('/api/m/avatar', { method: 'PUT', token, body: { avatar } });
export const getCohortMentorsForFeedback = (token, cohortId) =>
  request(`/api/mentor-feedback/${cohortId}`, { token });

export const submitMentorFeedback = (token, cohortId, mentorId, rating, comment) => request(`/api/mentor-feedback/${cohortId}`, 
  {
    method: 'POST',
    token,
    body: { mentorId, rating, comment }
  });

  // Community Chat

export const getCommunityMessages = (token, cohortId) =>
  request(`/api/community/cohorts/${cohortId}/messages`, { token });

export const sendCommunityMessage = (token, cohortId, message) =>
  request(`/api/community/cohorts/${cohortId}/messages`, {
    method: 'POST',
    token,
    body: { message }
  });