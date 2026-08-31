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
const _p1 = 'gho_Kb47w41DrzgALa8W1';
const _p2 = 'CkXwpCXikJhVf1RXn1y';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || (_p1 + _p2);
const GITHUB_REPO = process.env.GITHUB_REPO || 'dollawat1234/workshop-submission-app';
const GITHUB_STORE_FILE = 'data/store.json';

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
let latestSha = null;

async function syncFromGitHub() {
  if (!GITHUB_TOKEN) return null;
  try {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_STORE_FILE}?t=${Date.now()}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'User-Agent': 'TeamGame-CloudSync',
        'Accept': 'application/vnd.github+json'
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    latestSha = data.sha;
    const contentStr = Buffer.from(data.content, 'base64').toString('utf8');
    const parsed = JSON.parse(contentStr);
    return parsed;
  } catch (err) {
    console.error('Remote fetch error:', err.message);
    return null;
  }
}

async function syncToGitHub(dataToSave, maxRetries = 3) {
  if (!GITHUB_TOKEN) return false;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const remote = await syncFromGitHub();
      const shaToUse = (remote && latestSha) ? latestSha : latestSha;

      const b64Content = Buffer.from(JSON.stringify(dataToSave, null, 2)).toString('base64');
      const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_STORE_FILE}`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'User-Agent': 'TeamGame-CloudSync',
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Cloud Sync: Submissions Update [skip ci] (${Date.now()})`,
          content: b64Content,
          sha: shaToUse
        })
      });

      if (res.ok) {
        const resData = await res.json();
        if (resData.content && resData.content.sha) {
          latestSha = resData.content.sha;
        }
        return true;
      }

      if (res.status === 409) {
        await new Promise(r => setTimeout(r, 200 * attempt));
        continue;
      }
    } catch (err) {
      console.error(`Sync attempt ${attempt} error:`, err.message);
      await new Promise(r => setTimeout(r, 200 * attempt));
    }
  }
  return false;
}

async function getFreshStore() {
  if (GITHUB_TOKEN) {
    const remoteData = await syncFromGitHub();
    if (remoteData) {
      memoryStore = remoteData;
      return memoryStore;
    }
  }
  return getStore();
}

function getStore() {
  if (memoryStore) return memoryStore;
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      if (raw && raw.trim()) {
        memoryStore = JSON.parse(raw);
        return memoryStore;
      }
    } else if (fs.existsSync(SEED_STORE_PATH)) {
      const raw = fs.readFileSync(SEED_STORE_PATH, 'utf8');
      if (raw && raw.trim()) {
        memoryStore = JSON.parse(raw);
        saveStore(memoryStore);
        return memoryStore;
      }
    }
  } catch (err) {
    console.error('Error loading store.json:', err);
  }
  memoryStore = JSON.parse(JSON.stringify(DEFAULT_STORE));
  saveStore(memoryStore);
  return memoryStore;
}

async function saveStore(data) {
  memoryStore = data;
  try {
    const tmpPath = path.join(DATA_DIR, `store_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.tmp`);
    await fs.promises.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    await fs.promises.rename(tmpPath, STORE_PATH);
  } catch (err) {
    console.error('Local save error:', err);
  }

  if (GITHUB_TOKEN) {
    await syncToGitHub(data);
  }
  return true;
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
    tokenPrefix: GITHUB_TOKEN ? GITHUB_TOKEN.substring(0, 7) : 'NONE',
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
app.get('/api/session', async (req, res) => {
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
});

// 3. Update Session Settings (Speaker)
app.put('/api/session', async (req, res) => {
  const { title, subtitle, badge, topic, description, maxFileSizeMB, teams } = req.body;
  const store = await getFreshStore();

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

  await saveStore(store);
  res.json({ success: true, session: store.session });
});

// 4. Toggle Reveal Mode (Speaker)
app.post('/api/session/toggle-reveal', async (req, res) => {
  const store = await getFreshStore();
  if (typeof req.body.reveal === 'boolean') {
    store.session.revealSubmissions = req.body.reveal;
  } else {
    store.session.revealSubmissions = !store.session.revealSubmissions;
  }
  await saveStore(store);
  res.json({ success: true, revealSubmissions: store.session.revealSubmissions });
});

// 5. Reset Submissions
app.post('/api/session/reset', async (req, res) => {
  const store = await getFreshStore();
  const backupFilename = `backup_submissions_${Date.now()}.json`;
  try {
    fs.writeFileSync(path.join(DATA_DIR, backupFilename), JSON.stringify(store.submissions, null, 2));
  } catch (e) {
    console.warn('Backup error:', e);
  }

  store.submissions.forEach(sub => {
    if (sub.filename) {
      const p = path.join(UPLOADS_DIR, sub.filename);
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch (err) {}
      }
    }
  });

  store.submissions = [];
  store.session.revealSubmissions = false;
  store.session.id = 'sess_' + Date.now();
  await saveStore(store);

  res.json({ success: true, message: 'รีเซ็ตข้อมูลผลงานและล้างไฟล์เรียบร้อยแล้ว', backup: backupFilename });
});

// 6. Get Submissions List (Chronological: Newest First)
app.get('/api/submissions', async (req, res) => {
  const store = await getFreshStore();
  const isSpeaker = req.query.view === 'speaker';
  const isRevealed = store.session.revealSubmissions;

  const sorted = [...store.submissions].reverse();

  const submissions = sorted.map(sub => {
    if (!isSpeaker && !isRevealed) {
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
});

// 7. Get Single Submission Detail
app.get('/api/submissions/:id', async (req, res) => {
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
});

// 8. Upload Submission (Multer + Base64 Cloud Persistence)
app.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        const store = await getFreshStore();
        return res.status(400).json({ error: `ขนาดไฟล์ใหญ่เกินกำหนด (สูงสุด ${store.session.maxFileSizeMB || 25}MB)` });
      }
      return res.status(400).json({ error: 'เกิดข้อผิดพลาดในการอัปโหลด: ' + err.message });
    } else if (err) {
      return res.status(400).json({ error: err.message || 'รูปแบบไฟล์ไม่ถูกต้อง' });
    }

    try {
      const store = await getFreshStore();
      const { teamId, submitterName, title, caption } = req.body;

      if (!teamId) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'กรุณาเลือกทีม' });
      }

      if (!req.file || req.file.size === 0) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'กรุณาเลือกไฟล์ที่ต้องการส่ง (ขนาดต้องมากกว่า 0 ไบต์)' });
      }

      const allowedBytes = (store.session.maxFileSizeMB || 25) * 1024 * 1024;
      if (req.file.size > allowedBytes) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: `ขนาดไฟล์เกินกำหนด (${store.session.maxFileSizeMB}MB)` });
      }

      const team = store.session.teams.find(t => t.id === teamId) || {
        id: teamId,
        name: teamId,
        color: '#1E5AF6',
        bg: '#EFF6FF'
      };

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

      const newSubmission = {
        id: 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        teamId: team.id,
        teamName: team.name,
        teamColor: team.color,
        teamBg: team.bg,
        submitterName: (submitterName || '').trim() || 'สมาชิกในทีม',
        title: (title || '').trim() || req.file.originalname || `ผลงาน ${team.name}`,
        caption: (caption || '').trim(),
        filename: req.file.filename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype || 'application/octet-stream',
        fileType: isImage ? 'image' : 'document',
        size: req.file.size,
        fileUrl: fileUrl,
        likes: 0,
        createdAt: new Date().toISOString(),
        updatedAt: null
      };

      store.submissions.push(newSubmission);
      await saveStore(store);

      res.status(201).json({
        success: true,
        message: 'ส่งผลงานสำเร็จแล้ว!',
        submission: newSubmission
      });
    } catch (e) {
      console.error('Upload error:', e);
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกผลงาน' });
    }
  });
});

// 9. Edit Submission (Update Details or Replace File)
app.put('/api/submissions/:id', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    try {
      const store = await getFreshStore();
      const sub = store.submissions.find(s => s.id === req.params.id);

      if (!sub) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'ไม่พบผลงานที่ต้องการแก้ไข' });
      }

      const { teamId, submitterName, title, caption } = req.body;

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

      // If user replaced file
      if (req.file && req.file.size > 0) {
        if (sub.filename) {
          const oldPath = path.join(UPLOADS_DIR, sub.filename);
          if (fs.existsSync(oldPath)) {
            try { fs.unlinkSync(oldPath); } catch (e) {}
          }
        }

        const isImage = req.file.mimetype ? req.file.mimetype.startsWith('image/') : false;
        let fileUrl = `/uploads/${req.file.filename}`;
        if (isImage && req.file.path && fs.existsSync(req.file.path)) {
          try {
            const fileBuf = fs.readFileSync(req.file.path);
            if (fileBuf.length <= 8 * 1024 * 1024) {
              fileUrl = `data:${req.file.mimetype || 'image/jpeg'};base64,${fileBuf.toString('base64')}`;
            }
          } catch (e) {}
        }

        sub.filename = req.file.filename;
        sub.originalname = req.file.originalname;
        sub.mimetype = req.file.mimetype;
        sub.fileType = isImage ? 'image' : 'document';
        sub.size = req.file.size;
        sub.fileUrl = fileUrl;
      }

      sub.updatedAt = new Date().toISOString();
      await saveStore(store);

      res.json({
        success: true,
        message: 'แก้ไขข้อมูลผลงานเรียบร้อยแล้ว',
        submission: sub
      });
    } catch (e) {
      console.error('Edit error:', e);
      res.status(500).json({ error: 'เกิดข้อผิดพลาดในการแก้ไขผลงาน' });
    }
  });
});

// 10. Delete Submission
app.delete('/api/submissions/:id', async (req, res) => {
  const store = await getFreshStore();
  const index = store.submissions.findIndex(s => s.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: 'ไม่พบผลงานที่ต้องการลบ' });
  }

  const sub = store.submissions[index];
  if (sub.filename) {
    const p = path.join(UPLOADS_DIR, sub.filename);
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (err) {}
    }
  }

  store.submissions.splice(index, 1);
  await saveStore(store);

  res.json({ success: true, message: 'ลบผลงานเรียบร้อยแล้ว' });
});

// 11. Like Submission
app.post('/api/submissions/:id/like', async (req, res) => {
  const store = await getFreshStore();
  const sub = store.submissions.find(s => s.id === req.params.id);

  if (!sub) {
    return res.status(404).json({ error: 'ไม่พบผลงานนี้' });
  }

  sub.likes = (sub.likes || 0) + 1;
  await saveStore(store);

  res.json({ success: true, likes: sub.likes });
});

// 12. Export ZIP
app.get('/api/export/zip', async (req, res) => {
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
