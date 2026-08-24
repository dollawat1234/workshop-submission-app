const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;

// Directories
const DATA_DIR = path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Initial Default State
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
      { id: 'team-a', name: 'ทีม A (Alpha)', code: 'A', color: '#1E5AF6', bg: '#EFF6FF' },
      { id: 'team-b', name: 'ทีม B (Beta)', code: 'B', color: '#8B5CF6', bg: '#F5F3FF' },
      { id: 'team-c', name: 'ทีม C (Gamma)', code: 'C', color: '#10B981', bg: '#ECFDF5' },
      { id: 'team-d', name: 'ทีม D (Delta)', code: 'D', color: '#F59E0B', bg: '#FFFBEB' }
    ],
    createdAt: new Date().toISOString()
  },
  submissions: []
};

// ----------------------------------------------------
// In-Memory Store with Async Mutex Write Queue (Race Condition Prevention)
// ----------------------------------------------------
let memoryStore = null;
let isWriting = false;
const writeQueue = [];

function getStore() {
  if (memoryStore) return memoryStore;
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      if (raw && raw.trim()) {
        memoryStore = JSON.parse(raw);
        return memoryStore;
      }
    }
  } catch (err) {
    console.error('CRITICAL: Corrupted store.json, loading fallback:', err);
  }
  memoryStore = JSON.parse(JSON.stringify(DEFAULT_STORE));
  saveStore(memoryStore);
  return memoryStore;
}

function saveStore(data) {
  memoryStore = data;
  return new Promise((resolve, reject) => {
    writeQueue.push({ data, resolve, reject });
    processWriteQueue();
  });
}

async function processWriteQueue() {
  if (isWriting || writeQueue.length === 0) return;
  isWriting = true;
  const current = writeQueue.shift();
  try {
    const tmpPath = path.join(DATA_DIR, `store_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.tmp`);
    await fs.promises.writeFile(tmpPath, JSON.stringify(current.data, null, 2), 'utf8');
    await fs.promises.rename(tmpPath, STORE_PATH);
    current.resolve(true);
  } catch (err) {
    console.error('Error in write queue:', err);
    current.reject(err);
  } finally {
    isWriting = false;
    processWriteQueue();
  }
}

// ----------------------------------------------------
// Smart Local Network IP Detector (Filters out Docker, VirtualBox, Tailscale/VPN)
// ----------------------------------------------------
function getLocalNetworkIP() {
  const nets = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(nets)) {
    const lower = name.toLowerCase();
    // Skip virtual, docker, VPN adapters
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
        // High priority for Wi-Fi or Ethernet interfaces
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
// Multer Storage & Security Hardening (Blocks HTML/SVG XSS)
// ----------------------------------------------------
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed'
];

const ALLOWED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.webp', '.gif',
  '.pdf', '.ppt', '.pptx', '.doc', '.docx', '.txt', '.zip'
];

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const ext = (path.extname(file.originalname) || '').toLowerCase();
    const rawBase = path.basename(file.originalname, ext);
    const safeName = rawBase.replace(/[^a-zA-Z0-9_\u0E00-\u0E7F-]/g, '_').substring(0, 50) || 'file';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, `${uniqueSuffix}-${safeName}${ext || '.bin'}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB absolute upper limit
  },
  fileFilter: function (req, file, cb) {
    const ext = (path.extname(file.originalname) || '').toLowerCase();
    const isAllowedExt = ALLOWED_EXTENSIONS.includes(ext);
    const isAllowedMime = ALLOWED_MIME_TYPES.includes(file.mimetype) || file.mimetype.startsWith('image/');

    // Explicitly reject dangerous executable / script files (SVG, HTML, JS, PHP)
    if (ext === '.svg' || ext === '.html' || ext === '.htm' || ext === '.js' || file.mimetype === 'image/svg+xml') {
      return cb(new Error('ไม่อนุญาตให้อัปโหลดไฟล์ประเภทนี้เพื่อความปลอดภัย'));
    }

    if (isAllowedExt || isAllowedMime) {
      cb(null, true);
    } else {
      cb(new Error('รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WEBP) และเอกสาร (PDF, สไลด์)'));
    }
  }
});

// Middleware & Security Headers
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// Serve static assets and uploads
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// ----------------------------------------------------
// PAGE ROUTES
// ----------------------------------------------------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get(['/join', '/submit', '/p'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'join.html'));
});

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// 1. Network Info
app.get('/api/network-info', (req, res) => {
  const ip = getLocalNetworkIP();
  const protocol = req.protocol;
  const host = req.get('host');
  const port = PORT;

  res.json({
    ip,
    port,
    localUrl: `http://localhost:${port}/join`,
    networkUrl: `http://${ip}:${port}/join`,
    currentUrl: `${protocol}://${host}/join`
  });
});

// 2. Get Session Info
app.get('/api/session', (req, res) => {
  const store = getStore();
  const teamStats = store.session.teams.map(team => {
    const teamSubmissions = store.submissions.filter(s => s.teamId === team.id);
    return {
      ...team,
      submissionCount: teamSubmissions.length,
      lastSubmittedAt: teamSubmissions.length > 0 ? teamSubmissions[teamSubmissions.length - 1].createdAt : null
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
  const store = getStore();

  if (title) store.session.title = title.trim();
  if (subtitle !== undefined) store.session.subtitle = subtitle.trim();
  if (badge !== undefined) store.session.badge = badge.trim();
  if (topic !== undefined) store.session.topic = topic.trim();
  if (description !== undefined) store.session.description = description.trim();
  if (maxFileSizeMB) store.session.maxFileSizeMB = Number(maxFileSizeMB) || 25;

  if (Array.isArray(teams) && teams.length > 0) {
    store.session.teams = teams.map((t, idx) => ({
      id: t.id || `team-${String.fromCharCode(97 + idx)}`,
      name: t.name ? t.name.trim() : `ทีม ${String.fromCharCode(65 + idx)}`,
      code: t.code ? t.code.trim() : String.fromCharCode(65 + idx),
      color: t.color || '#1E5AF6',
      bg: t.bg || '#EFF6FF'
    }));
  }

  await saveStore(store);
  res.json({ success: true, session: store.session });
});

// 4. Toggle Reveal Mode
app.post('/api/session/toggle-reveal', async (req, res) => {
  const store = getStore();
  if (typeof req.body.reveal === 'boolean') {
    store.session.revealSubmissions = req.body.reveal;
  } else {
    store.session.revealSubmissions = !store.session.revealSubmissions;
  }
  await saveStore(store);
  res.json({ success: true, revealSubmissions: store.session.revealSubmissions });
});

// 5. Reset Submissions (With Disk Cleanup & Backup)
app.post('/api/session/reset', async (req, res) => {
  const store = getStore();
  const backupFilename = `backup_submissions_${Date.now()}.json`;
  try {
    fs.writeFileSync(path.join(DATA_DIR, backupFilename), JSON.stringify(store.submissions, null, 2));
  } catch (e) {
    console.warn('Backup error:', e);
  }

  // Disk cleanup of old uploaded files
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
app.get('/api/submissions', (req, res) => {
  const store = getStore();
  const isSpeaker = req.query.view === 'speaker';
  const isRevealed = store.session.revealSubmissions;

  const sorted = [...store.submissions].reverse();

  const submissions = sorted.map(sub => {
    // If not speaker and reveal mode is FALSE, mask file details
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
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt || null
      };
    }

    return {
      ...sub,
      isRevealed: true
    };
  });

  res.json({
    revealSubmissions: isRevealed,
    total: submissions.length,
    submissions
  });
});

// 7. Get Single Submission Detail (With Blind Mode Protection)
app.get('/api/submissions/:id', (req, res) => {
  const store = getStore();
  const isSpeaker = req.query.view === 'speaker';
  const isRevealed = store.session.revealSubmissions;
  const sub = store.submissions.find(s => s.id === req.params.id);

  if (!sub) {
    return res.status(404).json({ error: 'ไม่พบผลงานนี้' });
  }

  // If not speaker and not revealed, mask sensitive file info
  if (!isSpeaker && !isRevealed) {
    return res.json({
      success: true,
      submission: {
        id: sub.id,
        teamId: sub.teamId,
        teamName: sub.teamName,
        teamColor: sub.teamColor,
        submitterName: sub.submitterName,
        title: sub.title || 'ส่งผลงานแล้ว',
        fileType: sub.fileType,
        isRevealed: false,
        likes: sub.likes || 0,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt || null
      }
    });
  }

  res.json({ success: true, submission: sub });
});

// 8. Upload Submission
app.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, async function (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'ขนาดไฟล์เกินกำหนดสูงสุด (50MB)' });
      }
      return res.status(400).json({ error: 'เกิดข้อผิดพลาดในการอัปโหลด: ' + err.message });
    } else if (err) {
      return res.status(400).json({ error: err.message || 'รูปแบบไฟล์ไม่ถูกต้อง' });
    }

    try {
      const store = getStore();
      const { teamId, submitterName, title, caption } = req.body;

      if (!teamId) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'กรุณาเลือกทีม' });
      }

      if (!req.file || req.file.size === 0) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'กรุณาเลือกไฟล์ที่ต้องการส่ง (ขนาดต้องมากกว่า 0 ไบต์)' });
      }

      // Dynamic session file size check
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
        fileUrl: `/uploads/${req.file.filename}`,
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

// 9. Update / Edit Submission (Speaker)
app.put('/api/submissions/:id', (req, res) => {
  upload.single('file')(req, res, async function (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: 'ขนาดไฟล์เกินกำหนด: ' + err.message });
    } else if (err) {
      return res.status(400).json({ error: err.message || 'รูปแบบไฟล์ไม่ถูกต้อง' });
    }

    try {
      const store = getStore();
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

      if (submitterName !== undefined) sub.submitterName = submitterName.trim() || 'สมาชิกในทีม';
      if (title !== undefined) sub.title = title.trim() || sub.title;
      if (caption !== undefined) sub.caption = caption.trim();

      if (req.file) {
        const oldFilePath = path.join(UPLOADS_DIR, sub.filename);
        if (fs.existsSync(oldFilePath)) {
          try { fs.unlinkSync(oldFilePath); } catch (e) {}
        }

        const isImage = req.file.mimetype ? req.file.mimetype.startsWith('image/') : false;
        sub.filename = req.file.filename;
        sub.originalname = req.file.originalname;
        sub.mimetype = req.file.mimetype || 'application/octet-stream';
        sub.fileType = isImage ? 'image' : 'document';
        sub.size = req.file.size;
        sub.fileUrl = `/uploads/${req.file.filename}`;
      }

      sub.updatedAt = new Date().toISOString();
      await saveStore(store);

      res.json({
        success: true,
        message: 'บันทึกการแก้ไขเรียบร้อยแล้ว',
        submission: sub
      });
    } catch (e) {
      console.error('Update submission error:', e);
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(500).json({ error: 'เกิดข้อผิดพลาดในการแก้ไขผลงาน' });
    }
  });
});

// 10. Like Submission
app.post('/api/submissions/:id/like', async (req, res) => {
  const store = getStore();
  const sub = store.submissions.find(s => s.id === req.params.id);
  if (!sub) {
    return res.status(404).json({ error: 'ไม่พบผลงานนี้' });
  }
  sub.likes = (sub.likes || 0) + 1;
  await saveStore(store);
  res.json({ success: true, likes: sub.likes });
});

// 11. Delete Submission
app.delete('/api/submissions/:id', async (req, res) => {
  const store = getStore();
  const index = store.submissions.findIndex(s => s.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'ไม่พบผลงานนี้' });
  }

  const sub = store.submissions[index];
  const filePath = path.join(UPLOADS_DIR, sub.filename);
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch (e) {}
  }

  store.submissions.splice(index, 1);
  await saveStore(store);
  res.json({ success: true, message: 'ลบผลงานเรียบร้อยแล้ว' });
});

// 12. Export All Submissions as ZIP
app.get('/api/export/zip', (req, res) => {
  const store = getStore();
  if (store.submissions.length === 0) {
    return res.status(400).send('ยังไม่มีผลงานที่ส่งเข้ามา');
  }

  const archive = archiver('zip', { zlib: { level: 9 } });
  const zipName = `workshop_submissions_${Date.now()}.zip`;

  res.attachment(zipName);
  archive.pipe(res);

  let manifestText = `=== สรุปผลงานการส่ง Workshop ===\n`;
  manifestText += `หัวข้อ: ${store.session.title}\n`;
  manifestText += `วันที่ดาวน์โหลด: ${new Date().toLocaleString('th-TH')}\n`;
  manifestText += `จำนวนผลงานทั้งหมด: ${store.submissions.length} ชิ้น\n\n`;

  store.submissions.forEach((sub, idx) => {
    manifestText += `[${idx + 1}] ทีม: ${sub.teamName} | ผู้ส่ง: ${sub.submitterName}\n`;
    manifestText += `    ชื่อผลงาน: ${sub.title}\n`;
    manifestText += `    คำอธิบาย: ${sub.caption || '-'}\n`;
    manifestText += `    ไฟล์: ${sub.originalname} (${sub.filename})\n`;
    manifestText += `    ส่งเมื่อ: ${new Date(sub.createdAt).toLocaleString('th-TH')}\n\n`;

    const filePath = path.join(UPLOADS_DIR, sub.filename);
    if (fs.existsSync(filePath)) {
      const ext = path.extname(sub.filename);
      const cleanTeam = sub.teamName.replace(/[^a-zA-Z0-9_\u0E00-\u0E7F-]/g, '_');
      const cleanTitle = (sub.title || 'untitled').replace(/[^a-zA-Z0-9_\u0E00-\u0E7F-]/g, '_');
      const zipEntryName = `${cleanTeam}/${idx + 1}_${cleanTitle}${ext}`;
      archive.file(filePath, { name: zipEntryName });
    }
  });

  archive.append(manifestText, { name: 'README_สรุปผลงาน.txt' });
  archive.append(JSON.stringify(store, null, 2), { name: 'data_export.json' });

  archive.finalize();
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalNetworkIP();
  console.log(`\n======================================================`);
  console.log(`🚀 AI Workshop Submission Platform Running!`);
  console.log(`💻 Speaker / Projector Main URL:  http://localhost:${PORT}`);
  console.log(`📱 Participant Mobile Join URL:   http://${ip}:${PORT}/join`);
  console.log(`======================================================\n`);
});
