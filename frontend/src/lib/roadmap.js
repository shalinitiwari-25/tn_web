// Turns a cohort's resources (from GET /api/m/cohorts/:id) into roadmap steps.
// Pure and rule-based: no AI is involved in progress, states or milestones.
//
// Step states:
//   done      video watched / quiz submitted
//   available can be done now
//   upcoming  quiz has not opened yet
//   missed    quiz closed without a submission
// The "next" step is the first available one, in the order the mentor added them.

export const MILESTONES = [
  { at: 1, label: 'First step', icon: 'fa-shoe-prints', exact: true },
  { at: 25, label: 'Quarter way', icon: 'fa-flag' },
  { at: 50, label: 'Halfway', icon: 'fa-mountain' },
  { at: 75, label: 'Almost there', icon: 'fa-bolt' },
  { at: 100, label: 'Finisher', icon: 'fa-crown' },
];

function stateOf(r) {
  if (r.type === 'video') return r.completed ? 'done' : 'available';
  if (r.status === 'submitted') return 'done';
  if (r.status === 'upcoming') return 'upcoming';
  if (r.status === 'closed') return 'missed';
  return 'available';
}

export function buildRoadmap(resources = []) {
  const steps = resources
    .filter((r) => r.type === 'video' || r.type === 'quiz')
    .map((r) => ({ ...r, state: stateOf(r) }));

  const nextIndex = steps.findIndex((s) => s.state === 'available');
  steps.forEach((s, i) => { s.isNext = i === nextIndex; });

  const total = steps.length;
  const done = steps.filter((s) => s.state === 'done').length;
  const percent = total ? Math.round((done / total) * 100) : 0;

  const milestones = MILESTONES.map((m) => ({
    ...m,
    earned: m.exact ? done >= 1 : total > 0 && percent >= m.at,
  }));
  const nextMilestone = milestones.find((m) => !m.earned && !m.exact) || null;

  // How many more steps until the next percentage milestone
  let stepsToMilestone = null;
  if (nextMilestone && total) {
    stepsToMilestone = Math.max(1, Math.ceil((nextMilestone.at / 100) * total) - done);
  }

  return {
    steps,
    total,
    done,
    percent,
    next: nextIndex >= 0 ? steps[nextIndex] : null,
    missed: steps.filter((s) => s.state === 'missed').length,
    milestones,
    nextMilestone,
    stepsToMilestone,
  };
}
