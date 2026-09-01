const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;
const isVercel = Boolean(process.env.VERCEL);

// GitHub Cloud Persistence Configuration
// Never embed a GitHub token in source code. Configure it in Vercel/project env vars.
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || 'dollawat1234/workshop-submission-app';
const GITHUB_STORE_FILE = 'data/store.json';
const ALLOW_GITHUB_BOOTSTRAP = process.env.GITHUB_BOOTSTRAP === 'true';

// Directories (Vercel uses /tmp for writable storage)
const DATA_DIR = isVercel ? path.join(os.tmpdir(), 'workshop-data') : path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const SEED_STORE_PATH = path.join(__dirname, 'data', 'store.json');
const UPLOADS_DIR = isVercel ? path.join(os.tmpdir(), 'workshop-uploads') : path.join(__dirname, 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Initial Default State (6 Teams: ทีม 1 - ทีม 6)
const DEFAULT_STORE = {
  session: {
    id: 'sess_' + Date.now(),
    title: 'AI Workshop: มาทำงานร่วมกับ ChatGPT กัน',
    subtitle: 'พื้นฐาน การใช้งาน และแนวคิดสำคัญ',
    badge: 'AI WORKSHOP',
    topic: 'ภารกิจส่งผลงานทีม',
    description: 'ให้แต่ละทีมส่งภาพผลงานเพื่อร่วมแข่งขันและนำเสนอบนจอ',
    maxFileSizeMB: 25,
    revealSubmissions: false,
    teams: [
      { id: 'team-1', name: 'ทีม 1', code: '1', color: '#1E5AF6', bg: '#EFF6FF' },
      { id: 'team-2', name: 'ทีม 2', code: '2', color: '#8B5CF6', bg: '#F5F3FF' },
      { id: 'team-3', name: 'ทีม 3', code: '3', color: '#10B981', bg: '#ECFDF5' },
      { id: 'team-4', name: 'ทีม 4', code: '4', color: '#F59E0B', bg: '#FFFBEB' },
      { id: 'team-5', name: 'ทีม 5', code: '5', color: '#EC4899', bg: '#FDF2F8' },
      { id: 'team-6', name: 'ทีม 6', code: '6', color: '#06B6D4', bg: '#ECFEFF' }
    ],
    createdAt: new Date().toISOString()
  },
  submissions: []
};

// ----------------------------------------------------
// Multi-Tier Cloud Persistence Engine (Direct Cloud Sync)
// ----------------------------------------------------
let memoryStore = null;
const storeVersions = new WeakMap();
let localMutationQueue = Promise.resolve();
const MAX_MUTATION_ATTEMPTS = 5;

class PersistenceError extends Error {
  constructor(message, statusCode = 503, code = 'PERSISTENCE_UNAVAILABLE') {
    super(message);
    this.name = 'PersistenceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

function cloneStore(store) {
  return JSON.parse(JSON.stringify(store));
}

function loadStoreFromFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw && raw.trim() ? JSON.parse(raw) : null;
  } catch (err) {
    console.error('Error loading store.json:', err.message);
    return null;
  }
}

async function syncFromGitHub() {
  if (!GITHUB_TOKEN) return null;
  try {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_STORE_FILE}?t=${Date.now()}`;
    const headers = {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'User-Agent': 'TeamGame-CloudSync',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    };
    const res = await fetch(url, {
      headers: {
        ...headers,
        'Accept': 'application/vnd.github+json'
      }
    });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new PersistenceError(`GitHub อ่านข้อมูลไม่สำเร็จ (HTTP ${res.status})`);
    }

    const data = await res.json();
    if (!data.sha) {
      throw new PersistenceError('GitHub ส่งข้อมูล store.json กลับมาไม่ครบถ้วน');
    }

    // The Contents API omits full `content` for files over 1 MB. Request the
    // raw representation in that case so Base64 image data remains readable.
    let contentStr;
    if (data.content && data.encoding === 'base64') {
      contentStr = Buffer.from(data.content, 'base64').toString('utf8');
    } else {
      const rawRes = await fetch(url, {
        headers: {
          ...headers,
          'Accept': 'application/vnd.github.raw+json'
        }
      });
      if (!rawRes.ok) {
        throw new PersistenceError(`GitHub อ่านข้อมูล store.json แบบ raw ไม่สำเร็จ (HTTP ${rawRes.status})`);
      }
      contentStr = await rawRes.text();
    }

    const parsed = JSON.parse(contentStr);
    storeVersions.set(parsed, data.sha);
    return parsed;
  } catch (err) {
    console.error('Remote fetch error:', err.message);
    if (err instanceof PersistenceError) throw err;
    throw new PersistenceError('ไม่สามารถอ่านข้อมูลจาก GitHub ได้ในขณะนี้');
  }
}

async function syncToGitHub(dataToSave, expectedSha, maxRetries = 3) {
  if (!GITHUB_TOKEN) {
    throw new PersistenceError('ยังไม่ได้ตั้งค่า GITHUB_TOKEN สำหรับ Cloud Persistence');
  }

  const b64Content = Buffer.from(JSON.stringify(dataToSave, null, 2)).toString('base64');
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_STORE_FILE}`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // The SHA belongs to the exact version read before this request mutated it.
      // Sending it to GitHub prevents a stale Lambda from overwriting a newer write.
      const body = {
        message: `Cloud Sync: Submissions Update [skip ci] (${Date.now()})`,
        content: b64Content
      };
      if (expectedSha) body.sha = expectedSha;

      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'User-Agent': 'TeamGame-CloudSync',
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        const resData = await res.json();
        const savedSha = resData.content && resData.content.sha;
        return { sha: savedSha || expectedSha || null };
      }

      if (res.status === 409) {
        throw new PersistenceError(
          'ข้อมูลถูกแก้ไขพร้อมกันจากอีกคำขอหนึ่ง กรุณาลองใหม่อีกครั้ง',
          409,
          'PERSISTENCE_CONFLICT'
        );
      }

      if (res.status === 422) {
        throw new PersistenceError(
          'GitHub ปฏิเสธข้อมูลที่ส่งไป (Validation Error)',
          422,
          'PERSISTENCE_VALIDATION'
        );
      }

      if (res.status >= 500 || res.status === 429) {
        await new Promise(r => setTimeout(r, 200 * attempt));
        continue;
      }

      throw new PersistenceError(`GitHub บันทึกข้อมูลไม่สำเร็จ (HTTP ${res.status})`);
    } catch (err) {
      if (err instanceof PersistenceError && ['PERSISTENCE_CONFLICT', 'PERSISTENCE_VALIDATION'].includes(err.code)) {
        throw err;
      }
      console.error(`Sync attempt ${attempt} error:`, err.message);
      if (err instanceof PersistenceError && attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, 200 * attempt));
    }
  }

  throw new PersistenceError('ไม่สามารถบันทึกข้อมูลบน GitHub ได้หลังจากลองหลายครั้ง');
}

async function getFreshStore() {
  if (GITHUB_TOKEN) {
    const remoteData = await syncFromGitHub();
    if (remoteData) {
      memoryStore = remoteData;
      const freshStore = cloneStore(remoteData);
      storeVersions.set(freshStore, storeVersions.get(remoteData) || null);
      return freshStore;
    }

    // Never silently resurrect a checked-in seed in production. Bootstrap is an
    // explicit one-time opt-in so a wrong repository/token cannot recreate old data.
    if (!ALLOW_GITHUB_BOOTSTRAP) {
      throw new PersistenceError(
        `ไม่พบไฟล์ ${GITHUB_STORE_FILE} บน GitHub กรุณาตรวจสอบ GITHUB_REPO หรือเปิด GITHUB_BOOTSTRAP=true เพื่อเริ่มระบบใหม่`
      );
    }

    const seedStore = loadStoreFromFile(SEED_STORE_PATH) || cloneStore(DEFAULT_STORE);
    const freshStore = cloneStore(seedStore);
    storeVersions.set(freshStore, null);
    return freshStore;
  }

  if (isVercel) {
    throw new PersistenceError('ระบบยังไม่พร้อมใช้งาน: กรุณาตั้งค่า GITHUB_TOKEN ใน Vercel');
  }

  const freshStore = cloneStore(getStore());
  storeVersions.set(freshStore, null);
  return freshStore;
}

function getStore() {
  if (memoryStore) return memoryStore;
  memoryStore = loadStoreFromFile(STORE_PATH) || loadStoreFromFile(SEED_STORE_PATH);
  if (memoryStore) return memoryStore;
  memoryStore = JSON.parse(JSON.stringify(DEFAULT_STORE));
  return memoryStore;
}

async function saveStore(data) {
  if (isVercel && !GITHUB_TOKEN) {
    throw new PersistenceError('ระบบยังไม่พร้อมใช้งาน: กรุณาตั้งค่า GITHUB_TOKEN ใน Vercel');
  }

  const expectedSha = storeVersions.get(data) || null;
  let savedSha = expectedSha;

  // Cloud is authoritative in production. Do this before updating the local cache
  // so a failed cloud write can never be reported as a successful submission.
  if (GITHUB_TOKEN) {
    const result = await syncToGitHub(data, expectedSha);
    savedSha = result.sha || expectedSha;
  }

  try {
    const tmpPath = path.join(DATA_DIR, `store_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.tmp`);
    await fs.promises.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    await fs.promises.rename(tmpPath, STORE_PATH);
  } catch (err) {
    console.error('Local save error:', err);
    if (!GITHUB_TOKEN) {
      throw new PersistenceError('ไม่สามารถบันทึกข้อมูลลงในเครื่องได้', 500, 'LOCAL_PERSISTENCE_ERROR');
    }
  }

  memoryStore = data;
  storeVersions.set(data, savedSha);
  return true;
}

function enqueueLocalMutation(work) {
  const next = localMutationQueue.then(work, work);
  localMutationQueue = next.catch(() => {});
  return next;
}

function waitForMutationRetry(attempt) {
  return new Promise(resolve => setTimeout(resolve, 150 * attempt));
}

// Execute a complete read-modify-write transaction. GitHub's SHA acts as a
// compare-and-swap across serverless instances; on conflict we re-read the
// newest store and replay the pure mutation. Local requests are additionally
// serialized because there is no remote SHA to arbitrate file writes.
async function mutateStore(mutator, onCommitted) {
  const execute = async () => {
    let lastConflict = null;

    for (let attempt = 1; attempt <= MAX_MUTATION_ATTEMPTS; attempt++) {
      const store = await getFreshStore();
      const outcome = await mutator(store, attempt);

      if (outcome && outcome.save === false) {
        return outcome.value;
      }

      try {
        await saveStore(store);
        if (onCommitted) await onCommitted(outcome && outcome.value, store);
        return outcome && Object.prototype.hasOwnProperty.call(outcome, 'value')
          ? outcome.value
          : outcome;
      } catch (err) {
        if (!(err instanceof PersistenceError) || err.code !== 'PERSISTENCE_CONFLICT') {
          throw err;
        }

        lastConflict = err;
        if (attempt === MAX_MUTATION_ATTEMPTS) break;
        await waitForMutationRetry(attempt);
      }
    }

    throw lastConflict || new PersistenceError('ไม่สามารถบันทึกข้อมูลได้หลังจากลองหลายครั้ง');
  };

  if (!GITHUB_TOKEN && !isVercel) {
    return enqueueLocalMutation(execute);
  }
  return execute();
}

function removeUploadFile(filename) {
  if (!filename) return;
  const filePath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filePath)) return;
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    console.warn('Upload cleanup error:', err.message);
  }
}

// ----------------------------------------------------
// Smart Local Network IP Detector
// ----------------------------------------------------
function getLocalNetworkIP() {
  const nets = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(nets)) {
    const lower = name.toLowerCase();
    if (
      lower.includes('docker') ||
      lower.includes('vbox') ||
      lower.includes('utun') ||
      lower.includes('tailscale') ||
      lower.includes('dummy') ||
      lower.includes('bridge') ||
      lower.includes('vmnet')
    ) {
      continue;
    }

    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        if (lower.startsWith('en') || lower.startsWith('wl') || lower.startsWith('eth')) {
          return net.address;
        }
        candidates.push(net.address);
      }
    }
  }
  return candidates[0] || 'localhost';
}

// ----------------------------------------------------
// Multer Storage & Security Hardening
// ----------------------------------------------------
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel',
  'text/plain',
  'application/zip', 'application/x-zip-compressed'
];

const ALLOWED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif',
  '.pdf', '.pptx', '.ppt', '.docx', '.doc', '.xlsx', '.xls', '.txt', '.zip'
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const safeOrigName = (file.originalname || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = path.extname(safeOrigName).toLowerCase() || '.bin';
    const base = path.basename(safeOrigName, ext).substring(0, 40);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E6);
    cb(null, `${uniqueSuffix}-${base}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  const isExtAllowed = ALLOWED_EXTENSIONS.includes(ext);
  const isMimeAllowed = ALLOWED_MIME_TYPES.includes(mime) || mime.startsWith('image/');

  if (isExtAllowed || isMimeAllowed) {
    cb(null, true);
  } else {
    cb(new Error(`ประเภทไฟล์ไม่ได้รับอนุญาต (${ext || mime}) กรุณาส่งรูปภาพ (.jpg, .png, .webp, .heic) หรือเอกสาร (.pdf, .pptx, .docx)`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB max
  }
});

// ----------------------------------------------------
// Express Middleware
// ----------------------------------------------------
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Anti-caching headers for all API requests
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// Static files
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// HTML Routes
app.get('/join', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'join.html'));
});

app.get('/files', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'files.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ----------------------------------------------------
// API Routes
// ----------------------------------------------------

// 0. Debug Status
app.get('/api/debug-status', (req, res) => {
  res.json({
    hasToken: Boolean(GITHUB_TOKEN && GITHUB_TOKEN.length > 5),
    repo: GITHUB_REPO,
    isVercel: isVercel
  });
});

// 1. Network & Dynamic URL Info
app.get('/api/network-info', (req, res) => {
  const ip = getLocalNetworkIP();
  const host = req.headers['x-forwarded-host'] || req.get('host') || `${ip}:${PORT}`;
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const isPublic = isVercel || (!host.includes('localhost') && !host.includes('127.0.0.1') && !host.startsWith('192.168.') && !host.startsWith('10.') && !host.startsWith('172.'));

  let currentUrl = `${protocol}://${host}/join`;
  let networkUrl = `${protocol}://${host}/join`;

  if (!isPublic && (host.includes('localhost') || host.includes('127.0.0.1'))) {
    networkUrl = `http://${ip}:${PORT}/join`;
  }

  res.json({
    ip,
    port: PORT,
    isPublic: Boolean(isPublic),
    currentUrl,
    networkUrl,
    publicUrl: isPublic ? `${protocol}://${host}` : null,
    speakerUrl: isPublic ? `${protocol}://${host}` : `http://localhost:${PORT}`,
    downloadUrl: isPublic ? `${protocol}://${host}/files` : `http://${ip}:${PORT}/files`
  });
});

// 2. Get Current Session Info (Fresh from Cloud)
app.get('/api/session', asyncHandler(async (req, res) => {
  const store = await getFreshStore();
  const teamStats = store.session.teams.map(team => {
    const count = store.submissions.filter(s => s.teamId === team.id).length;
    return {
      ...team,
      count
    };
  });

  res.json({
    session: {
      ...store.session,
      teams: teamStats,
      totalSubmissions: store.submissions.length
    }
  });
}));

// 3. Update Session Settings (Speaker)
app.put('/api/session', asyncHandler(async (req, res) => {
  const { title, subtitle, badge, topic, description, maxFileSizeMB, teams } = req.body;
  const session = await mutateStore(store => {
    if (title) store.session.title = title.trim();
    if (subtitle !== undefined) store.session.subtitle = subtitle.trim();
    if (badge !== undefined) store.session.badge = badge.trim();
    if (topic !== undefined) store.session.topic = topic.trim();
    if (description !== undefined) store.session.description = description.trim();
    if (maxFileSizeMB) store.session.maxFileSizeMB = Number(maxFileSizeMB) || 25;

    if (Array.isArray(teams) && teams.length > 0) {
      store.session.teams = teams.map((t, idx) => ({
        id: t.id || `team-${idx + 1}`,
        name: t.name ? t.name.trim() : `ทีม ${idx + 1}`,
        code: t.code ? t.code.trim() : String(idx + 1),
        color: t.color || '#1E5AF6',
        bg: t.bg || '#EFF6FF'
      }));
    }

    return { value: cloneStore(store.session) };
  });
  res.json({ success: true, session });
}));

// 4. Toggle Reveal Mode (Speaker)
app.post('/api/session/toggle-reveal', asyncHandler(async (req, res) => {
  const revealSubmissions = await mutateStore(store => {
    if (typeof req.body.reveal === 'boolean') {
      store.session.revealSubmissions = req.body.reveal;
    } else {
      store.session.revealSubmissions = !store.session.revealSubmissions;
    }
    return { value: store.session.revealSubmissions };
  });
  res.json({ success: true, revealSubmissions });
}));

// 5. Reset Submissions
app.post('/api/session/reset', asyncHandler(async (req, res) => {
  const backupFilename = `backup_submissions_${Date.now()}.json`;
  const resetResult = await mutateStore(store => {
    const previousSubmissions = cloneStore(store.submissions);
    store.submissions = [];
    store.session.revealSubmissions = false;
    store.session.id = 'sess_' + Date.now();
    return {
      value: {
        backupFilename,
        previousSubmissions
      }
    };
  }, async ({ backupFilename: committedBackupFilename, previousSubmissions }) => {
    try {
      fs.writeFileSync(
        path.join(DATA_DIR, committedBackupFilename),
        JSON.stringify(previousSubmissions, null, 2)
      );
    } catch (e) {
      console.warn('Backup error:', e.message);
    }

    previousSubmissions.forEach(sub => removeUploadFile(sub.filename));
  });

  res.json({ success: true, message: 'รีเซ็ตข้อมูลผลงานและล้างไฟล์เรียบร้อยแล้ว', backup: resetResult.backupFilename });
}));

// 6. Get Submissions List (Chronological: Newest First)
app.get('/api/submissions', asyncHandler(async (req, res) => {
  const store = await getFreshStore();
  const isSpeaker = req.query.view === 'speaker';
  const queryTeamId = req.query.teamId;
  const isRevealed = store.session.revealSubmissions;

  const sorted = [...store.submissions].reverse();

  const submissions = sorted.map(sub => {
    const canSee = isSpeaker || isRevealed || (queryTeamId && sub.teamId === queryTeamId);
    if (!canSee) {
      return {
        id: sub.id,
        teamId: sub.teamId,
        teamName: sub.teamName,
        teamColor: sub.teamColor,
        submitterName: sub.submitterName,
        title: sub.title || 'ส่งผลงานแล้ว',
        fileType: sub.fileType,
        isRevealed: false,
        likes: sub.likes || 0,
        createdAt: sub.createdAt
      };
    }

    return {
      ...sub,
      isRevealed: true
    };
  });

  res.json({
    revealSubmissions: isRevealed,
    submissions
  });
}));

// 7. Get Single Submission Detail
app.get('/api/submissions/:id', asyncHandler(async (req, res) => {
  const store = await getFreshStore();
  const sub = store.submissions.find(s => s.id === req.params.id);
  if (!sub) {
    return res.status(404).json({ error: 'ไม่พบผลงานนี้' });
  }

  const isSpeaker = req.query.view === 'speaker';
  const isRevealed = store.session.revealSubmissions;

  if (!isSpeaker && !isRevealed) {
    return res.json({
      success: true,
      submission: {
        id: sub.id,
        teamId: sub.teamId,
        teamName: sub.teamName,
        submitterName: sub.submitterName,
        isRevealed: false,
        likes: sub.likes || 0,
        createdAt: sub.createdAt
      }
    });
  }

  res.json({ success: true, submission: sub });
}));

// 8. Upload Submission (Multer + Base64 Cloud Persistence)
app.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        try {
          const store = await getFreshStore();
          return res.status(400).json({ error: `ขนาดไฟล์ใหญ่เกินกำหนด (สูงสุด ${store.session.maxFileSizeMB || 25}MB)` });
        } catch (storeErr) {
          return res.status(storeErr.statusCode || 503).json({ error: storeErr.message });
        }
      }
      return res.status(400).json({ error: 'เกิดข้อผิดพลาดในการอัปโหลด: ' + err.message });
    } else if (err) {
      return res.status(400).json({ error: err.message || 'รูปแบบไฟล์ไม่ถูกต้อง' });
    }

    try {
      const { teamId, submitterName, title, caption } = req.body;

      if (!teamId) {
        removeUploadFile(req.file && req.file.filename);
        return res.status(400).json({ error: 'กรุณาเลือกทีม' });
      }

      if (!req.file || req.file.size === 0) {
        removeUploadFile(req.file && req.file.filename);
        return res.status(400).json({ error: 'กรุณาเลือกไฟล์ที่ต้องการส่ง (ขนาดต้องมากกว่า 0 ไบต์)' });
      }

      const isImage = req.file.mimetype ? req.file.mimetype.startsWith('image/') : false;
      let fileUrl = `/uploads/${req.file.filename}`;

      // Convert image to Base64 Data URL for 100% serverless image persistence
      if (isImage && req.file.path && fs.existsSync(req.file.path)) {
        try {
          const fileBuf = fs.readFileSync(req.file.path);
          if (fileBuf.length <= 8 * 1024 * 1024) {
            fileUrl = `data:${req.file.mimetype || 'image/jpeg'};base64,${fileBuf.toString('base64')}`;
          }
        } catch (bufErr) {
          console.error('Base64 conversion note:', bufErr);
        }
      }

      const clientRequestId = String(
        req.body.clientRequestId || req.get('Idempotency-Key') || `upload_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`
      ).trim().substring(0, 120);
      const submissionBase = {
        id: 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        submitterName: (submitterName || '').trim() || 'สมาชิกในทีม',
        title: (title || '').trim() || req.file.originalname || 'ผลงานทีม',
        caption: (caption || '').trim(),
        filename: req.file.filename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype || 'application/octet-stream',
        fileType: isImage ? 'image' : 'document',
        size: req.file.size,
        fileUrl: fileUrl,
        likes: 0,
        createdAt: new Date().toISOString(),
        updatedAt: null,
        clientRequestId
      };

      const mutationResult = await mutateStore(store => {
        const existing = store.submissions.find(sub => sub.clientRequestId === clientRequestId);
        if (existing) {
          return { save: false, value: { submission: existing, reused: true } };
        }

        const allowedBytes = (store.session.maxFileSizeMB || 25) * 1024 * 1024;
        if (req.file.size > allowedBytes) {
          throw new PersistenceError(
            `ขนาดไฟล์เกินกำหนด (${store.session.maxFileSizeMB || 25}MB)`,
            400,
            'UPLOAD_VALIDATION_ERROR'
          );
        }

        const team = store.session.teams.find(t => t.id === teamId) || {
          id: teamId,
          name: teamId,
          color: '#1E5AF6',
          bg: '#EFF6FF'
        };
        const newSubmission = {
          ...submissionBase,
          teamId: team.id,
          teamName: team.name,
          teamColor: team.color,
          teamBg: team.bg,
          title: submissionBase.title === 'ผลงานทีม' ? `ผลงาน ${team.name}` : submissionBase.title
        };
        store.submissions.push(newSubmission);
        return { value: { submission: newSubmission, reused: false } };
      });

      if (mutationResult.reused) {
        removeUploadFile(req.file.filename);
      }

      res.status(mutationResult.reused ? 200 : 201).json({
        success: true,
        message: 'ส่งผลงานสำเร็จแล้ว!',
        submission: mutationResult.submission
      });
    } catch (e) {
      console.error('Upload error:', e);
      removeUploadFile(req.file && req.file.filename);
      res.status(e.statusCode || 500).json({
        error: e.statusCode ? e.message : 'เกิดข้อผิดพลาดในการบันทึกผลงาน',
        code: e.code || 'UPLOAD_ERROR'
      });
    }
  });
});

// 9. Edit Submission (Update Details or Replace File)
app.put('/api/submissions/:id', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      removeUploadFile(req.file && req.file.filename);
      return res.status(400).json({ error: err.message });
    }

    try {
      const { teamId, submitterName, title, caption } = req.body;
      const editTimestamp = new Date().toISOString();
      let replacement = null;

      if (req.file && req.file.size > 0) {
        const isImage = req.file.mimetype ? req.file.mimetype.startsWith('image/') : false;
        let fileUrl = `/uploads/${req.file.filename}`;
        if (isImage && req.file.path && fs.existsSync(req.file.path)) {
          try {
            const fileBuf = fs.readFileSync(req.file.path);
            if (fileBuf.length <= 8 * 1024 * 1024) {
              fileUrl = `data:${req.file.mimetype || 'image/jpeg'};base64,${fileBuf.toString('base64')}`;
            }
          } catch (e) {
            console.warn('Base64 replacement note:', e.message);
          }
        }
        replacement = {
          filename: req.file.filename,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          fileType: isImage ? 'image' : 'document',
          size: req.file.size,
          fileUrl
        };
      } else if (req.file) {
        removeUploadFile(req.file.filename);
      }

      const mutationResult = await mutateStore(store => {
        const sub = store.submissions.find(s => s.id === req.params.id);
        if (!sub) {
          return { save: false, value: { notFound: true } };
        }

        if (teamId) {
          const team = store.session.teams.find(t => t.id === teamId);
          if (team) {
            sub.teamId = team.id;
            sub.teamName = team.name;
            sub.teamColor = team.color;
            sub.teamBg = team.bg;
          }
        }

        if (submitterName !== undefined) sub.submitterName = submitterName.trim() || sub.submitterName;
        if (title !== undefined) sub.title = title.trim() || sub.title;
        if (caption !== undefined) sub.caption = caption.trim();

        const oldFilename = replacement ? sub.filename : null;
        if (replacement) {
          const allowedBytes = (store.session.maxFileSizeMB || 25) * 1024 * 1024;
          if (replacement.size > allowedBytes) {
            throw new PersistenceError(
              `ขนาดไฟล์เกินกำหนด (${store.session.maxFileSizeMB || 25}MB)`,
              400,
              'EDIT_VALIDATION_ERROR'
            );
          }
          Object.assign(sub, replacement);
        }

        sub.updatedAt = editTimestamp;
        return { value: { submission: sub, oldFilename } };
      }, ({ oldFilename }) => {
        if (oldFilename && oldFilename !== replacement.filename) {
          removeUploadFile(oldFilename);
        }
      });

      if (mutationResult.notFound) {
        removeUploadFile(req.file && req.file.filename);
        return res.status(404).json({ error: 'ไม่พบผลงานที่ต้องการแก้ไข' });
      }

      res.json({
        success: true,
        message: 'แก้ไขข้อมูลผลงานเรียบร้อยแล้ว',
        submission: mutationResult.submission
      });
    } catch (e) {
      console.error('Edit error:', e);
      removeUploadFile(req.file && req.file.filename);
      res.status(e.statusCode || 500).json({
        error: e.statusCode ? e.message : 'เกิดข้อผิดพลาดในการแก้ไขผลงาน',
        code: e.code || 'EDIT_ERROR'
      });
    }
  });
});

// 10. Delete Submission
app.delete('/api/submissions/:id', asyncHandler(async (req, res) => {
  const mutationResult = await mutateStore(store => {
    const index = store.submissions.findIndex(s => s.id === req.params.id);
    if (index === -1) {
      return { save: false, value: { notFound: true } };
    }

    const [sub] = store.submissions.splice(index, 1);
    return { value: { deletedFilename: sub.filename } };
  }, ({ deletedFilename }) => {
    removeUploadFile(deletedFilename);
  });

  if (mutationResult.notFound) {
    return res.status(404).json({ error: 'ไม่พบผลงานที่ต้องการลบ' });
  }

  res.json({ success: true, message: 'ลบผลงานเรียบร้อยแล้ว' });
}));

// 11. Like Submission
app.post('/api/submissions/:id/like', asyncHandler(async (req, res) => {
  const mutationResult = await mutateStore(store => {
    const sub = store.submissions.find(s => s.id === req.params.id);
    if (!sub) {
      return { save: false, value: { notFound: true } };
    }

    sub.likes = (sub.likes || 0) + 1;
    return { value: { likes: sub.likes } };
  });

  if (mutationResult.notFound) {
    return res.status(404).json({ error: 'ไม่พบผลงานนี้' });
  }

  res.json({ success: true, likes: mutationResult.likes });
}));

// 12. Export ZIP
app.get('/api/export/zip', asyncHandler(async (req, res) => {
  const store = await getFreshStore();
  const archive = archiver('zip', { zlib: { level: 9 } });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="AI_Workshop_Submissions_${Date.now()}.zip"`);

  archive.pipe(res);

  let manifestText = `======================================================\n`;
  manifestText += `📁 สรุปผลงาน AI Workshop: ${store.session.title}\n`;
  manifestText += `ดาวน์โหลดเมื่อ: ${new Date().toLocaleString('th-TH')}\n`;
  manifestText += `จำนวนผลงานทั้งหมด: ${store.submissions.length} ชิ้น\n`;
  manifestText += `======================================================\n\n`;

  store.submissions.forEach((sub, idx) => {
    manifestText += `[${idx + 1}] ทีม: ${sub.teamName} | ผู้ส่ง: ${sub.submitterName}\n`;
    manifestText += `    ชื่อผลงาน: ${sub.title}\n`;
    manifestText += `    คำอธิบาย: ${sub.caption || '-'}\n`;
    manifestText += `    ไฟล์: ${sub.originalname} (${sub.filename})\n`;
    manifestText += `    ส่งเมื่อ: ${new Date(sub.createdAt).toLocaleString('th-TH')}\n\n`;

    const ext = path.extname(sub.filename || sub.originalname || '.png');
    const cleanTeam = (sub.teamName || 'Team').replace(/[^a-zA-Z0-9_\u0E00-\u0E7F-]/g, '_');
    const cleanTitle = (sub.title || 'untitled').replace(/[^a-zA-Z0-9_\u0E00-\u0E7F-]/g, '_');
    const zipEntryName = `${cleanTeam}/${idx + 1}_${cleanTitle}${ext}`;

    const filePath = path.join(UPLOADS_DIR, sub.filename || '');
    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: zipEntryName });
    } else if (sub.fileUrl && sub.fileUrl.startsWith('data:')) {
      const parts = sub.fileUrl.split(',');
      if (parts[1]) {
        archive.append(Buffer.from(parts[1], 'base64'), { name: zipEntryName });
      }
    }
  });

  archive.append(manifestText, { name: 'README_สรุปผลงาน.txt' });
  archive.append(JSON.stringify(store, null, 2), { name: 'data_export.json' });

  archive.finalize();
}));

// Express 4 does not forward rejected async handlers by itself.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const statusCode = err.statusCode || 500;
  console.error('API error:', err.message);
  res.status(statusCode).json({
    error: statusCode === 500 ? 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' : err.message,
    code: err.code || 'INTERNAL_ERROR'
  });
});

// Start Server locally
if (!isVercel) {
  app.listen(PORT, '0.0.0.0', () => {
    const ip = getLocalNetworkIP();
    console.log(`\n======================================================`);
    console.log(`🚀 AI Workshop Submission Platform Running!`);
    console.log(`💻 Speaker / Projector Main URL:  http://localhost:${PORT}`);
    console.log(`📱 Participant Mobile Join URL:   http://${ip}:${PORT}/join`);
    console.log(`======================================================\n`);
  });
}

module.exports = app;
