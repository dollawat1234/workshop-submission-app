// Client logic for mobile participant join & submission (Dynamic Team Theming)

const safeStorage = {
  get(key, fallback = null) {
    try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem(key, val); } catch (e) {}
  }
};

let currentSession = null;
let selectedTeamId = safeStorage.get('workshop_selected_team', null);
let savedSubmitterName = safeStorage.get('workshop_submitter_name', '');
let selectedFile = null;
let isSubmitting = false;
let pendingUploadRequestId = null;

document.addEventListener('DOMContentLoaded', () => {
  // Mascots
  const headerMascot = document.getElementById('headerMascotSlot');
  if (headerMascot && MascotSVGs.laptopBlob) {
    headerMascot.innerHTML = MascotSVGs.laptopBlob;
  }

  const popupMascot = document.getElementById('popupMascotSlot');
  if (popupMascot && MascotSVGs.cheeringBlob) {
    popupMascot.innerHTML = MascotSVGs.cheeringBlob;
  }

  const modalMascot = document.getElementById('modalMascotSlot');
  if (modalMascot && MascotSVGs.cheeringBlob) {
    modalMascot.innerHTML = MascotSVGs.cheeringBlob;
  }

  if (window.lucide) lucide.createIcons();

  if (savedSubmitterName) {
    const nameInput = document.getElementById('submitterInput');
    if (nameInput) nameInput.value = savedSubmitterName;
  }

  loadSessionData();
  setupEventListeners();
});

// 1. Fetch Session Info & Teams
async function loadSessionData() {
  try {
    const res = await fetch(`/api/session?_t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Network error');
    const data = await res.json();
    currentSession = data.session;

    renderSessionDetails(currentSession);
    renderTeamDropdown(currentSession.teams || []);
    renderModalTeamList(currentSession.teams || []);

    if (!selectedTeamId) {
      showInitialTeamModal();
    } else {
      const dropdown = document.getElementById('teamSelectDropdown');
      if (dropdown) dropdown.value = selectedTeamId;
      updateTeamIdentityBanner(selectedTeamId);
      applyTeamTheme(selectedTeamId);
      loadMySubmissions();
    }
  } catch (err) {
    console.error('Failed to load session:', err);
  }
}

// 2. Render Session Details
function renderSessionDetails(session) {
  if (session.title) document.getElementById('sessionTitle').textContent = session.title;
  if (session.badge) document.getElementById('sessionBadge').textContent = session.badge;

  const maxMB = session.maxFileSizeMB || 25;
  document.getElementById('fileLimitLabel').textContent = `ไม่เกิน ${maxMB}MB`;
}

// 3. Render Team Dropdown
function renderTeamDropdown(teams) {
  const dropdown = document.getElementById('teamSelectDropdown');
  dropdown.innerHTML = '<option value="" disabled selected>-- กรุณาเลือกทีมของคุณ --</option>';

  teams.forEach(team => {
    const opt = document.createElement('option');
    opt.value = team.id;
    opt.textContent = `${team.name} (ส่งแล้ว ${team.submissionCount || 0} ชิ้น)`;
    if (selectedTeamId === team.id) {
      opt.selected = true;
    }
    dropdown.appendChild(opt);
  });

  if (selectedTeamId) {
    dropdown.value = selectedTeamId;
    updateTeamIdentityBanner(selectedTeamId);
    applyTeamTheme(selectedTeamId);
  }
}

// 4. Update Current Team Visual Identity Banner & Dynamic Form Theme
function updateTeamIdentityBanner(teamId) {
  const banner = document.getElementById('currentTeamIdentityBanner');
  if (!banner) return;

  if (!teamId || !currentSession || !currentSession.teams) {
    banner.classList.add('hidden');
    return;
  }

  const team = currentSession.teams.find(t => t.id === teamId);
  if (!team) {
    banner.classList.add('hidden');
    return;
  }

  const codeEl = document.getElementById('identityTeamCode');
  const nameEl = document.getElementById('identityTeamName');
  const countEl = document.getElementById('identityTeamCount');

  codeEl.textContent = team.code || team.name.charAt(0);
  codeEl.style.backgroundColor = team.color || '#1E5AF6';
  nameEl.textContent = team.name;
  nameEl.style.color = team.color || '#1E5AF6';
  countEl.textContent = `ส่งแล้ว ${team.submissionCount || 0} ชิ้น`;

  banner.style.backgroundColor = team.bg || '#EFF6FF';
  banner.style.borderColor = (team.color || '#1E5AF6') + '40';
  banner.classList.remove('hidden');
}

// 5. Dynamic Form Theming Based on Selected Team Color
function applyTeamTheme(teamId) {
  if (!currentSession || !currentSession.teams || !teamId) return;

  const team = currentSession.teams.find(t => t.id === teamId) || {
    color: '#1E5AF6',
    bg: '#EFF6FF'
  };

  const primaryColor = team.color || '#1E5AF6';
  const bgColor = team.bg || '#EFF6FF';
  const darkerColor = darkenColor(primaryColor, 18);

  // 1. Form Border & Glow
  const form = document.getElementById('submissionForm');
  if (form) {
    form.style.borderColor = primaryColor;
    form.style.boxShadow = `0 12px 28px -6px ${primaryColor}25, 0 4px 12px -2px rgba(11, 27, 61, 0.05)`;
  }

  // 2. Step Badges (1 & 2)
  document.querySelectorAll('.step-badge').forEach(badge => {
    badge.style.backgroundColor = primaryColor;
  });

  // 3. Team Dropdown
  const dropdown = document.getElementById('teamSelectDropdown');
  if (dropdown) {
    dropdown.style.borderColor = primaryColor;
    dropdown.style.backgroundColor = bgColor;
  }

  // 4. Reopen Team Button Text
  const reopenBtn = document.getElementById('reopenTeamModalBtn');
  if (reopenBtn) {
    reopenBtn.style.color = primaryColor;
  }

  // 5. Upload Zone Border & Icon Box
  const dropZone = document.getElementById('dropZone');
  if (dropZone) {
    dropZone.style.borderColor = primaryColor;
    dropZone.style.backgroundColor = bgColor + '40';
  }

  const uploadIconBox = document.getElementById('uploadPromptIconBox');
  if (uploadIconBox) {
    uploadIconBox.style.backgroundColor = bgColor;
    uploadIconBox.style.color = primaryColor;
  }

  const uploadBtnBadge = document.getElementById('uploadChooseBtnBadge');
  if (uploadBtnBadge) {
    uploadBtnBadge.style.color = primaryColor;
    uploadBtnBadge.style.borderColor = primaryColor + '40';
  }

  // 6. Submit Button Gradient & Shadow
  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) {
    submitBtn.style.background = `linear-gradient(135deg, ${primaryColor} 0%, ${darkerColor} 100%)`;
    submitBtn.style.boxShadow = `0 6px 20px -2px ${primaryColor}66`;
  }

  // 7. Textarea & Input Focus Borders
  const captionInput = document.getElementById('captionInput');
  const submitterInput = document.getElementById('submitterInput');
  [captionInput, submitterInput].forEach(inp => {
    if (inp) {
      inp.onfocus = () => {
        inp.style.borderColor = primaryColor;
        inp.style.boxShadow = `0 0 0 2px ${primaryColor}33`;
      };
      inp.onblur = () => {
        inp.style.borderColor = '#E2E8F0';
        inp.style.boxShadow = 'none';
      };
    }
  });
}

// 6. Render Modal Team List
function renderModalTeamList(teams) {
  const container = document.getElementById('modalTeamListContainer');
  container.innerHTML = '';

  teams.forEach(team => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `p-3 rounded-xl border-2 flex items-center gap-2.5 transition-all text-left w-full ${selectedTeamId === team.id ? 'border-blue-600 bg-blue-50/80 shadow-md ring-2 ring-blue-300' : 'border-slate-200 bg-slate-50 hover:bg-blue-50/50 hover:border-blue-300'}`;
    
    if (selectedTeamId === team.id) {
      btn.style.borderColor = team.color || '#1E5AF6';
      btn.style.backgroundColor = team.bg || '#EFF6FF';
    }

    btn.innerHTML = `
      <div class="w-8 h-8 rounded-lg text-white font-black flex items-center justify-center text-sm flex-shrink-0 shadow-sm" style="background-color: ${team.color || '#1E5AF6'};">
        ${team.code || team.name.charAt(0)}
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-xs font-extrabold text-slate-800 truncate">${escapeHtml(team.name)}</p>
        <p class="text-[10px] text-slate-400 font-medium">ส่งแล้ว ${team.submissionCount || 0} ชิ้น</p>
      </div>
    `;

    btn.addEventListener('click', () => {
      selectTeamFromModal(team.id);
    });

    container.appendChild(btn);
  });
}

function showInitialTeamModal() {
  const modal = document.getElementById('initialTeamModal');
  if (modal) modal.classList.remove('hidden');
}

function selectTeamFromModal(teamId) {
  selectedTeamId = teamId;
  safeStorage.set('workshop_selected_team', teamId);

  const dropdown = document.getElementById('teamSelectDropdown');
  if (dropdown) dropdown.value = teamId;

  document.getElementById('teamErrorMsg').classList.add('hidden');
  document.getElementById('initialTeamModal').classList.add('hidden');

  updateTeamIdentityBanner(teamId);
  applyTeamTheme(teamId);
  renderModalTeamList((currentSession && currentSession.teams) || []);
  loadMySubmissions();
}

// 7. Setup Event Listeners
function setupEventListeners() {
  const dropdown = document.getElementById('teamSelectDropdown');
  const reopenTeamBtn = document.getElementById('reopenTeamModalBtn');
  const fileInput = document.getElementById('fileInput');
  const dropZone = document.getElementById('dropZone');
  const form = document.getElementById('submissionForm');
  const removeFileBtn = document.getElementById('removeFileBtn');
  const submitAnotherBtn = document.getElementById('submitAnotherBtn');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const refreshMyBtn = document.getElementById('refreshMySubmissionsBtn');
  const submitterInput = document.getElementById('submitterInput');

  const initialModal = document.getElementById('initialTeamModal');
  const closeInitialBtn = document.getElementById('closeInitialModalBtn');
  const viewModal = document.getElementById('viewSubmissionModal');
  const closeViewBtn = document.getElementById('closeViewModalBtn');
  const closeViewBtn2 = document.getElementById('closeViewModalBtn2');

  // Dropdown Change
  dropdown.addEventListener('change', (e) => {
    selectedTeamId = e.target.value;
    safeStorage.set('workshop_selected_team', selectedTeamId);
    document.getElementById('teamErrorMsg').classList.add('hidden');
    updateTeamIdentityBanner(selectedTeamId);
    applyTeamTheme(selectedTeamId);
    renderModalTeamList((currentSession && currentSession.teams) || []);
    loadMySubmissions();
  });

  if (reopenTeamBtn) reopenTeamBtn.addEventListener('click', showInitialTeamModal);

  // Close Initial Modal
  if (closeInitialBtn) {
    closeInitialBtn.addEventListener('click', () => {
      initialModal.classList.add('hidden');
    });
  }

  initialModal.addEventListener('click', (e) => {
    if (e.target === initialModal) initialModal.classList.add('hidden');
  });

  // Remember Submitter Name
  if (submitterInput) {
    submitterInput.addEventListener('input', (e) => {
      safeStorage.set('workshop_submitter_name', e.target.value.trim());
    });
  }

  // File Upload
  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files && files[0]) {
      handleFileSelected(files[0]);
      fileInput.files = files;
    }
  });

  removeFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearSelectedFile();
  });

  form.addEventListener('submit', handleFormSubmit);

  // Success Modal
  if (submitAnotherBtn) {
    submitAnotherBtn.addEventListener('click', () => {
      document.getElementById('successModal').classList.add('hidden');
      clearSelectedFile();
      document.getElementById('captionInput').value = '';
    });
  }

  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      document.getElementById('successModal').classList.add('hidden');
    });
  }

  if (refreshMyBtn) {
    refreshMyBtn.addEventListener('click', () => {
      loadSessionData();
    });
  }

  // View Modal Close & Backdrop
  if (closeViewBtn) closeViewBtn.addEventListener('click', () => viewModal.classList.add('hidden'));
  if (closeViewBtn2) closeViewBtn2.addEventListener('click', () => viewModal.classList.add('hidden'));
  viewModal.addEventListener('click', (e) => {
    if (e.target === viewModal) viewModal.classList.add('hidden');
  });
}

// 8. File Selection & Validation
function handleFileSelected(file) {
  const maxBytes = ((currentSession && currentSession.maxFileSizeMB) || 25) * 1024 * 1024;
  const fileErrorMsg = document.getElementById('fileErrorMsg');

  if (!file || file.size === 0) {
    fileErrorMsg.textContent = 'ไฟล์ว่างเปล่า (0 Bytes) กรุณาเลือกไฟล์ที่ถูกต้อง';
    fileErrorMsg.classList.remove('hidden');
    clearSelectedFile();
    return;
  }

  if (file.size > maxBytes) {
    fileErrorMsg.textContent = `ขนาดไฟล์เกินกำหนด (สูงสุด ${(currentSession && currentSession.maxFileSizeMB) || 25}MB)`;
    fileErrorMsg.classList.remove('hidden');
    clearSelectedFile();
    return;
  }

  fileErrorMsg.classList.add('hidden');
  selectedFile = file;
  pendingUploadRequestId = null;

  const uploadPrompt = document.getElementById('uploadPrompt');
  const previewWrapper = document.getElementById('filePreviewWrapper');
  const imagePreview = document.getElementById('imagePreview');
  const docPreview = document.getElementById('docPreview');
  const selectedFileName = document.getElementById('selectedFileName');
  const selectedFileSize = document.getElementById('selectedFileSize');

  uploadPrompt.classList.add('hidden');
  previewWrapper.classList.remove('hidden');

  selectedFileName.textContent = file.name;
  selectedFileSize.textContent = formatBytes(file.size);

  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      imagePreview.src = e.target.result;
      imagePreview.classList.remove('hidden');
      docPreview.classList.add('hidden');
    };
    reader.readAsDataURL(file);
  } else {
    imagePreview.classList.add('hidden');
    docPreview.classList.remove('hidden');
    document.getElementById('docFileName').textContent = file.name;
  }

  if (window.lucide) lucide.createIcons();
}

function clearSelectedFile() {
  selectedFile = null;
  pendingUploadRequestId = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('uploadPrompt').classList.remove('hidden');
  document.getElementById('filePreviewWrapper').classList.add('hidden');
  document.getElementById('imagePreview').src = '';
  document.getElementById('fileErrorMsg').classList.add('hidden');
  document.getElementById('uploadProgressContainer').classList.add('hidden');
}

function createUploadRequestId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `upload_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
}

function restoreSubmitButton() {
  const submitBtn = document.getElementById('submitBtn');
  if (!submitBtn) return;
  submitBtn.disabled = false;
  submitBtn.innerHTML = `
    <i data-lucide="send" class="w-5 h-5"></i>
    <span>ส่งผลงานเลย! 🚀</span>
  `;
  if (window.lucide) lucide.createIcons();
}

function finishUploadUi() {
  isSubmitting = false;
  restoreSubmitButton();
  document.getElementById('uploadProgressContainer').classList.add('hidden');
}

function sendUploadRequest(formData, attempt = 0) {
  const progressBar = document.getElementById('uploadProgressBar');
  const progressPercent = document.getElementById('uploadProgressPercent');
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/upload', true);

  xhr.upload.onprogress = function (e) {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      progressBar.style.width = `${pct}%`;
      progressPercent.textContent = `${pct}%`;
    }
  };

  xhr.onload = function () {
    let result;
    try {
      result = JSON.parse(xhr.responseText);
    } catch (err) {
      finishUploadUi();
      alert('ไม่สามารถประมวลผลคำตอบจากเซิร์ฟเวอร์ได้');
      return;
    }

    // A conflict means another participant committed first. The server
    // rebases most conflicts; this bounded retry covers a final CAS conflict
    // and reuses the same idempotency key to prevent duplicate submissions.
    if (xhr.status === 409 && attempt < 2) {
      document.getElementById('submitBtn').querySelector('span').textContent = 'กำลังลองบันทึกใหม่...';
      progressBar.style.width = '0%';
      progressPercent.textContent = '0%';
      window.setTimeout(() => sendUploadRequest(formData, attempt + 1), 350 * (attempt + 1));
      return;
    }

    finishUploadUi();
    if (xhr.status >= 200 && xhr.status < 300 && result.success) {
      const sub = result.submission;
      document.getElementById('successSummaryTeam').textContent = sub.teamName || 'ทีมที่คุณเลือก';
      document.getElementById('successSummaryFile').textContent = sub.originalname || (selectedFile && selectedFile.name) || 'ไฟล์ผลงาน';
      document.getElementById('successSummaryTime').textContent = formatTime(sub.createdAt);

      triggerCelebration();
      document.getElementById('successModal').classList.remove('hidden');
      clearSelectedFile();
      document.getElementById('captionInput').value = '';
      loadSessionData();
    } else {
      alert(result.error || 'เกิดข้อผิดพลาดในการส่งผลงาน');
    }
  };

  xhr.onerror = function () {
    finishUploadUi();
    alert('การเชื่อมต่อขัดข้อง กรุณากดส่งอีกครั้ง ระบบจะป้องกันผลงานซ้ำให้อัตโนมัติ');
  };

  xhr.ontimeout = xhr.onerror;
  xhr.send(formData);
}

// 9. Handle Form Submit
function handleFormSubmit(e) {
  e.preventDefault();

  if (isSubmitting) return;

  const teamDropdown = document.getElementById('teamSelectDropdown');
  const teamId = teamDropdown.value;
  const teamErrorMsg = document.getElementById('teamErrorMsg');
  const fileErrorMsg = document.getElementById('fileErrorMsg');
  const submitBtn = document.getElementById('submitBtn');
  const progressContainer = document.getElementById('uploadProgressContainer');
  const progressBar = document.getElementById('uploadProgressBar');
  const progressPercent = document.getElementById('uploadProgressPercent');

  if (!teamId) {
    teamErrorMsg.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  teamErrorMsg.classList.add('hidden');

  if (!selectedFile) {
    fileErrorMsg.textContent = 'กรุณาแนบไฟล์รูปภาพหรือเอกสาร';
    fileErrorMsg.classList.remove('hidden');
    return;
  }
  fileErrorMsg.classList.add('hidden');

  const formData = new FormData();
  pendingUploadRequestId = pendingUploadRequestId || createUploadRequestId();
  formData.append('teamId', teamId);
  formData.append('submitterName', document.getElementById('submitterInput').value.trim());
  formData.append('caption', document.getElementById('captionInput').value.trim());
  formData.append('clientRequestId', pendingUploadRequestId);
  formData.append('file', selectedFile);

  isSubmitting = true;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `
    <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
    <span>กำลังอัปโหลด...</span>
  `;

  progressContainer.classList.remove('hidden');
  progressBar.style.width = '0%';
  progressPercent.textContent = '0%';

  sendUploadRequest(formData);
}

// 10. Load Submissions for Selected Team (View Only)
async function loadMySubmissions() {
  const container = document.getElementById('mySubmissionsList');
  if (!selectedTeamId) {
    container.innerHTML = `<p class="text-xs text-slate-400 text-center py-2 font-medium">เลือกทีมเพื่อดูผลงานที่ส่งแล้ว</p>`;
    return;
  }

  try {
    const res = await fetch(`/api/submissions?teamId=${encodeURIComponent(selectedTeamId)}&_t=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const mySubmissions = (data.submissions || []).filter(s => s.teamId === selectedTeamId);

    if (mySubmissions.length === 0) {
      container.innerHTML = `<p class="text-xs text-slate-400 text-center py-2 font-medium">ทีมนี้ยังไม่ได้ส่งผลงานในรอบนี้</p>`;
      return;
    }

    container.innerHTML = '';

    mySubmissions.forEach((sub, idx) => {
      const item = document.createElement('div');
      item.className = 'flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100 shadow-sm';
      item.innerHTML = `
        <div class="flex items-center gap-2 min-w-0">
          <div class="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style="background-color: ${sub.teamColor || '#1E5AF6'};">
            ${idx + 1}
          </div>
          <div class="truncate">
            <p class="text-xs font-bold text-slate-800 truncate">${escapeHtml(sub.title || sub.originalname || 'ผลงาน')}</p>
            <p class="text-[10px] text-slate-400 font-medium">${escapeHtml(sub.submitterName || 'สมาชิก')} • ${formatTime(sub.createdAt)}</p>
          </div>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <button type="button" class="view-sub-btn inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 rounded-lg text-xs font-bold shadow-sm transition-all" data-id="${sub.id}">
            <i data-lucide="eye" class="w-3.5 h-3.5"></i>
            <span>ดูผลงาน</span>
          </button>
        </div>
      `;

      item.querySelector('.view-sub-btn').addEventListener('click', () => openViewSubmissionModal(sub.id));
      container.appendChild(item);
    });

    if (window.lucide) lucide.createIcons();
  } catch (e) {
    console.error('Error fetching submissions:', e);
  }
}

// 11. Open View-Only Modal
async function openViewSubmissionModal(submissionId) {
  try {
    const res = await fetch(`/api/submissions/${submissionId}?_t=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json();
    if (!data.success || !data.submission) throw new Error('Not found');

    const sub = data.submission;
    const imgEl = document.getElementById('viewModalImage');
    const docBox = document.getElementById('viewModalDoc');
    const docName = document.getElementById('viewModalDocName');
    const badge = document.getElementById('viewModalTeamBadge');

    badge.textContent = sub.teamName;
    badge.style.backgroundColor = sub.teamColor || '#1E5AF6';

    if (sub.fileType === 'image') {
      imgEl.src = sub.fileUrl;
      imgEl.classList.remove('hidden');
      docBox.classList.add('hidden');
    } else {
      imgEl.classList.add('hidden');
      docBox.classList.remove('hidden');
      docName.textContent = sub.originalname || 'document';
    }

    document.getElementById('viewModalSubmitter').textContent = sub.submitterName || 'สมาชิกในทีม';
    document.getElementById('viewModalCaption').textContent = sub.caption || 'ไม่มีคำอธิบายเพิ่มเติม';
    document.getElementById('viewModalTime').textContent = `ส่งเมื่อ: ${formatTime(sub.createdAt)} น.`;

    document.getElementById('viewSubmissionModal').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    alert('ไม่สามารถเปิดดูผลงานได้');
  }
}

// Helpers
function formatBytes(bytes, decimals = 1) {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}

function darkenColor(hex, percent) {
  let num = parseInt(hex.replace('#', ''), 16);
  let amt = Math.round(2.55 * percent);
  let R = (num >> 16) - amt;
  let G = (num >> 8 & 0x00FF) - amt;
  let B = (num & 0x0000FF) - amt;
  return '#' + (0x1000000 + (R < 0 ? 0 : R) * 0x10000 + (G < 0 ? 0 : G) * 0x100 + (B < 0 ? 0 : B)).toString(16).slice(1);
}

function triggerCelebration() {
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 70,
      spread: 60,
      origin: { y: 0.6 },
      colors: ['#1E5AF6', '#60A5FA', '#93C5FD', '#F59E0B', '#10B981']
    });
  }
}
