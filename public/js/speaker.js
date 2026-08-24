// Speaker & Projector Main Screen Controller JS (Team-by-Team Kanban Board & Live Battle View)

let currentSession = {
  revealSubmissions: false,
  title: 'AI Workshop: มาทำงานร่วมกับ ChatGPT กัน',
  badge: 'AI WORKSHOP',
  teams: []
};
let allSubmissions = [];
let currentSlideIndex = 0;
let sideQrInstance = null;
let modalQrInstance = null;
let currentNetworkUrl = window.location.origin + '/join';
let autoPollTimer = null;
let isTheaterMode = false;

// 1. Global Reveal Mode Handlers
window.setRevealMode = async function (shouldReveal) {
  currentSession.revealSubmissions = Boolean(shouldReveal);
  renderHeaderAndSession();
  renderKanbanBoard();

  if (shouldReveal && typeof confetti === 'function') {
    confetti({
      particleCount: 120,
      spread: 90,
      origin: { y: 0.4 },
      colors: ['#1E5AF6', '#10B981', '#F59E0B', '#60A5FA', '#EC4899']
    });
  }

  try {
    const res = await fetch('/api/session/toggle-reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reveal: shouldReveal })
    });

    const data = await res.json();
    if (data && typeof data.revealSubmissions === 'boolean') {
      currentSession.revealSubmissions = data.revealSubmissions;
      renderHeaderAndSession();
      renderKanbanBoard();
    }
  } catch (err) {
    console.error('Error toggling reveal mode:', err);
    fetchAllData();
  }
};

window.toggleRevealMode = function () {
  const nextState = !currentSession.revealSubmissions;
  window.setRevealMode(nextState);
};

window.fetchAllData = fetchAllData;

document.addEventListener('DOMContentLoaded', () => {
  // Mascots
  const sidebarMascot = document.getElementById('sidebarMascotSlot');
  if (sidebarMascot && MascotSVGs.cheeringBlob) {
    sidebarMascot.innerHTML = MascotSVGs.cheeringBlob;
  }

  if (window.lucide) lucide.createIcons();

  setupEventListeners();
  fetchAllData();
  fetchNetworkInfo();
  startAutoPoll();
});

// 2. Fetch All Data
async function fetchAllData() {
  const spinner = document.getElementById('refreshSpinner');
  if (spinner) spinner.classList.add('animate-spin');

  try {
    const [sessionRes, subsRes] = await Promise.all([
      fetch('/api/session'),
      fetch('/api/submissions?view=speaker')
    ]);

    if (!sessionRes.ok || !subsRes.ok) throw new Error('Network error');

    const sessionData = await sessionRes.json();
    const subsData = await subsRes.json();

    currentSession = sessionData.session || currentSession;
    allSubmissions = subsData.submissions || [];

    renderHeaderAndSession();
    renderKanbanBoard();
  } catch (err) {
    console.error('Error fetching speaker data:', err);
  } finally {
    if (spinner) {
      setTimeout(() => spinner.classList.remove('animate-spin'), 350);
    }
  }
}

// 3. Fetch Network Info & QR Code
async function fetchNetworkInfo() {
  try {
    const res = await fetch('/api/network-info');
    const data = await res.json();
    if (data.networkUrl) {
      currentNetworkUrl = data.networkUrl;
    }
    renderQRCodes(currentNetworkUrl);
  } catch (e) {
    console.warn('Using window.location for QR', e);
    renderQRCodes(window.location.origin + '/join');
  }
}

function renderQRCodes(url) {
  const sideContainer = document.getElementById('sideQrContainer');
  if (sideContainer) {
    sideContainer.innerHTML = '';
    document.getElementById('sideQrUrl').textContent = url;
    sideQrInstance = new QRCode(sideContainer, {
      text: url,
      width: 150,
      height: 150,
      colorDark: '#0B1B3D',
      colorLight: '#FFFFFF',
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  const modalContainer = document.getElementById('qrCodeContainer');
  if (modalContainer) {
    modalContainer.innerHTML = '';
    document.getElementById('qrDisplayUrl').textContent = url;
    modalQrInstance = new QRCode(modalContainer, {
      text: url,
      width: 420,
      height: 420,
      colorDark: '#0B1B3D',
      colorLight: '#FFFFFF',
      correctLevel: QRCode.CorrectLevel.M
    });
  }
}

// 4. Render Header & Badges
function renderHeaderAndSession() {
  if (!currentSession) return;

  const headerTitle = document.getElementById('headerTitle');
  const headerBadge = document.getElementById('headerBadge');
  const totalCountEl = document.getElementById('headerTotalCount');

  if (headerTitle && currentSession.title) headerTitle.textContent = currentSession.title;
  if (headerBadge && currentSession.badge) headerBadge.textContent = currentSession.badge;

  const totalSubs = allSubmissions.length;
  if (totalCountEl) totalCountEl.textContent = `${totalSubs} ผลงาน`;

  const isRevealed = Boolean(currentSession.revealSubmissions);
  const setBlindBtn = document.getElementById('setBlindModeBtn');
  const setShowcaseBtn = document.getElementById('setShowcaseModeBtn');
  const revealBadge = document.getElementById('revealModeBadge');

  if (setBlindBtn && setShowcaseBtn) {
    if (isRevealed) {
      setBlindBtn.className = 'segmented-btn px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer text-slate-700 hover:bg-white/60';
      setShowcaseBtn.className = 'segmented-btn active-showcase px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-md text-white bg-emerald-600';
    } else {
      setBlindBtn.className = 'segmented-btn active-blind px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-md text-white bg-amber-500';
      setShowcaseBtn.className = 'segmented-btn px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer text-slate-700 hover:bg-white/60';
    }
  }

  if (revealBadge) {
    if (isRevealed) {
      revealBadge.className = 'text-xs font-black px-3.5 py-1.5 rounded-full flex items-center gap-1.5 bg-emerald-100 text-emerald-800 border-2 border-emerald-300 cursor-pointer hover:bg-emerald-200 transition-all shadow-sm';
      revealBadge.innerHTML = `
        <i data-lucide="eye" class="w-4 h-4 text-emerald-600"></i>
        <span>โหมดโชว์ผลงาน (เปิดภาพ ✨) - คลิกเพื่อสลับ</span>
      `;
    } else {
      revealBadge.className = 'text-xs font-black px-3.5 py-1.5 rounded-full flex items-center gap-1.5 bg-amber-100 text-amber-900 border-2 border-amber-300 cursor-pointer hover:bg-amber-200 transition-all shadow-sm';
      revealBadge.innerHTML = `
        <i data-lucide="lock" class="w-4 h-4 text-amber-600"></i>
        <span>โหมดแข่งขัน (ซ่อนภาพ 🔒) - คลิกเพื่อสลับ</span>
      `;
    }
  }

  if (window.lucide) lucide.createIcons();
}

// 5. Render Team-by-Team Kanban Board (Multi-Column Swimlanes)
function renderKanbanBoard() {
  const container = document.getElementById('kanbanBoardContainer');
  if (!container) return;
  container.innerHTML = '';

  const teams = currentSession.teams || [];
  const isRevealed = Boolean(currentSession && currentSession.revealSubmissions);

  // Dynamic grid column class based on team count
  if (teams.length === 1) container.className = 'grid grid-cols-1 gap-4 items-start w-full';
  else if (teams.length === 2) container.className = 'grid grid-cols-1 md:grid-cols-2 gap-4 items-start w-full';
  else if (teams.length === 3) container.className = 'grid grid-cols-1 md:grid-cols-3 gap-4 items-start w-full';
  else container.className = 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start w-full';

  teams.forEach(team => {
    // Filter submissions for this specific team (Newest First)
    const teamSubmissions = allSubmissions.filter(s => s.teamId === team.id);
    const count = teamSubmissions.length;
    const teamColor = team.color || '#1E5AF6';
    const teamBg = team.bg || '#EFF6FF';

    const col = document.createElement('div');
    col.className = 'kanban-team-column overflow-hidden flex flex-col bg-white rounded-2xl border-2 shadow-sm transition-all';
    col.style.borderColor = teamColor + '40';

    // 1. Column Header (Team Name + Color Bar + Live Count Badge)
    const headerHtml = `
      <div class="kanban-column-header flex items-center justify-between p-3.5 border-b-2" style="background-color: ${teamBg}; border-color: ${teamColor}30;">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-8 h-8 rounded-xl font-black text-sm text-white flex items-center justify-center flex-shrink-0 shadow-md" style="background-color: ${teamColor};">
            ${team.code || team.name.charAt(0)}
          </div>
          <div class="truncate">
            <h3 class="text-xs sm:text-sm font-black text-slate-900 truncate">${escapeHtml(team.name)}</h3>
            <p class="text-[10px] text-slate-500 font-medium">${count > 0 ? `ล่าสุด ${formatTime(teamSubmissions[0].createdAt)}` : 'ยังไม่มีผลงาน'}</p>
          </div>
        </div>
        <div class="flex-shrink-0">
          <span class="text-xs font-black px-2.5 py-1 rounded-full text-white shadow-sm flex items-center gap-1" style="background-color: ${teamColor};">
            <span>${count}</span>
            <span class="text-[10px] font-medium opacity-90">ชิ้น</span>
          </span>
        </div>
      </div>
    `;

    // 2. Cards Body Container (Vertically Stacked)
    const cardsBody = document.createElement('div');
    cardsBody.className = 'p-3 space-y-3 flex-1 flex flex-col overflow-y-auto max-h-[75vh]';

    if (count === 0) {
      // Empty slot state
      cardsBody.innerHTML = `
        <div class="p-8 text-center border-2 border-dashed rounded-xl flex-1 flex flex-col items-center justify-center" style="border-color: ${teamColor}30; background-color: ${teamBg}20;">
          <div class="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 mb-2" style="background-color: ${teamBg}; color: ${teamColor};">
            <i data-lucide="clock-3" class="w-5 h-5"></i>
          </div>
          <p class="text-xs font-bold text-slate-600">กำลังรอผลงาน ⏳</p>
          <p class="text-[10px] text-slate-400 mt-0.5">สมาชิกทีมสามารถสแกนส่งงานได้เลย</p>
        </div>
      `;
    } else {
      teamSubmissions.forEach((sub, subIdx) => {
        const card = document.createElement('div');
        card.className = 'workshop-card submission-card overflow-hidden bg-white border border-slate-200 rounded-xl flex flex-col justify-between shadow-sm';

        if (!isRevealed) {
          // 🔒 Blind / Contest Mode Card
          card.innerHTML = `
            <div class="mystery-blur h-40 flex flex-col items-center justify-center p-3 text-center text-white relative cursor-pointer" title="คลิกเพื่อดูรายละเอียด">
              <div class="mb-1 scale-90">
                ${MascotSVGs.mysteryBlob}
              </div>
              <p class="text-[11px] font-black uppercase tracking-wider text-amber-300">ส่งผลงานแล้ว ✨</p>
              <p class="text-[9px] text-blue-100 font-mono">ชิ้นที่ ${count - subIdx}</p>
            </div>

            <div class="p-3 space-y-1.5 bg-white">
              <div class="flex items-center justify-between text-[11px]">
                <span class="font-extrabold text-slate-800 truncate">โดย: ${escapeHtml(sub.submitterName || 'สมาชิก')}</span>
                <span class="text-slate-400 font-mono text-[10px]">${formatTime(sub.createdAt)}</span>
              </div>
              <div class="flex items-center justify-between pt-1 border-t border-slate-100">
                <span class="text-[10px] font-bold text-slate-400">โหมดแข่งขัน</span>
                <button type="button" class="speaker-edit-btn text-blue-600 hover:text-blue-800 p-1 rounded-md hover:bg-blue-50" data-id="${sub.id}" title="แก้ไขข้อมูล">
                  <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>
          `;

          card.querySelector('.mystery-blur').addEventListener('click', () => {
            const fullIdx = allSubmissions.findIndex(s => s.id === sub.id);
            openPresentation(allSubmissions, fullIdx >= 0 ? fullIdx : 0);
          });

          card.querySelector('.speaker-edit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openSpeakerEditModal(sub.id);
          });
        } else {
          // 👁️ Showcase Mode Card (Image Thumbnail)
          const isImage = sub.fileType === 'image';
          card.innerHTML = `
            <div class="relative bg-slate-900 h-40 overflow-hidden group cursor-pointer thumbnail-click-area">
              ${isImage ? `
                <img src="${sub.fileUrl}" alt="${escapeHtml(sub.title)}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105">
              ` : `
                <div class="w-full h-full flex flex-col items-center justify-center text-white p-3">
                  <i data-lucide="file-text" class="w-10 h-10 text-blue-400 mb-1"></i>
                  <span class="text-xs font-bold truncate max-w-full">${escapeHtml(sub.originalname)}</span>
                </div>
              `}
              
              <div class="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button type="button" class="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg" title="ขยายเต็มจอ">
                  <i data-lucide="maximize-2" class="w-3.5 h-3.5"></i>
                </button>
                <a href="${sub.fileUrl}" download class="p-2 bg-white/20 hover:bg-white/30 text-white rounded-full shadow-lg" title="ดาวน์โหลด">
                  <i data-lucide="download" class="w-3.5 h-3.5"></i>
                </a>
              </div>

              <div class="absolute top-2 left-2">
                <span class="px-2 py-0.5 rounded-md text-[10px] font-black text-white shadow-md" style="background-color: ${teamColor};">
                  #${count - subIdx}
                </span>
              </div>
            </div>

            <div class="p-3 space-y-1 bg-white flex-1 flex flex-col justify-between">
              <div>
                <div class="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                  <span class="truncate">โดย: ${escapeHtml(sub.submitterName || 'สมาชิก')}</span>
                  <span class="font-mono">${formatTime(sub.createdAt)}</span>
                </div>
                <h4 class="text-xs font-black text-slate-900 leading-snug line-clamp-1">${escapeHtml(sub.title || 'ไม่มีชื่อ')}</h4>
                ${sub.caption ? `<p class="text-[11px] text-slate-600 mt-0.5 line-clamp-2">${escapeHtml(sub.caption)}</p>` : ''}
              </div>

              <div class="pt-2 mt-1 border-t border-slate-100 flex items-center justify-between">
                <button type="button" class="like-btn text-xs font-bold text-rose-500 hover:text-rose-600 flex items-center gap-1 p-0.5 rounded-lg hover:bg-rose-50 transition-colors" data-id="${sub.id}">
                  <i data-lucide="heart" class="w-3.5 h-3.5 ${sub.likes > 0 ? 'fill-current' : ''}"></i>
                  <span>${sub.likes || 0}</span>
                </button>

                <div class="flex items-center gap-1">
                  <button type="button" class="open-slide-btn p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="นำเสนองาน">
                    <i data-lucide="presentation" class="w-3.5 h-3.5"></i>
                  </button>
                  <button type="button" class="speaker-edit-btn p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors" data-id="${sub.id}" title="แก้ไขข้อมูล">
                    <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                  </button>
                  <button type="button" class="delete-sub-btn p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-colors" data-id="${sub.id}" title="ลบผลงานนี้">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                  </button>
                </div>
              </div>
            </div>
          `;

          const thumb = card.querySelector('.thumbnail-click-area');
          if (thumb) {
            thumb.addEventListener('click', () => {
              const fullIdx = allSubmissions.findIndex(s => s.id === sub.id);
              openPresentation(allSubmissions, fullIdx >= 0 ? fullIdx : 0);
            });
          }

          const openSlideBtn = card.querySelector('.open-slide-btn');
          if (openSlideBtn) {
            openSlideBtn.addEventListener('click', () => {
              const fullIdx = allSubmissions.findIndex(s => s.id === sub.id);
              openPresentation(allSubmissions, fullIdx >= 0 ? fullIdx : 0);
            });
          }

          const editBtn = card.querySelector('.speaker-edit-btn');
          if (editBtn) {
            editBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              openSpeakerEditModal(sub.id);
            });
          }

          const likeBtn = card.querySelector('.like-btn');
          if (likeBtn) {
            likeBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              likeSubmission(sub.id);
            });
          }

          const deleteBtn = card.querySelector('.delete-sub-btn');
          if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              deleteSubmission(sub.id);
            });
          }
        }

        cardsBody.appendChild(card);
      });
    }

    col.innerHTML = headerHtml;
    col.appendChild(cardsBody);
    container.appendChild(col);
  });

  if (window.lucide) lucide.createIcons();
}

// 6. Like Submission
async function likeSubmission(id) {
  const sub = allSubmissions.find(s => s.id === id);
  if (sub) {
    sub.likes = (sub.likes || 0) + 1;
    const likeCountEl = document.getElementById('presentationLikeCount');
    if (likeCountEl) likeCountEl.textContent = `${sub.likes} ถูกใจ`;
    renderKanbanBoard();
  }

  try {
    const res = await fetch(`/api/submissions/${id}/like`, { method: 'POST' });
    if (res.ok) {
      if (typeof confetti === 'function') {
        confetti({ particleCount: 30, spread: 50, origin: { y: 0.8 } });
      }
    }
  } catch (e) {
    console.error('Error liking submission:', e);
  }
}

// 7. Delete Submission
async function deleteSubmission(id) {
  if (!confirm('คุณต้องการลบผลงานนี้ใช่หรือไม่?')) return;
  try {
    const res = await fetch(`/api/submissions/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchAllData();
    }
  } catch (e) {
    alert('ไม่สามารถลบผลงานได้');
  }
}

// 8. Fullscreen Presentation Lightbox
let activePresentationList = [];

function openPresentation(list, index) {
  activePresentationList = list;
  currentSlideIndex = index;
  renderCurrentSlide();
  document.getElementById('presentationModal').classList.remove('hidden');
}

function renderCurrentSlide() {
  if (!activePresentationList || activePresentationList.length === 0) return;
  const sub = activePresentationList[currentSlideIndex];
  if (!sub) return;

  const imgEl = document.getElementById('presentationImage');
  const docBox = document.getElementById('presentationDocBox');
  const docName = document.getElementById('presentationDocName');
  const docLink = document.getElementById('presentationDocLink');
  const downloadBtn = document.getElementById('presentationDownloadBtn');

  if (sub.fileType === 'image') {
    imgEl.src = sub.fileUrl;
    imgEl.classList.remove('hidden');
    docBox.classList.add('hidden');
  } else {
    imgEl.classList.add('hidden');
    docBox.classList.remove('hidden');
    docName.textContent = sub.originalname || 'document.pdf';
    docLink.href = sub.fileUrl;
  }

  downloadBtn.href = sub.fileUrl;
  downloadBtn.download = sub.originalname || 'download';

  const teamBadge = document.getElementById('presentationTeamBadge');
  teamBadge.textContent = sub.teamName;
  teamBadge.style.backgroundColor = sub.teamColor || '#1E5AF6';

  document.getElementById('presentationIndex').textContent = `${currentSlideIndex + 1} / ${activePresentationList.length}`;
  document.getElementById('presentationTitle').textContent = sub.title || 'ไม่มีชื่อผลงาน';
  document.getElementById('presentationAuthor').textContent = `โดย: ${sub.submitterName || 'สมาชิกในทีม'}`;
  document.getElementById('presentationCaption').textContent = sub.caption || 'ไม่มีคำอธิบายเพิ่มเติม';
  document.getElementById('presentationTime').textContent = `ส่งเมื่อ: ${formatTime(sub.createdAt)} น.`;
  document.getElementById('presentationLikeCount').textContent = `${sub.likes || 0} ถูกใจ`;

  const presLikeBtn = document.getElementById('presentationLikeBtn');
  presLikeBtn.onclick = () => {
    likeSubmission(sub.id);
  };

  const presEditBtn = document.getElementById('presentationEditBtn');
  presEditBtn.onclick = () => {
    openSpeakerEditModal(sub.id);
  };

  if (window.lucide) lucide.createIcons();
}

function nextSlide() {
  if (currentSlideIndex < activePresentationList.length - 1) {
    currentSlideIndex++;
    renderCurrentSlide();
  } else {
    currentSlideIndex = 0;
    renderCurrentSlide();
  }
}

function prevSlide() {
  if (currentSlideIndex > 0) {
    currentSlideIndex--;
    renderCurrentSlide();
  } else {
    currentSlideIndex = activePresentationList.length - 1;
    renderCurrentSlide();
  }
}

function toggleTheaterMode() {
  isTheaterMode = !isTheaterMode;
  const sidebar = document.getElementById('presentationSidebar');
  const btnText = document.getElementById('theaterModeBtnText');

  if (isTheaterMode) {
    sidebar.classList.add('hidden');
    btnText.textContent = 'แสดงแถบข้อมูล (ปกติ)';
  } else {
    sidebar.classList.remove('hidden');
    btnText.textContent = 'ขยายภาพ 100% (โรงละคร)';
  }
}

// 9. Speaker Edit Modal Logic
async function openSpeakerEditModal(submissionId) {
  try {
    const res = await fetch(`/api/submissions/${submissionId}?view=speaker`);
    const data = await res.json();
    if (!data.success || !data.submission) throw new Error('Not found');

    const sub = data.submission;
    document.getElementById('speakerEditId').value = sub.id;
    document.getElementById('speakerEditSubmitterInput').value = sub.submitterName || '';
    document.getElementById('speakerEditTitleInput').value = sub.title || '';
    document.getElementById('speakerEditCaptionInput').value = sub.caption || '';
    document.getElementById('speakerEditFileInput').value = '';

    const teamSelect = document.getElementById('speakerEditTeamSelect');
    teamSelect.innerHTML = '';
    (currentSession.teams || []).forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      if (t.id === sub.teamId) opt.selected = true;
      teamSelect.appendChild(opt);
    });

    document.getElementById('speakerEditModal').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    alert('ไม่สามารถโหลดข้อมูลเพื่อแก้ไขได้');
  }
}

async function handleSpeakerEditSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('speakerEditId').value;
  const teamId = document.getElementById('speakerEditTeamSelect').value;
  const submitterName = document.getElementById('speakerEditSubmitterInput').value.trim();
  const title = document.getElementById('speakerEditTitleInput').value.trim();
  const caption = document.getElementById('speakerEditCaptionInput').value.trim();
  const fileInput = document.getElementById('speakerEditFileInput');
  const saveBtn = document.getElementById('saveSpeakerEditBtn');

  const formData = new FormData();
  formData.append('teamId', teamId);
  formData.append('submitterName', submitterName);
  formData.append('title', title);
  formData.append('caption', caption);

  if (fileInput.files && fileInput.files[0]) {
    formData.append('file', fileInput.files[0]);
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'กำลังบันทึก...';

  try {
    const res = await fetch(`/api/submissions/${id}`, {
      method: 'PUT',
      body: formData
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'เกิดข้อผิดพลาด');

    document.getElementById('speakerEditModal').classList.add('hidden');
    fetchAllData();
  } catch (err) {
    alert(err.message || 'ไม่สามารถแก้ไขได้');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'บันทึกการแก้ไข';
  }
}

// 10. Copy To Clipboard
function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      alert('คัดลอกลิงก์สำเร็จแล้ว!');
    }).catch(() => {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    alert('คัดลอกลิงก์สำเร็จแล้ว!');
  } catch (err) {
    alert('ไม่สามารถคัดลอกอัตโนมัติได้: ' + text);
  }
  document.body.removeChild(textArea);
}

// 11. Setup Event Listeners
function setupEventListeners() {
  const openBigQrBtn = document.getElementById('openBigQrBtn');
  const sideQrBox = document.getElementById('sideQrBox');
  const closeQrModalBtn = document.getElementById('closeQrModalBtn');
  const qrModal = document.getElementById('qrModal');

  if (openBigQrBtn) openBigQrBtn.addEventListener('click', () => qrModal.classList.remove('hidden'));
  if (sideQrBox) sideQrBox.addEventListener('click', () => qrModal.classList.remove('hidden'));
  if (closeQrModalBtn) closeQrModalBtn.addEventListener('click', () => qrModal.classList.add('hidden'));

  if (qrModal) {
    qrModal.addEventListener('click', (e) => {
      if (e.target === qrModal) qrModal.classList.add('hidden');
    });
  }

  const copyUrlBtn = document.getElementById('copyUrlBtn');
  if (copyUrlBtn) {
    copyUrlBtn.addEventListener('click', () => {
      copyToClipboard(currentNetworkUrl);
    });
  }

  const changeUrlPromptBtn = document.getElementById('changeUrlPromptBtn');
  if (changeUrlPromptBtn) {
    changeUrlPromptBtn.addEventListener('click', () => {
      const custom = prompt('ระบุ URL หรือ IP ที่ต้องการสร้าง QR Code:', currentNetworkUrl);
      if (custom && custom.trim()) {
        currentNetworkUrl = custom.trim();
        renderQRCodes(currentNetworkUrl);
      }
    });
  }

  const moreMenuBtn = document.getElementById('moreMenuBtn');
  const moreMenuDropdown = document.getElementById('moreMenuDropdown');
  if (moreMenuBtn && moreMenuDropdown) {
    moreMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moreMenuDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
      moreMenuDropdown.classList.add('hidden');
    });
  }

  const exportZipBtn = document.getElementById('exportZipBtn');
  if (exportZipBtn) {
    exportZipBtn.addEventListener('click', () => {
      window.location.href = '/api/export/zip';
    });
  }

  const resetSubmissionsBtn = document.getElementById('resetSubmissionsBtn');
  if (resetSubmissionsBtn) {
    resetSubmissionsBtn.addEventListener('click', async () => {
      if (!confirm('⚠️ คำเตือน: คุณต้องการรีเซ็ตผลงานทั้งหมดเพื่อเริ่มรอบใหม่ใช่หรือไม่? (ระบบจะสำรองข้อมูลเดิมไว้ให้อัตโนมัติ)')) return;
      try {
        const res = await fetch('/api/session/reset', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          alert(data.message);
          fetchAllData();
        }
      } catch (e) {
        alert('ไม่สามารถรีเซ็ตได้');
      }
    });
  }

  // Presentation Modal & Clicker Navigation
  const presModal = document.getElementById('presentationModal');
  const closePresBtn = document.getElementById('closePresentationBtn');
  const nextSlideBtn = document.getElementById('nextSlideBtn');
  const prevSlideBtn = document.getElementById('prevSlideBtn');
  const toggleTheaterBtn = document.getElementById('toggleTheaterModeBtn');

  if (closePresBtn && presModal) closePresBtn.addEventListener('click', () => presModal.classList.add('hidden'));
  if (nextSlideBtn) nextSlideBtn.addEventListener('click', nextSlide);
  if (prevSlideBtn) prevSlideBtn.addEventListener('click', prevSlide);
  if (toggleTheaterBtn) toggleTheaterBtn.addEventListener('click', toggleTheaterMode);

  window.addEventListener('keydown', (e) => {
    if (!presModal || presModal.classList.contains('hidden')) return;

    if (
      e.key === 'ArrowRight' ||
      e.key === ' ' ||
      e.key === 'PageDown' ||
      e.key === 'ArrowDown'
    ) {
      e.preventDefault();
      nextSlide();
    } else if (
      e.key === 'ArrowLeft' ||
      e.key === 'PageUp' ||
      e.key === 'ArrowUp'
    ) {
      e.preventDefault();
      prevSlide();
    } else if (e.key === 'Escape') {
      presModal.classList.add('hidden');
    }
  });

  // Speaker Edit Modal
  const speakerEditModal = document.getElementById('speakerEditModal');
  const closeEditBtn = document.getElementById('closeSpeakerEditBtn');
  const cancelEditBtn = document.getElementById('cancelSpeakerEditBtn');
  const editForm = document.getElementById('speakerEditForm');

  if (closeEditBtn && speakerEditModal) closeEditBtn.addEventListener('click', () => speakerEditModal.classList.add('hidden'));
  if (cancelEditBtn && speakerEditModal) cancelEditBtn.addEventListener('click', () => speakerEditModal.classList.add('hidden'));
  if (editForm) editForm.addEventListener('submit', handleSpeakerEditSubmit);

  // Settings Modal
  const settingsModal = document.getElementById('settingsModal');
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
  const settingsForm = document.getElementById('settingsForm');
  const addTeamSettingBtn = document.getElementById('addTeamSettingBtn');

  if (openSettingsBtn) openSettingsBtn.addEventListener('click', openSettingsModal);
  if (closeSettingsBtn && settingsModal) closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
  if (cancelSettingsBtn && settingsModal) cancelSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
  if (settingsForm) settingsForm.addEventListener('submit', handleSaveSettings);
  if (addTeamSettingBtn) addTeamSettingBtn.addEventListener('click', addTeamInputRow);
}

// 12. Settings Logic
function openSettingsModal() {
  if (!currentSession) return;
  document.getElementById('settingTitle').value = currentSession.title || '';
  document.getElementById('settingBadge').value = currentSession.badge || '';
  document.getElementById('settingMaxFileSize').value = currentSession.maxFileSizeMB || 25;

  const container = document.getElementById('settingsTeamsContainer');
  container.innerHTML = '';

  (currentSession.teams || []).forEach(team => {
    addTeamInputRow(team);
  });

  document.getElementById('settingsModal').classList.remove('hidden');
}

function addTeamInputRow(teamData = null) {
  const container = document.getElementById('settingsTeamsContainer');
  const count = container.children.length;
  const nextChar = String.fromCharCode(65 + count);

  const team = teamData || {
    id: `team-${String.fromCharCode(97 + count)}`,
    name: `ทีม ${nextChar}`,
    code: nextChar,
    color: '#1E5AF6',
    bg: '#EFF6FF'
  };

  const row = document.createElement('div');
  row.className = 'team-input-row flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200';
  row.innerHTML = `
    <input type="text" class="team-code-input w-12 px-2 py-1 text-center font-bold rounded border border-slate-300 text-xs" value="${escapeHtml(team.code)}" placeholder="โค้ด">
    <input type="text" class="team-name-input flex-1 px-2 py-1 font-bold rounded border border-slate-300 text-xs" value="${escapeHtml(team.name)}" placeholder="ชื่อทีม">
    <input type="color" class="team-color-input w-8 h-8 rounded cursor-pointer border-0 p-0" value="${team.color || '#1E5AF6'}">
    <button type="button" class="remove-team-btn p-1 text-slate-400 hover:text-rose-500">
      <i data-lucide="x" class="w-4 h-4"></i>
    </button>
  `;

  row.querySelector('.remove-team-btn').addEventListener('click', () => {
    row.remove();
  });

  container.appendChild(row);
  if (window.lucide) lucide.createIcons();
}

async function handleSaveSettings(e) {
  e.preventDefault();

  const title = document.getElementById('settingTitle').value.trim();
  const badge = document.getElementById('settingBadge').value.trim();
  const maxFileSizeMB = document.getElementById('settingMaxFileSize').value;

  const rows = document.querySelectorAll('.team-input-row');
  const teams = [];
  rows.forEach((row, idx) => {
    const code = row.querySelector('.team-code-input').value.trim() || String.fromCharCode(65 + idx);
    const name = row.querySelector('.team-name-input').value.trim() || `ทีม ${code}`;
    const color = row.querySelector('.team-color-input').value || '#1E5AF6';
    teams.push({
      id: `team-${String.fromCharCode(97 + idx)}`,
      name,
      code,
      color,
      bg: '#EFF6FF'
    });
  });

  try {
    const res = await fetch('/api/session', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, badge, maxFileSizeMB, teams })
    });

    if (res.ok) {
      document.getElementById('settingsModal').classList.add('hidden');
      fetchAllData();
    } else {
      alert('ไม่สามารถบันทึกได้');
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการบันทึก');
  }
}

// 13. Auto Poll with Kanban Re-render
function startAutoPoll() {
  if (autoPollTimer) clearInterval(autoPollTimer);
  autoPollTimer = setInterval(() => {
    const editModal = document.getElementById('speakerEditModal');
    const settingsModal = document.getElementById('settingsModal');
    if ((editModal && !editModal.classList.contains('hidden')) || (settingsModal && !settingsModal.classList.contains('hidden'))) {
      return;
    }

    fetch('/api/submissions?view=speaker')
      .then(res => res.json())
      .then(data => {
        const revealChanged = Boolean(data.revealSubmissions) !== Boolean(currentSession.revealSubmissions);
        const countChanged = data.submissions && (data.submissions.length !== allSubmissions.length);

        if (revealChanged || countChanged) {
          currentSession.revealSubmissions = Boolean(data.revealSubmissions);
          allSubmissions = data.submissions || [];
          renderHeaderAndSession();
          renderKanbanBoard();
        }
      })
      .catch(() => {});
  }, 3500);
}

// Helpers
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
