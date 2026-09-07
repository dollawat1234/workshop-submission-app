(function () {
  'use strict';

  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  const panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));
  const toast = document.getElementById('toast');
  const qrDialog = document.getElementById('qrDialog');
  const pageUrl = window.location.href.split('#')[0];

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  function selectTab(tabNumber, moveFocus) {
    tabs.forEach((tab) => {
      const active = tab.dataset.tab === String(tabNumber);
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    panels.forEach((panel) => {
      const active = panel.id === `panel-${tabNumber}`;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
    if (moveFocus) document.getElementById(`tab-${tabNumber}`)?.focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.tab, false));
    tab.addEventListener('keydown', (event) => {
      let nextIndex = index;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabs.length - 1;
      if (nextIndex !== index) {
        event.preventDefault();
        selectTab(tabs[nextIndex].dataset.tab, true);
      }
    });
  });

  document.querySelectorAll('.copy-prompt').forEach((button) => {
    button.addEventListener('click', async () => {
      const target = document.getElementById(button.dataset.promptTarget);
      if (!target) return;
      const value = target.textContent.trim();
      try {
        await navigator.clipboard.writeText(value);
        showToast('คัดลอก Prompt แล้ว — อย่าลืมแทนค่าที่อยู่ใน [วงเล็บ]');
      } catch (error) {
        const range = document.createRange();
        range.selectNodeContents(target);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        showToast('เลือก Prompt ให้แล้ว กดคัดลอกได้เลย');
      }
    });
  });

  function openQr() {
    const container = document.getElementById('qrContainer');
    const url = document.getElementById('qrUrl');
    if (url) url.textContent = pageUrl;
    if (container && !container.childElementCount && window.QRCode) {
      new QRCode(container, { text: pageUrl, width: 220, height: 220, colorDark: '#14203d', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    }
    if (qrDialog?.showModal) qrDialog.showModal();
    else qrDialog?.setAttribute('open', '');
  }

  document.getElementById('openQr')?.addEventListener('click', openQr);
  document.getElementById('copyUrl')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      showToast('คัดลอกลิงก์หน้าคลังโจทย์แล้ว');
    } catch (error) {
      showToast(pageUrl);
    }
  });

  if (window.lucide) window.lucide.createIcons();
})();
