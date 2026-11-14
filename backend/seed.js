require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const Admin = require('./models/Admin');
const Mentor = require('./models/Mentor');
const Mentee = require('./models/Mentee');
const Program = require('./models/Program');
const Resource = require('./models/Resource');
const Quiz = require('./models/Quiz');
const QuizSubmission = require('./models/QuizSubmission');
const MentorRequest = require('./models/MentorRequest');
const LoginThrottle = require('./models/LoginThrottle');
const AuditLog = require('./models/AuditLog');
const { twoFaRequired } = require('./utils/adminSession');
const { enroll, printEnrollment } = require('./utils/adminTwoFactor');

async function seed() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected.');

    // ── 1. Clear all collections ──────────────────────────────────────────────
    console.log('\nClearing collections...');
    await Promise.all([
      Admin.deleteMany({}),
      Mentor.deleteMany({}),
      Mentee.deleteMany({}),
      Program.deleteMany({}),
      Resource.deleteMany({}),
      Quiz.deleteMany({}),
      QuizSubmission.deleteMany({}),
      MentorRequest.deleteMany({}),
      LoginThrottle.deleteMany({}),
      AuditLog.deleteMany({})
    ]);
    console.log('Collections cleared.');

    // ── 2. Create Admin ───────────────────────────────────────────────────────
    // No default password: use ADMIN_PASSWORD from .env, or a random one that is printed once below.
    const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@techneeds.in').trim().toLowerCase();
    let adminPassword = process.env.ADMIN_PASSWORD;
    const generatedPassword = !adminPassword;
    if (generatedPassword) adminPassword = crypto.randomBytes(12).toString('base64url');
    if (adminPassword.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set in .env before seeding');
    const admin = new Admin({
      name: 'Admin TechNeeds',
      email: adminEmail,
      password: await bcrypt.hash(adminPassword, 10),
      role: 'admin',
      mustChangePassword: generatedPassword // a generated password must be replaced at first login
    });
    await admin.save();
    const adminTwoFa = twoFaRequired() ? await enroll(Admin, admin) : null;
    console.log('Admin created.');

    // ── 3. Create Mentors ─────────────────────────────────────────────────────
    const priya = new Mentor({
      name: 'Priya Sharma',
      email: 'priya.sharma@techneeds.in',
      password: await bcrypt.hash('Mentor@001', 10),
      role: 'mentor',
      status: 'approved',
      mustChangePassword: false,
      programs: []
    });
    const ankit = new Mentor({
      name: 'Ankit Verma',
      email: 'ankit.verma@techneeds.in',
      password: await bcrypt.hash('Mentor@002', 10),
      role: 'mentor',
      status: 'approved',
      mustChangePassword: false,
      programs: []
    });
    await Promise.all([priya.save(), ankit.save()]);
    console.log('Mentors created.');

    // ── 4. Create Cohorts (Programs) ──────────────────────────────────────────
    const webDev = new Program({
      name: 'Web Development',
      description: 'Full-stack web dev with HTML/CSS/JS/React',
      syllabus: '1. HTML & CSS fundamentals\n2. JavaScript ES6+\n3. React basics\n4. Node.js & Express\n5. MongoDB & deployment',
      mentors: [priya._id],
      createdBy: admin._id
    });
    const dsa = new Program({
      name: 'Data Structures & Algorithms',
      description: 'DSA in C/C++ from basics to advanced',
      syllabus: '1. Arrays & Strings\n2. Linked Lists\n3. Trees & Graphs\n4. Dynamic Programming\n5. Contest problems',
      mentors: [ankit._id],
      createdBy: admin._id
    });
    const ml = new Program({
      name: 'Machine Learning',
      description: 'Intro to ML and AI with Python',
      syllabus: '1. Python for ML\n2. Numpy & Pandas\n3. Supervised Learning\n4. Neural Networks\n5. Projects',
      mentors: [priya._id, ankit._id],
      createdBy: admin._id
    });
    await Promise.all([webDev.save(), dsa.save(), ml.save()]);
    console.log('Cohorts created.');

    // Update mentor programs
    priya.programs = [webDev._id, ml._id];
    ankit.programs = [dsa._id, ml._id];
    await Promise.all([priya.save(), ankit.save()]);

    // ── 5. Create Video Resources (2 per cohort) ───────────────────────────────
    const videoData = [
      // Web Dev
      { title: 'HTML & CSS Crash Course', program: webDev._id, type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', isLocked: false, maxScore: 10 },
      { title: 'JavaScript ES6+ Deep Dive', program: webDev._id, type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', isLocked: false, maxScore: 10 },
      // DSA
      { title: 'Arrays & Strings Fundamentals', program: dsa._id, type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', isLocked: false, maxScore: 10 },
      { title: 'Linked Lists Explained', program: dsa._id, type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', isLocked: false, maxScore: 10 },
      // ML
      { title: 'Python for Data Science', program: ml._id, type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', isLocked: false, maxScore: 10 },
      { title: 'Supervised Learning Overview', program: ml._id, type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', isLocked: false, maxScore: 10 }
    ];
    const videoResources = await Resource.insertMany(videoData);

    // Link resources to programs
    webDev.resources.push(videoResources[0]._id, videoResources[1]._id);
    dsa.resources.push(videoResources[2]._id, videoResources[3]._id);
    ml.resources.push(videoResources[4]._id, videoResources[5]._id);
    console.log('Video resources created.');

    // ── 6. Create Quiz Resources (1 per cohort) ───────────────────────────────
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Web Dev Quiz
    const webQuizResource = new Resource({
      title: 'Web Dev Quiz 1',
      type: 'quiz',
      program: webDev._id,
      isLocked: false,
      maxScore: 3,
      deadline: sevenDaysFromNow
    });
    await webQuizResource.save();
    webDev.resources.push(webQuizResource._id);

    const webQuiz = new Quiz({
      resource: webQuizResource._id,
      startTime: sevenDaysAgo,
      endTime: sevenDaysFromNow,
      questions: [
        { questionText: 'What does HTML stand for?', options: ['Hyper Text Markup Language', 'High Tech Modern Language', 'Hyper Transfer Markup Language', 'None of these'], correctOptionIndex: 0, marks: 1 },
        { questionText: 'Which CSS property changes text color?', options: ['background', 'font-color', 'color', 'text-color'], correctOptionIndex: 2, marks: 1 },
        { questionText: 'Which ES6 keyword declares a constant?', options: ['var', 'let', 'const', 'static'], correctOptionIndex: 2, marks: 1 }
      ]
    });
    await webQuiz.save();

    // DSA Quiz
    const dsaQuizResource = new Resource({
      title: 'DSA Quiz 1',
      type: 'quiz',
      program: dsa._id,
      isLocked: false,
      maxScore: 3,
      deadline: sevenDaysFromNow
    });
    await dsaQuizResource.save();
    dsa.resources.push(dsaQuizResource._id);

    const dsaQuiz = new Quiz({
      resource: dsaQuizResource._id,
      startTime: sevenDaysAgo,
      endTime: sevenDaysFromNow,
      questions: [
        { questionText: 'What is the time complexity of binary search?', options: ['O(n)', 'O(log n)', 'O(n²)', 'O(1)'], correctOptionIndex: 1, marks: 1 },
        { questionText: 'Which data structure uses LIFO?', options: ['Queue', 'Stack', 'Heap', 'Tree'], correctOptionIndex: 1, marks: 1 },
        { questionText: 'What is the worst-case complexity of QuickSort?', options: ['O(n log n)', 'O(n)', 'O(n²)', 'O(log n)'], correctOptionIndex: 2, marks: 1 }
      ]
    });
    await dsaQuiz.save();

    // ML Quiz
    const mlQuizResource = new Resource({
      title: 'ML Quiz 1',
      type: 'quiz',
      program: ml._id,
      isLocked: false,
      maxScore: 3,
      deadline: sevenDaysFromNow
    });
    await mlQuizResource.save();
    ml.resources.push(mlQuizResource._id);

    const mlQuiz = new Quiz({
      resource: mlQuizResource._id,
      startTime: sevenDaysAgo,
      endTime: sevenDaysFromNow,
      questions: [
        { questionText: 'What does ML stand for?', options: ['Machine Language', 'Machine Learning', 'Model Logic', 'Multi Layer'], correctOptionIndex: 1, marks: 1 },
        { questionText: 'Which library is used for ML in Python?', options: ['React', 'Scikit-learn', 'Express', 'Django'], correctOptionIndex: 1, marks: 1 },
        { questionText: 'What is supervised learning?', options: ['Training with labeled data', 'Training without labels', 'Reinforcement', 'Clustering'], correctOptionIndex: 0, marks: 1 }
      ]
    });
    await mlQuiz.save();

    await Promise.all([webDev.save(), dsa.save(), ml.save()]);
    console.log('Quiz resources created.');

    // ── 7. Create Mentees ─────────────────────────────────────────────────────
    const menteeData = [
      { name: 'Aarav Singh',   email: 'aarav.singh@college.edu',   programs: [webDev._id] },
      { name: 'Diya Patel',    email: 'diya.patel@college.edu',    programs: [webDev._id] },
      { name: 'Rohan Mehta',   email: 'rohan.mehta@college.edu',   programs: [webDev._id] },
      { name: 'Sneha Reddy',   email: 'sneha.reddy@college.edu',   programs: [webDev._id, ml._id] }, // cross-enrolled
      { name: 'Kabir Khan',    email: 'kabir.khan@college.edu',    programs: [dsa._id] },
      { name: 'Ananya Nair',   email: 'ananya.nair@college.edu',   programs: [dsa._id] },
      { name: 'Yash Gupta',    email: 'yash.gupta@college.edu',    programs: [dsa._id, ml._id] }, // cross-enrolled
      { name: 'Prisha Joshi',  email: 'prisha.joshi@college.edu',  programs: [ml._id] },
      { name: 'Arjun Iyer',    email: 'arjun.iyer@college.edu',    programs: [ml._id] },
      { name: 'Meera Verma',   email: 'meera.verma@college.edu',   programs: [ml._id] }
    ];

    const hashedPass = await bcrypt.hash('Pass@1234', 10);
    const mentees = [];
    for (let i = 0; i < menteeData.length; i++) {
      const d = menteeData[i];
      const mentee = new Mentee({
        name: d.name,
        email: d.email,
        enrollmentNumber: `TN26-${String(i + 1).padStart(4, '0')}`,
        password: hashedPass,
        mustChangePassword: i >= 2, // first two demo mentees can log straight in
        programs: d.programs
      });
      await mentee.save();
      mentees.push(mentee);
    }
    // Some video completions + streaks so points and the leaderboard look alive
    const markVideos = async (mentee, resources, streak) => {
      mentee.completedResources.push(...resources.map((r) => ({ resource: r._id, score: 5, completedOn: new Date() })));
      mentee.streak = streak;
      mentee.lastActiveDate = new Date();
      await mentee.save();
    };
    await markVideos(mentees[0], [videoResources[0], videoResources[1]], 4); // Aarav: both web videos
    await markVideos(mentees[1], [videoResources[0]], 2);                    // Diya
    await markVideos(mentees[4], [videoResources[2], videoResources[3]], 3); // Kabir: both DSA videos
    await markVideos(mentees[7], [videoResources[4]], 5);                    // Prisha
    console.log('Mentees created.');

    // ── 8. Quiz Submissions ───────────────────────────────────────────────────
    // Web Dev quiz submissions (3 mentees from web dev cohort)
    const webSubmissions = [
      { mentee: mentees[0], score: 3, onTime: true },  // Aarav — 3/3
      { mentee: mentees[1], score: 2, onTime: true },  // Diya — 2/3
      { mentee: mentees[2], score: 1, onTime: false }  // Rohan — 1/3 (late)
    ];
    for (const sub of webSubmissions) {
      await new QuizSubmission({
        quiz: webQuiz._id,
        mentee: sub.mentee._id,
        resource: webQuizResource._id,
        score: sub.score,
        onTime: sub.onTime,
        answers: []
      }).save();
    }

    // DSA quiz submissions
    const dsaSubmissions = [
      { mentee: mentees[4], score: 3, onTime: true },  // Kabir — 3/3
      { mentee: mentees[5], score: 2, onTime: true }   // Ananya — 2/3
    ];
    for (const sub of dsaSubmissions) {
      await new QuizSubmission({
        quiz: dsaQuiz._id,
        mentee: sub.mentee._id,
        resource: dsaQuizResource._id,
        score: sub.score,
        onTime: sub.onTime,
        answers: []
      }).save();
    }

    // ML quiz submissions
    const mlSubmissions = [
      { mentee: mentees[7], score: 3, onTime: true },  // Prisha — 3/3
      { mentee: mentees[8], score: 1, onTime: false }, // Arjun — 1/3 (late)
      { mentee: mentees[3], score: 2, onTime: true }   // Sneha — 2/3 (cross-enrolled)
    ];
    for (const sub of mlSubmissions) {
      await new QuizSubmission({
        quiz: mlQuiz._id,
        mentee: sub.mentee._id,
        resource: mlQuizResource._id,
        score: sub.score,
        onTime: sub.onTime,
        answers: []
      }).save();
    }
    console.log('Quiz submissions created.');

    // ── 9. Print demo credentials ─────────────────────────────────────────────
    console.log('\n' + '='.repeat(55));
    console.log('=== DEMO CREDENTIALS ===');
    console.log('='.repeat(55));
    console.log(generatedPassword ? `Admin:    ${adminEmail} / ${adminPassword}   (generated, shown once; you must change it at first login)` : `Admin:    ${adminEmail} / (the ADMIN_PASSWORD from your .env)`);
    console.log(`          Sign in at /admin-access (not on the public login page). 2FA: ${adminTwoFa ? 'ON (see setup below)' : 'OFF (ADMIN_2FA_REQUIRED=false)'}`);
    console.log(`Mentor 1: priya.sharma@techneeds.in / Mentor@001`);
    console.log(`Mentor 2: ankit.verma@techneeds.in  / Mentor@002`);
    console.log(`Mentees:  (enrollmentNumber) / Pass@1234  [TN26-0003 onwards must change password on first login]`);
    mentees.forEach(m => {
      console.log(`  ${m.enrollmentNumber} — ${m.name}`);
    });
    console.log('='.repeat(55));
    if (adminTwoFa) await printEnrollment({ email: adminEmail, ...adminTwoFa });
    console.log('\nSeed completed successfully!');

    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

seed();
