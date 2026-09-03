// Speaker & Projector Main Screen Controller JS (Left-to-Right Team Columns & Realtime Public QR)

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
let fullDataRequestSequence = 0;
let lastAppliedFullDataRequest = 0;
let pollRequestSequence = 0;
let lastAppliedPollRequest = 0;
let dataLoadEpoch = 0;
let fullFetchInFlight = 0;
let pollInFlight = false;
let activePollController = null;
let mutationSequence = 0;
let hasLoadedDashboard = false;
const pendingDeletedIds = new Set();
const SPEAKER_KEY_STORAGE = 'teamgameSpeakerKey';
let speakerKeyPrompted = false;

function getSpeakerKey() {
  let key = sessionStorage.getItem(SPEAKER_KEY_STORAGE) || '';
  if (!key && !speakerKeyPrompted) {
    speakerKeyPrompted = true;
    key = (window.prompt('กรุณากรอกรหัสวิทยากรเพื่อจัดการระบบ') || '').trim();
    if (key) sessionStorage.setItem(SPEAKER_KEY_STORAGE, key);
  }
  return key;
}

function withSpeakerAuth(init = {}) {
  const headers = new Headers(init.headers || {});
  const key = getSpeakerKey();
  if (key) headers.set('X-TeamGame-Speaker-Key', key);
  return { ...init, headers };
}

async function fetchSpeaker(url, init = {}, retryAuth = true) {
  const response = await fetch(url, withSpeakerAuth(init));
  if ((response.status === 401 || response.status === 503) && retryAuth) {
    sessionStorage.removeItem(SPEAKER_KEY_STORAGE);
    speakerKeyPrompted = false;
    const key = getSpeakerKey();
    if (key) return fetchSpeaker(url, init, false);
  }
  return response;
}

function showSpeakerAuthMessage(status) {
  const banner = document.getElementById('speakerAuthMessage');
  const message = document.getElementById('speakerAuthMessageText');
  const totalCountEl = document.getElementById('headerTotalCount');
  if (!banner || !message) return;

  message.textContent = status === 503
    ? 'ระบบยังไม่ได้ตั้งค่ารหัสวิทยากร กรุณาติดต่อผู้ดูแลระบบ'
    : 'กรุณากรอกรหัสวิทยากรเพื่อดูและจัดการผลงานบนกระดาน';
  banner.classList.remove('hidden');
  if (totalCountEl) totalCountEl.textContent = 'ต้องใช้รหัสวิทยากร';
}

function hideSpeakerAuthMessage() {
  const banner = document.getElementById('speakerAuthMessage');
  if (banner) banner.classList.add('hidden');
}

function retrySpeakerAuth() {
  sessionStorage.removeItem(SPEAKER_KEY_STORAGE);
  speakerKeyPrompted = false;
  fetchAllData();
}

// 1. Global Reveal Mode Handlers
window.setRevealMode = async function (shouldReveal) {
  currentSession.revealSubmissions = Boolean(shouldReveal);
  renderHeaderAndSession();
  renderTeamColumns();

  if (shouldReveal && typeof confetti === 'function') {
    confetti({
      particleCount: 120,
      spread: 90,
      origin: { y: 0.4 },
      colors: ['#1E5AF6', '#10B981', '#F59E0B', '#60A5FA', '#EC4899']
    });
  }

  try {
    const res = await fetchSpeaker('/api/session/toggle-reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reveal: shouldReveal })
    });

    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
    if (data && typeof data.revealSubmissions === 'boolean') {
      currentSession.revealSubmissions = data.revealSubmissions;
      renderHeaderAndSession();
      renderTeamColumns();
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

  // Initial immediate QR render with current website origin
  currentNetworkUrl = `${window.location.origin}/join`;
  renderQRCodes(currentNetworkUrl);

  setupEventListeners();
  fetchAllData();
  fetchNetworkInfo();
  startAutoPoll();
});

// 2. Fetch All Data
function submissionSignature(sub) {
  return [
    sub.id,
    sub.likes || 0,
    sub.updatedAt || '',
    sub.createdAt || '',
    sub.teamId || '',
    sub.title || '',
    sub.caption || '',
    sub.originalname || '',
    sub.fileType || '',
    sub.size || ''
  ].join('::');
}

function pruneConfirmedDeletions(incomingSubmissions) {
  const incomingIds = new Set(incomingSubmissions.map(sub => sub.id));
  for (const deletedId of pendingDeletedIds) {
    if (!incomingIds.has(deletedId)) pendingDeletedIds.delete(deletedId);
  }
}

function applyDashboardData(session, incomingSubmissions, options) {
  const {
    source,
    requestId,
    requestMutationSequence,
    loadEpoch
  } = options;

  // An older request must never overwrite a newer request or a post-mutation view.
  if (requestMutationSequence !== mutationSequence || loadEpoch !== dataLoadEpoch) {
    return false;
  }

  if (source === 'full') {
    if (requestId < lastAppliedFullDataRequest) return false;
    lastAppliedFullDataRequest = requestId;
  } else {
    if (requestId < lastAppliedPollRequest) return false;
    lastAppliedPollRequest = requestId;
  }

  pruneConfirmedDeletions(incomingSubmissions);
  currentSession = session || currentSession;
  allSubmissions = incomingSubmissions.filter(sub => !pendingDeletedIds.has(sub.id));
  hasLoadedDashboard = true;
  renderHeaderAndSession();
  renderTeamColumns();
  return true;
}

async function fetchAllData() {
  const requestId = ++fullDataRequestSequence;
  const requestMutationSequence = mutationSequence;
  const loadEpoch = ++dataLoadEpoch;
  fullFetchInFlight += 1;
  if (activePollController) activePollController.abort();
  const spinner = document.getElementById('refreshSpinner');
  if (spinner) spinner.classList.add('animate-spin');

  try {
    const controller = new AbortController();
    const [sessionRes, subsRes] = await Promise.all([
      fetch(`/api/session?_t=${Date.now()}`, { cache: 'no-store', signal: controller.signal }),
      fetchSpeaker(`/api/submissions?view=speaker&_t=${Date.now()}`, { cache: 'no-store', signal: controller.signal })
    ]);

    if (subsRes.status === 401 || subsRes.status === 503) {
      showSpeakerAuthMessage(subsRes.status);
    } else if (sessionRes.ok && subsRes.ok) {
      hideSpeakerAuthMessage();
    }

    if (!sessionRes.ok || !subsRes.ok) throw new Error('Network error');

    const sessionData = await sessionRes.json();
    const subsData = await subsRes.json();

    applyDashboardData(
      sessionData.session || currentSession,
      subsData.submissions || [],
      {
        source: 'full',
        requestId,
        requestMutationSequence,
        loadEpoch
      }
    );
  } catch (err) {
    console.error('Error fetching speaker data:', err);
  } finally {
    fullFetchInFlight = Math.max(0, fullFetchInFlight - 1);
    if (spinner) {
      setTimeout(() => spinner.classList.remove('animate-spin'), 350);
    }
  }
}

// 3. Fetch Network Info & QR Code (Strictly Prioritizes the Real Public Website URL)
async function fetchNetworkInfo() {
  let targetUrl = `${window.location.origin}/join`;

  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    try {
      const res = await fetch('/api/network-info');
      const data = await res.json();
      if (data.publicUrl) {
        targetUrl = `${data.publicUrl}/join`;
      } else if (data.isPublic && data.currentUrl) {
        targetUrl = data.currentUrl;
      } else if (data.networkUrl) {
        targetUrl = data.networkUrl;
      }
    } catch (e) {
      targetUrl = `${window.location.origin}/join`;
    }
  }

  currentNetworkUrl = targetUrl;
  renderQRCodes(currentNetworkUrl);
}

function renderQRCodes(url) {
  const sideContainer = document.getElementById('sideQrContainer');
  if (sideContainer) {
    sideContainer.innerHTML = '';
    const sideUrlEl = document.getElementById('sideQrUrl');
    if (sideUrlEl) sideUrlEl.textContent = url;
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
    const modalUrlEl = document.getElementById('qrDisplayUrl');
    if (modalUrlEl) modalUrlEl.textContent = url;
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

// 4. Render Header, Badges & Segmented Control
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

// 5. Render Left-to-Right Team Columns (Side-by-Side: Team A | Team B | Team C | Team D)
function renderTeamColumns() {
  const container = document.getElementById('teamColumnsContainer');
  if (!container) return;
  container.innerHTML = '';

  const teams = currentSession.teams || [];
  const isRevealed = Boolean(currentSession && currentSession.revealSubmissions);

  teams.forEach((team, teamIndex) => {
    const teamSubmissions = allSubmissions.filter(s => s.teamId === team.id);
    const count = teamSubmissions.length;
    const teamColor = team.color || '#1E5AF6';
    const teamBg = team.bg || '#EFF6FF';

    const col = document.createElement('div');
    col.className = 'team-kanban-column flex flex-col bg-white rounded-2xl border-2 shadow-sm transition-all overflow-hidden';
    col.style.borderColor = teamColor + '50';

    // Column Header (Top of each team column)
    const headerPanel = document.createElement('div');
    headerPanel.className = 'p-3.5 flex items-center justify-between border-b-2 flex-shrink-0';
    headerPanel.style.backgroundColor = teamBg;
    headerPanel.style.borderColor = teamColor + '30';

    headerPanel.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-9 h-9 rounded-xl text-white font-black text-sm flex items-center justify-center flex-shrink-0 shadow-md" style="background-color: ${teamColor};">
          ${team.code || team.name.charAt(0)}
        </div>
        <div class="truncate">
          <span class="text-[9px] font-black tracking-wider uppercase opacity-75 block" style="color: ${teamColor};">ทีมที่ ${teamIndex + 1}</span>
          <h3 class="text-xs sm:text-sm font-black text-slate-900 truncate leading-snug">${escapeHtml(team.name)}</h3>
        </div>
      </div>

      <div class="text-right flex-shrink-0">
        <span class="text-[11px] font-black px-2.5 py-1 rounded-full text-white shadow-sm inline-flex items-center gap-1" style="background-color: ${teamColor};">
          <i data-lucide="folder-check" class="w-3 h-3"></i>
          <span>${count} ชิ้น</span>
        </span>
      </div>
    `;

    // Column Body (Vertical cards container)
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'team-column-cards space-y-3 p-3 flex-1 overflow-y-auto max-h-[75vh]';

    if (count === 0) {
      cardsContainer.innerHTML = `
        <div class="w-full flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl text-center min-h-[180px]" style="border-color: ${teamColor}30; background-color: ${teamBg}20;">
          <div class="w-8 h-8 rounded-full flex items-center justify-center mb-1.5" style="background-color: ${teamBg}; color: ${teamColor};">
            <i data-lucide="hourglass" class="w-4 h-4"></i>
          </div>
          <p class="text-xs font-bold text-slate-600">กำลังรอผลงาน ⏳</p>
          <p class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(team.name)} ยังไม่ได้ส่ง</p>
        </div>
      `;
    } else {
      teamSubmissions.forEach((sub, subIdx) => {
        const card = document.createElement('div');
        card.className = 'workshop-card submission-card overflow-hidden bg-white border border-slate-200 rounded-xl flex flex-col justify-between shadow-sm';

        if (!isRevealed) {
          // 🔒 Blind / Contest Mode Card
          card.innerHTML = `
            <div class="mystery-blur h-36 flex flex-col items-center justify-center p-2 text-center text-white relative cursor-pointer" title="คลิกเพื่อดูรายละเอียด">
              <div class="mb-1 scale-90">
                ${MascotSVGs.mysteryBlob}
              </div>
              <p class="text-[11px] font-black uppercase tracking-wider text-amber-300">ส่งผลงานแล้ว ✨</p>
              <p class="text-[10px] text-blue-100 font-mono">ชิ้นที่ ${count - subIdx}</p>
            </div>

            <div class="p-3 space-y-1.5 bg-white">
              <div class="flex items-center justify-between text-xs">
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
          // 👁️ Showcase Mode Card (Image First)
          const isImage = sub.fileType === 'image';
          card.innerHTML = `
            <div class="relative bg-slate-900 h-36 overflow-hidden group cursor-pointer thumbnail-click-area">
              ${isImage ? `
                <img src="${sub.fileUrl}" alt="${escapeHtml(sub.title)}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105">
              ` : `
                <div class="w-full h-full flex flex-col items-center justify-center text-white p-2">
                  <i data-lucide="file-text" class="w-8 h-8 text-blue-400 mb-1"></i>
                  <span class="text-[10px] font-bold truncate max-w-full">${escapeHtml(sub.originalname)}</span>
                </div>
              `}
              
              <div class="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                <button type="button" class="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg" title="ขยายเต็มจอ">
                  <i data-lucide="maximize-2" class="w-3.5 h-3.5"></i>
                </button>
                <a href="${sub.fileUrl}" download class="p-1.5 bg-white/20 hover:bg-white/30 text-white rounded-full shadow-lg" title="ดาวน์โหลด">
                  <i data-lucide="download" class="w-3.5 h-3.5"></i>
                </a>
              </div>

              <div class="absolute top-1.5 left-1.5">
                <span class="px-2 py-0.5 rounded-md text-[10px] font-black text-white shadow-md" style="background-color: ${teamColor};">
                  #${count - subIdx}
                </span>
              </div>
            </div>

            <div class="p-3 space-y-1 bg-white flex-1 flex flex-col justify-between">
              <div>
                <div class="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                  <span class="truncate font-bold text-slate-700">โดย: ${escapeHtml(sub.submitterName || 'สมาชิก')}</span>
                  <span class="font-mono">${formatTime(sub.createdAt)}</span>
                </div>
                <h4 class="text-xs font-black text-slate-900 leading-tight line-clamp-1">${escapeHtml(sub.title || 'ไม่มีชื่อ')}</h4>
                ${sub.caption ? `<p class="text-[10px] text-slate-600 mt-0.5 line-clamp-2">${escapeHtml(sub.caption)}</p>` : ''}
              </div>

              <div class="pt-2 mt-1 border-t border-slate-100 flex items-center justify-between">
                <button type="button" class="like-btn text-[11px] font-bold text-rose-500 hover:text-rose-600 flex items-center gap-1 p-0.5 rounded-lg hover:bg-rose-50 transition-colors" data-id="${sub.id}">
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

        cardsContainer.appendChild(card);
      });
    }

    col.appendChild(headerPanel);
    col.appendChild(cardsContainer);
    container.appendChild(col);
  });

  if (window.lucide) lucide.createIcons();
}

// 6. Like Submission
async function likeSubmission(id) {
  const sub = allSubmissions.find(s => s.id === id);
  const previousLikes = sub ? (sub.likes || 0) : null;
  if (sub) {
    sub.likes = (sub.likes || 0) + 1;
    const likeCountEl = document.getElementById('presentationLikeCount');
    if (likeCountEl) likeCountEl.textContent = `${sub.likes} ถูกใจ`;
    renderTeamColumns();
  }

  try {
    const res = await fetch(`/api/submissions/${id}/like?_t=${Date.now()}`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
    if (typeof confetti === 'function') {
      confetti({ particleCount: 30, spread: 50, origin: { y: 0.8 } });
    }
  } catch (e) {
    console.error('Error liking submission:', e);
    if (sub && previousLikes !== null) {
      sub.likes = previousLikes;
      renderTeamColumns();
    }
    fetchAllData();
  }
}

// 7. Delete Submission
async function deleteSubmission(id) {
  if (!confirm('คุณต้องการลบผลงานนี้ใช่หรือไม่?')) return;

  // Keep this tombstone until a fresh response confirms that the item is gone.
  // This prevents an in-flight/stale polling response from putting the card back.
  mutationSequence += 1;
  pendingDeletedIds.add(id);
  allSubmissions = allSubmissions.filter(s => s.id !== id);
  renderHeaderAndSession();
  renderTeamColumns();

  try {
    const res = await fetchSpeaker(`/api/submissions/${id}?_t=${Date.now()}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'ไม่สามารถลบผลงานได้');
    await fetchAllData();
  } catch (e) {
    console.error('Error deleting submission:', e);
    alert('ไม่สามารถลบผลงานได้: ' + e.message);
    pendingDeletedIds.delete(id);
    await fetchAllData();
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
    const res = await fetchSpeaker(`/api/submissions/${submissionId}?view=speaker`);
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
    const res = await fetchSpeaker(`/api/submissions/${id}`, {
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
      mutationSequence += 1;
      allSubmissions.forEach(sub => pendingDeletedIds.add(sub.id));
      allSubmissions = [];
      renderHeaderAndSession();
      renderTeamColumns();
      try {
        const res = await fetchSpeaker(`/api/session/reset?_t=${Date.now()}`, { method: 'POST', cache: 'no-store' });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
        alert(data.message);
        await fetchAllData();
      } catch (e) {
        alert('ไม่สามารถรีเซ็ตได้: ' + e.message);
        pendingDeletedIds.clear();
        await fetchAllData();
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
  const settingTeamCount = document.getElementById('settingTeamCount');
  const retrySpeakerAuthBtn = document.getElementById('retrySpeakerAuthBtn');

  if (openSettingsBtn) openSettingsBtn.addEventListener('click', openSettingsModal);
  if (closeSettingsBtn && settingsModal) closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
  if (cancelSettingsBtn && settingsModal) cancelSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
  if (settingsForm) settingsForm.addEventListener('submit', handleSaveSettings);
  if (addTeamSettingBtn) addTeamSettingBtn.addEventListener('click', addTeamInputRow);
  if (settingTeamCount) {
    settingTeamCount.addEventListener('input', () => {
      if (settingTeamCount.value !== '') syncTeamRowsToCount();
    });
    settingTeamCount.addEventListener('change', syncTeamRowsToCount);
  }
  if (retrySpeakerAuthBtn) retrySpeakerAuthBtn.addEventListener('click', retrySpeakerAuth);
}

// 12. Settings Logic
const MIN_TEAM_COUNT = 1;
const MAX_TEAM_COUNT = 12;

function getSettingsTeamsContainer() {
  return document.getElementById('settingsTeamsContainer');
}

function clampTeamCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return MIN_TEAM_COUNT;
  return Math.min(MAX_TEAM_COUNT, Math.max(MIN_TEAM_COUNT, parsed));
}

function updateTeamCountFromRows() {
  const container = getSettingsTeamsContainer();
  const countInput = document.getElementById('settingTeamCount');
  if (container && countInput) countInput.value = String(container.querySelectorAll('.team-setting-row').length);
}

function getNextAvailableTeamId(container) {
  const usedIds = new Set(
    Array.from(container.querySelectorAll('.team-setting-row'))
      .map(row => row.dataset.teamId)
      .filter(Boolean)
  );
  let index = 1;
  while (usedIds.has(`team-${index}`)) index += 1;
  return `team-${index}`;
}

function syncTeamRowsToCount() {
  const container = getSettingsTeamsContainer();
  const countInput = document.getElementById('settingTeamCount');
  if (!container || !countInput || countInput.value === '') return;

  const desiredCount = clampTeamCount(countInput.value);
  countInput.value = String(desiredCount);

  while (container.querySelectorAll('.team-setting-row').length < desiredCount) {
    addTeamInputRow();
  }
  while (container.querySelectorAll('.team-setting-row').length > desiredCount) {
    container.lastElementChild.remove();
  }
  updateTeamCountFromRows();
}

function openSettingsModal() {
  if (!currentSession) return;
  document.getElementById('settingTitle').value = currentSession.title || '';
  document.getElementById('settingBadge').value = currentSession.badge || '';
  document.getElementById('settingMaxFileSize').value = currentSession.maxFileSizeMB || 25;
  document.getElementById('settingTeamCount').value = String((currentSession.teams || []).length || MIN_TEAM_COUNT);

  renderSettingsTeamRows();
  document.getElementById('settingsModal').classList.remove('hidden');
}

function renderSettingsTeamRows() {
  const container = getSettingsTeamsContainer();
  if (!container) return;
  container.innerHTML = '';

  const teams = currentSession.teams || [];
  teams.forEach((team, idx) => {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 team-setting-row bg-slate-50 p-2 rounded-xl border border-slate-200';
    row.dataset.teamId = team.id || `team-${idx + 1}`;
    row.innerHTML = `
      <input type="text" class="setting-team-name flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 focus:outline-none focus:border-brand-500" value="${escapeHtml(team.name)}" placeholder="ชื่อทีม">
      <input type="color" class="setting-team-color w-8 h-8 rounded-lg border border-slate-200 cursor-pointer p-0.5" value="${team.color || '#1E5AF6'}">
      <button type="button" class="remove-team-setting-btn p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors" title="ลบทีมนี้">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
      </button>
    `;

    const removeBtn = row.querySelector('.remove-team-setting-btn');
    removeBtn.addEventListener('click', () => {
      const allRows = container.querySelectorAll('.team-setting-row');
      if (allRows.length <= 1) {
        alert('ต้องมีอย่างน้อย 1 ทีม');
        return;
      }
      row.remove();
      updateTeamCountFromRows();
    });

    container.appendChild(row);
  });
  updateTeamCountFromRows();
}

function addTeamInputRow() {
  const container = getSettingsTeamsContainer();
  if (!container) return;
  const currentCount = container.querySelectorAll('.team-setting-row').length;
  if (currentCount >= MAX_TEAM_COUNT) {
    alert(`กำหนดได้สูงสุด ${MAX_TEAM_COUNT} ทีม`);
    return;
  }
  const newIdx = currentCount + 1;
  const palette = ['#1E5AF6', '#8B5CF6', '#10B981', '#F59E0B', '#EC4899', '#06B6D4', '#6366F1', '#14B8A6'];
  const color = palette[(newIdx - 1) % palette.length];

  const row = document.createElement('div');
  row.className = 'flex items-center gap-2 team-setting-row bg-slate-50 p-2 rounded-xl border border-slate-200';
  row.dataset.teamId = getNextAvailableTeamId(container);
  row.innerHTML = `
    <input type="text" class="setting-team-name flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 focus:outline-none focus:border-brand-500" value="ทีม ${newIdx}" placeholder="ชื่อทีม">
    <input type="color" class="setting-team-color w-8 h-8 rounded-lg border border-slate-200 cursor-pointer p-0.5" value="${color}">
    <button type="button" class="remove-team-setting-btn p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors" title="ลบทีมนี้">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
    </button>
  `;

  const removeBtn = row.querySelector('.remove-team-setting-btn');
  removeBtn.addEventListener('click', () => {
    const allRows = container.querySelectorAll('.team-setting-row');
    if (allRows.length <= 1) {
      alert('ต้องมีอย่างน้อย 1 ทีม');
      return;
    }
    row.remove();
    updateTeamCountFromRows();
  });

  container.appendChild(row);
  updateTeamCountFromRows();
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const title = document.getElementById('settingTitle').value.trim();
  const badge = document.getElementById('settingBadge').value.trim();
  const maxFileSizeMB = parseInt(document.getElementById('settingMaxFileSize').value) || 25;
  const teamCountInput = document.getElementById('settingTeamCount');

  if (!teamCountInput || teamCountInput.value === '') {
    alert('กรุณาระบุจำนวนทีม');
    return;
  }

  const requestedTeamCount = clampTeamCount(teamCountInput.value);
  teamCountInput.value = String(requestedTeamCount);
  syncTeamRowsToCount();

  const rows = document.querySelectorAll('#settingsTeamsContainer .team-setting-row');
  const teams = [];
  rows.forEach((r, idx) => {
    const name = r.querySelector('.setting-team-name').value.trim() || `ทีม ${idx + 1}`;
    const color = r.querySelector('.setting-team-color').value || '#1E5AF6';
    teams.push({
      id: r.dataset.teamId || `team-${idx + 1}`,
      name,
      code: String(idx + 1),
      color: color,
      bg: color + '15'
    });
  });

  if (!hasLoadedDashboard) {
    await fetchAllData();
    if (!hasLoadedDashboard) {
      alert('กรุณายืนยันรหัสวิทยากรและโหลดข้อมูลก่อนเปลี่ยนจำนวนทีม');
      return;
    }
  }

  const nextTeamIds = new Set(teams.map(team => team.id));
  const hiddenSubmissionCount = allSubmissions.filter(sub => !nextTeamIds.has(sub.teamId)).length;
  if (hiddenSubmissionCount > 0) {
    alert(`บันทึกไม่ได้ เพราะจำนวนทีมใหม่นี้จะซ่อนผลงานเดิม ${hiddenSubmissionCount} ชิ้น กรุณาย้ายผลงานไปทีมอื่นก่อน หรือใช้เมนูรีเซ็ตเมื่อเริ่มรอบใหม่`);
    return;
  }

  try {
    const res = await fetchSpeaker(`/api/session?_t=${Date.now()}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, badge, maxFileSizeMB, teams })
    });

    if (res.ok) {
      document.getElementById('settingsModal').classList.add('hidden');
      fetchAllData();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'ไม่สามารถบันทึกได้');
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการบันทึก');
  }
}

// 13. Auto Poll with Columns Sync
// 13. Auto Poll with Columns Sync
function startAutoPoll() {
  if (autoPollTimer) clearInterval(autoPollTimer);
  autoPollTimer = setInterval(() => {
    const editModal = document.getElementById('speakerEditModal');
    const settingsModal = document.getElementById('settingsModal');
    if ((editModal && !editModal.classList.contains('hidden')) || (settingsModal && !settingsModal.classList.contains('hidden'))) {
      return;
    }

    if (fullFetchInFlight > 0 || pollInFlight) return;
    if (!hasLoadedDashboard) return;

    const requestId = ++pollRequestSequence;
    const requestMutationSequence = mutationSequence;
    const loadEpoch = dataLoadEpoch;
    const controller = new AbortController();
    activePollController = controller;
    pollInFlight = true;

    fetchSpeaker(`/api/submissions?view=speaker&_t=${Date.now()}`, { cache: 'no-store', signal: controller.signal })
      .then(res => {
        if (!res.ok) {
          if (res.status === 401 || res.status === 503) showSpeakerAuthMessage(res.status);
          throw new Error(`HTTP ${res.status}`);
        }
        hideSpeakerAuthMessage();
        return res.json();
      })
      .then(data => {
        const incomingSubs = data.submissions || [];
        if (requestMutationSequence !== mutationSequence || loadEpoch !== dataLoadEpoch) return;
        const pendingDeletedCount = pendingDeletedIds.size;
        pruneConfirmedDeletions(incomingSubs);
        const incomingSignature = incomingSubs.map(submissionSignature).join('|');
        const currentSignature = allSubmissions.map(submissionSignature).join('|');
        const revealChanged = Boolean(data.revealSubmissions) !== Boolean(currentSession.revealSubmissions);
        const itemsChanged = incomingSignature !== currentSignature;
        const tombstonesChanged = pendingDeletedIds.size !== pendingDeletedCount;

        if (revealChanged || itemsChanged || tombstonesChanged) {
          applyDashboardData(
            { ...currentSession, revealSubmissions: Boolean(data.revealSubmissions) },
            incomingSubs,
            {
              source: 'poll',
              requestId,
              requestMutationSequence,
              loadEpoch
            }
          );
        }
      })
      .catch(() => {})
      .finally(() => {
        pollInFlight = false;
        if (activePollController === controller) activePollController = null;
      });
  }, 2500);
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
