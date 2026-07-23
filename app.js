'use strict';

const state = {
  projects: [],
  filtered: [],
  owners: [],
  summary: null,
  selectedProject: null,
  session: { token: sessionStorage.getItem('peaSessionToken') || '', owner: sessionStorage.getItem('peaSessionOwner') || '' },
  images: [],
  map: null,
  markersLayer: null,
  activeView: 'map'
};

const el = {};

document.addEventListener('DOMContentLoaded', init);

function init() {
  cacheElements();
  bindEvents();
  initMap();
  loadData();
}

function cacheElements() {
  [
    'appLoading','lastUpdated','refreshBtn','reportBtn','loginBtn','progressText','progressBar','statTotal','statEquipment',
    'statPending','statProcess','statPass','statFail','statCost','searchInput','ownerFilter','statusFilter','coordinateFilter',
    'clearFiltersBtn','ownerSummaryList','resultCount','mapView','listView','projectList','emptyState','modalBackdrop','detailModal',
    'detailTitle','detailBody','detailMapBtn','projectReportBtn','editProjectBtn','loginModal','loginForm','loginOwner','loginPin',
    'editModal','editForm','editTitle','editStatus','editWorkDate','editRecorder','editNote','editCoordinates','getLocationBtn',
    'imageInput','imagePreview','saveProjectBtn','reportModal','reportForm','reportType','reportOwnerField','reportOwner','reportCount','toast'
  ].forEach(id => { el[id] = document.getElementById(id); });
}

function bindEvents() {
  el.refreshBtn.addEventListener('click', loadData);
  el.reportBtn.addEventListener('click', openReportModal);
  el.loginBtn.addEventListener('click', handleLoginButton);
  el.clearFiltersBtn.addEventListener('click', clearFilters);
  el.searchInput.addEventListener('input', debounce(applyFilters, 220));
  el.ownerFilter.addEventListener('change', applyFilters);
  el.statusFilter.addEventListener('change', applyFilters);
  el.coordinateFilter.addEventListener('change', applyFilters);
  document.querySelectorAll('.stat-card[data-status]').forEach(card => card.addEventListener('click', () => {
    el.statusFilter.value = card.dataset.status;
    applyFilters();
  }));
  document.querySelectorAll('.segmented button').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  document.querySelectorAll('.modal-close').forEach(button => button.addEventListener('click', closeModals));
  el.modalBackdrop.addEventListener('click', closeModals);
  el.loginForm.addEventListener('submit', submitLogin);
  el.editForm.addEventListener('submit', submitProject);
  el.getLocationBtn.addEventListener('click', getCurrentLocation);
  el.imageInput.addEventListener('change', handleImages);
  el.projectReportBtn.addEventListener('click', () => generateProjectReport(state.selectedProject));
  el.editProjectBtn.addEventListener('click', openEditModal);
  el.reportType.addEventListener('change', updateReportOptions);
  el.reportOwner.addEventListener('change', updateReportCount);
  el.reportForm.addEventListener('submit', submitReport);
  document.getElementById('mobileTeamBtn').addEventListener('click', handleLoginButton);
  document.querySelectorAll('[data-mobile-view]').forEach(button => button.addEventListener('click', () => {
    const view = button.dataset.mobileView;
    if (view === 'summary') window.scrollTo({ top: 0, behavior: 'smooth' });
    else setView(view);
  }));
  window.addEventListener('keydown', event => { if (event.key === 'Escape') closeModals(); });
}

async function loadData() {
  setLoading(true, 'กำลังอ่านข้อมูลจาก Google Sheet');
  try {
    const data = await apiGetJsonp('bootstrap');
    if (!data.success) throw new Error(data.message || 'โหลดข้อมูลไม่สำเร็จ');
    state.projects = data.projects || [];
    state.owners = data.owners || [];
    state.summary = data.summary || {};
    populateOwners();
    renderSummary();
    applyFilters();
    el.lastUpdated.textContent = 'อัปเดต ' + formatDateTime(data.lastUpdated);
    updateLoginButton();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setLoading(false);
  }
}

function populateOwners() {
  const options = ['<option value="">ทั้งหมด</option>'].concat(state.owners.map(owner => `<option value="${escapeAttr(owner)}">${escapeHtml(owner)}</option>`));
  el.ownerFilter.innerHTML = options.join('');
  el.loginOwner.innerHTML = state.owners.map(owner => `<option value="${escapeAttr(owner)}">${escapeHtml(owner)}</option>`).join('');
  el.reportOwner.innerHTML = state.owners.map(owner => `<option value="${escapeAttr(owner)}">${escapeHtml(owner)}</option>`).join('');
}

function renderSummary() {
  const s = state.summary;
  el.statTotal.textContent = number(s.total);
  el.statEquipment.textContent = `RCD ${number(s.rcdTotal)} ตัว`;
  el.statPending.textContent = number(s.pending);
  el.statProcess.textContent = number(s.process);
  el.statPass.textContent = number(s.pass);
  el.statFail.textContent = number(s.fail);
  el.statCost.textContent = number(s.totalCost, 2);
  el.progressText.textContent = `${number(s.progressPercent, 2)}%`;
  el.progressBar.style.width = `${Math.min(100, Number(s.progressPercent || 0))}%`;
  renderOwnerSummary(s.byOwner || {});
}

function renderOwnerSummary(byOwner) {
  el.ownerSummaryList.innerHTML = Object.entries(byOwner)
    .sort((a, b) => b[1].progressPercent - a[1].progressPercent)
    .map(([owner, item]) => `
      <div class="owner-card">
        <button type="button" data-owner="${escapeAttr(owner)}">
          <div class="owner-head"><span>${escapeHtml(owner)}</span><strong>${number(item.progressPercent,2)}%</strong></div>
          <div class="mini-progress"><i style="width:${Math.min(100,item.progressPercent)}%"></i></div>
          <small>เสร็จ ${number(item.pass)} จาก ${number(item.total)} โรงเรียน</small>
        </button>
      </div>`).join('');
  el.ownerSummaryList.querySelectorAll('[data-owner]').forEach(button => button.addEventListener('click', () => {
    el.ownerFilter.value = button.dataset.owner;
    applyFilters();
  }));
}

function applyFilters() {
  const search = el.searchInput.value.trim().toLowerCase();
  const owner = el.ownerFilter.value;
  const status = el.statusFilter.value;
  const coordinates = el.coordinateFilter.value;
  state.filtered = state.projects.filter(project => {
    if (owner && project.owner !== owner) return false;
    if (status && project.status !== status) return false;
    if (coordinates === 'WITH' && !(project.latitude && project.longitude)) return false;
    if (coordinates === 'WITHOUT' && project.latitude && project.longitude) return false;
    if (search) {
      const haystack = [project.wbs, project.schoolName, project.subdistrict, project.owner, project.statusLabel, project.note].join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
  el.resultCount.textContent = `พบ ${number(state.filtered.length)} รายการ จากทั้งหมด ${number(state.projects.length)} รายการ`;
  renderProjectList();
  renderMapMarkers();
  updateReportCount();
}

function clearFilters() {
  el.searchInput.value = '';
  el.ownerFilter.value = '';
  el.statusFilter.value = '';
  el.coordinateFilter.value = '';
  applyFilters();
}

function renderProjectList() {
  el.emptyState.classList.toggle('hidden', state.filtered.length > 0);
  el.projectList.innerHTML = state.filtered.map(project => `
    <article class="project-card" data-id="${escapeAttr(project.id)}">
      <div>
        <span class="status-badge ${project.status}">${escapeHtml(project.statusLabel)}</span>
        <h4>${escapeHtml(project.schoolName)}</h4>
        <p>${escapeHtml(project.wbs)} · ต.${escapeHtml(project.subdistrict || '-')}</p>
      </div>
      <div class="metric-mini"><span>ผู้รับผิดชอบ</span><strong>${escapeHtml(project.owner || '-')}</strong></div>
      <div class="metric-mini"><span>จำนวน RCD</span><strong>${number(project.rcdCount)} ตัว</strong></div>
      <button class="btn btn-light detail-btn" type="button">ดูรายละเอียด</button>
    </article>`).join('');
  el.projectList.querySelectorAll('.project-card').forEach(card => card.addEventListener('click', event => {
    if (event.target.closest('button') || event.currentTarget === event.target) openProject(card.dataset.id);
    else openProject(card.dataset.id);
  }));
}

function initMap() {
  state.map = L.map('map', { zoomControl: true }).setView(APP_CONFIG.MAP_DEFAULT_CENTER, APP_CONFIG.MAP_DEFAULT_ZOOM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(state.map);
  state.markersLayer = L.layerGroup().addTo(state.map);
}

function renderMapMarkers() {
  if (!state.map) return;
  state.markersLayer.clearLayers();
  const bounds = [];
  state.filtered.forEach(project => {
    if (!(project.latitude && project.longitude)) return;
    const icon = L.divIcon({ className: '', html: `<div class="custom-marker ${project.status}"><span></span></div>`, iconSize: [24,24], iconAnchor: [12,22] });
    const marker = L.marker([project.latitude, project.longitude], { icon }).addTo(state.markersLayer);
    marker.bindPopup(`
      <h4>${escapeHtml(project.schoolName)}</h4>
      <p>${escapeHtml(project.owner || '-')}</p>
      <p><span class="status-badge ${project.status}">${escapeHtml(project.statusLabel)}</span></p>
      <button class="btn btn-primary map-detail-btn" data-id="${escapeAttr(project.id)}" type="button">ดูรายละเอียด</button>
    `);
    marker.on('popupopen', () => {
      setTimeout(() => {
        const button = document.querySelector(`.map-detail-btn[data-id="${CSS.escape(project.id)}"]`);
        if (button) button.addEventListener('click', () => openProject(project.id));
      }, 0);
    });
    bounds.push([project.latitude, project.longitude]);
  });
  if (bounds.length) state.map.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 });
  else state.map.setView(APP_CONFIG.MAP_DEFAULT_CENTER, APP_CONFIG.MAP_DEFAULT_ZOOM);
}

function setView(view) {
  state.activeView = view;
  document.querySelectorAll('.segmented button').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  el.mapView.classList.toggle('active', view === 'map');
  el.listView.classList.toggle('active', view === 'list');
  document.querySelectorAll('[data-mobile-view]').forEach(button => button.classList.toggle('active', button.dataset.mobileView === view));
  if (view === 'map') setTimeout(() => state.map.invalidateSize(), 100);
  document.querySelector('.main-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openProject(id) {
  const project = state.projects.find(item => item.id === id);
  if (!project) return;
  state.selectedProject = project;
  el.detailTitle.textContent = project.schoolName;
  el.detailMapBtn.href = project.mapUrl || '#';
  el.detailMapBtn.classList.toggle('hidden', !project.mapUrl);
  el.editProjectBtn.classList.toggle('hidden', !(state.session.token && state.session.owner === project.owner));
  el.detailBody.innerHTML = `
    <div class="detail-grid">
      ${detailItem('สถานะ', `<span class="status-badge ${project.status}">${escapeHtml(project.statusLabel)}</span>`, true)}
      ${detailItem('ผู้รับผิดชอบ', project.owner || '-')}
      ${detailItem('หมายเลข WBS', project.wbs)}
      ${detailItem('ตำบล', project.subdistrict || '-')}
      ${detailItem('จำนวน RCD', `${number(project.rcdCount)} ตัว`)}
      ${detailItem('จำนวนสายดิน', `${number(project.groundingCount)} จุด`)}
      ${detailItem('ค่าใช้จ่ายรวม', `${number(project.totalCost,2)} บาท`)}
      ${detailItem('วันที่ดำเนินการ', project.workDate || '-')}
      ${detailItem('ผู้บันทึกผล', project.recorder || '-')}
      ${detailItem('อัปเดตล่าสุด', project.updatedAt ? formatDateTime(project.updatedAt) : '-')}
      ${detailItem('พิกัด', project.latitude && project.longitude ? `${project.latitude}, ${project.longitude}` : '-')}
      ${detailItem('จำนวนรูปภาพ', `${number(project.photoCount)} ภาพ`)}
    </div>
    <div class="detail-item" style="margin-top:12px"><span>หมายเหตุ</span><strong>${escapeHtml(project.note || '-')}</strong></div>
    <h4>ภาพถ่ายการดำเนินงาน</h4>
    ${renderPhotoGallery(project.photoUrls)}
  `;
  openModal(el.detailModal);
}

function detailItem(label, value, raw = false) {
  return `<div class="detail-item"><span>${escapeHtml(label)}</span><strong>${raw ? value : escapeHtml(String(value))}</strong></div>`;
}

function renderPhotoGallery(photos) {
  if (!photos || !photos.length) return '<p class="muted">ยังไม่มีภาพถ่ายผลการดำเนินงาน</p>';
  return `<div class="photo-gallery">${photos.map((photo, index) => `
    <a href="${escapeAttr(photo.viewUrl || photo.thumbnailUrl)}" target="_blank" rel="noopener" title="ภาพที่ ${index + 1}">
      <img src="${escapeAttr(photo.thumbnailUrl || photo.viewUrl)}" alt="ภาพผลดำเนินงาน ${index + 1}" loading="lazy" onerror="this.style.display='none'">
    </a>`).join('')}</div>`;
}

function handleLoginButton() {
  if (state.session.token) {
    if (confirm(`ออกจากโหมดทีม ${state.session.owner} หรือไม่`)) logout();
    return;
  }
  openModal(el.loginModal);
}

async function submitLogin(event) {
  event.preventDefault();
  const submit = event.submitter;
  setButtonLoading(submit, true, 'กำลังตรวจสอบ...');
  try {
    const data = await apiCall('authenticate', { owner: el.loginOwner.value, pin: el.loginPin.value });
    if (!data.success) throw new Error(data.message || 'เข้าสู่ระบบไม่สำเร็จ');
    state.session = { token: data.token, owner: data.owner };
    sessionStorage.setItem('peaSessionToken', data.token);
    sessionStorage.setItem('peaSessionOwner', data.owner);
    el.loginPin.value = '';
    closeModals();
    updateLoginButton();
    showToast(`เข้าสู่โหมดทีม ${data.owner} แล้ว`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setButtonLoading(submit, false);
  }
}

async function logout() {
  try { await apiCall('logout', { token: state.session.token }); } catch (_) {}
  state.session = { token: '', owner: '' };
  sessionStorage.removeItem('peaSessionToken');
  sessionStorage.removeItem('peaSessionOwner');
  updateLoginButton();
  showToast('ออกจากโหมดทีมแล้ว');
}

function updateLoginButton() {
  if (state.session.token) {
    el.loginBtn.textContent = `ทีม: ${state.session.owner}`;
    el.loginBtn.classList.add('btn-gold');
    el.loginBtn.classList.remove('btn-primary');
  } else {
    el.loginBtn.textContent = 'เข้าสู่โหมดทีม';
    el.loginBtn.classList.add('btn-primary');
    el.loginBtn.classList.remove('btn-gold');
  }
}

function openEditModal() {
  const p = state.selectedProject;
  if (!p) return;
  if (!state.session.token || state.session.owner !== p.owner) {
    showToast('กรุณาเข้าสู่โหมดทีมของผู้รับผิดชอบรายการนี้ก่อน', true);
    return;
  }
  closeModals();
  state.images = [];
  el.editTitle.textContent = p.schoolName;
  el.editStatus.value = p.status;
  el.editWorkDate.value = p.workDate || new Date().toISOString().slice(0,10);
  el.editRecorder.value = p.recorder || '';
  el.editNote.value = p.note || '';
  el.editCoordinates.value = p.fieldCoordinates || (p.latitude && p.longitude ? `${p.latitude}, ${p.longitude}` : '');
  el.imageInput.value = '';
  renderImagePreview();
  openModal(el.editModal);
}

async function handleImages(event) {
  const files = Array.from(event.target.files || []).slice(0, APP_CONFIG.MAX_UPLOAD_FILES);
  if (!files.length) return;
  setLoading(true, 'กำลังเตรียมรูปภาพ');
  try {
    state.images = [];
    for (const file of files) {
      state.images.push({ name: file.name, dataUrl: await compressImage(file) });
    }
    renderImagePreview();
  } catch (error) {
    showToast('เตรียมรูปไม่สำเร็จ: ' + error.message, true);
  } finally {
    setLoading(false);
  }
}

function renderImagePreview() {
  el.imagePreview.innerHTML = state.images.map((image, index) => `
    <div class="preview-item"><img src="${image.dataUrl}" alt="ภาพที่ ${index+1}"><button type="button" data-remove-image="${index}">×</button></div>`).join('');
  el.imagePreview.querySelectorAll('[data-remove-image]').forEach(button => button.addEventListener('click', () => {
    state.images.splice(Number(button.dataset.removeImage), 1);
    renderImagePreview();
  }));
}

async function submitProject(event) {
  event.preventDefault();
  const p = state.selectedProject;
  if (!p) return;
  const status = el.editStatus.value;
  if (status === 'PASS' && !el.editWorkDate.value) return showToast('กรุณาระบุวันที่ดำเนินการ', true);
  if (status === 'PASS' && (p.photoCount || 0) + state.images.length < 1) return showToast('งานที่แล้วเสร็จต้องมีรูปภาพอย่างน้อย 1 รูป', true);
  if (status === 'FAIL' && !el.editNote.value.trim()) return showToast('งานติดปัญหาต้องระบุหมายเหตุ', true);

  setButtonLoading(el.saveProjectBtn, true, 'กำลังบันทึกและอัปโหลด...');
  try {
    const data = await apiCall('saveProject', {
      token: state.session.token,
      projectId: p.id,
      status,
      workDate: el.editWorkDate.value,
      recorder: el.editRecorder.value.trim(),
      note: el.editNote.value.trim(),
      fieldCoordinates: el.editCoordinates.value.trim(),
      images: state.images
    }, 180000);
    if (!data.success) throw new Error(data.message || 'บันทึกไม่สำเร็จ');
    closeModals();
    showToast(data.message || 'บันทึกสำเร็จ');
    await loadData();
    const refreshed = state.projects.find(item => item.id === p.id);
    if (refreshed) openProject(refreshed.id);
  } catch (error) {
    if (/เซสชัน/.test(error.message)) await logout();
    showToast(error.message, true);
  } finally {
    setButtonLoading(el.saveProjectBtn, false);
  }
}

function getCurrentLocation() {
  if (!navigator.geolocation) return showToast('อุปกรณ์นี้ไม่รองรับการอ่านพิกัด', true);
  setButtonLoading(el.getLocationBtn, true, 'กำลังอ่านพิกัด...');
  navigator.geolocation.getCurrentPosition(
    pos => {
      el.editCoordinates.value = `${pos.coords.latitude.toFixed(7)}, ${pos.coords.longitude.toFixed(7)}`;
      setButtonLoading(el.getLocationBtn, false);
    },
    error => {
      showToast('อ่านพิกัดไม่สำเร็จ: ' + error.message, true);
      setButtonLoading(el.getLocationBtn, false);
    },
    { enableHighAccuracy: true, timeout: 15000 }
  );
}

function openReportModal() {
  updateReportOptions();
  openModal(el.reportModal);
}

function updateReportOptions() {
  el.reportOwnerField.classList.toggle('hidden', el.reportType.value !== 'owner');
  updateReportCount();
}

function updateReportCount() {
  let count = state.projects.length;
  if (el.reportType.value === 'filtered') count = state.filtered.length;
  if (el.reportType.value === 'owner') count = state.projects.filter(p => p.owner === el.reportOwner.value).length;
  el.reportCount.textContent = `รายงานนี้จะประกอบด้วยข้อมูลจำนวน ${number(count)} โรงเรียน`;
}

async function submitReport(event) {
  event.preventDefault();
  const button = event.submitter;
  const type = el.reportType.value;
  const filters = type === 'filtered'
    ? currentFilters()
    : type === 'owner' ? { owner: el.reportOwner.value } : {};
  await generateReport({ type, filters }, button);
}

async function generateProjectReport(project) {
  if (!project) return;
  await generateReport({ type: 'project', projectId: project.id, filters: {} }, el.projectReportBtn);
}

async function generateReport(payload, button) {
  setButtonLoading(button, true, 'กำลังสร้าง PDF...');
  try {
    const data = await apiCall('generateReport', payload, 180000);
    if (!data.success) throw new Error(data.message || 'สร้างรายงานไม่สำเร็จ');
    showToast(`${data.message} จำนวน ${number(data.count)} รายการ`);
    window.open(data.fileUrl || data.downloadUrl, '_blank', 'noopener');
    closeModals();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setButtonLoading(button, false);
  }
}

function currentFilters() {
  return { search: el.searchInput.value.trim(), owner: el.ownerFilter.value, status: el.statusFilter.value };
}

function openModal(modal) {
  el.modalBackdrop.classList.remove('hidden');
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModals() {
  el.modalBackdrop.classList.add('hidden');
  document.querySelectorAll('.modal').forEach(modal => modal.classList.add('hidden'));
  document.body.style.overflow = '';
}

function showToast(message, isError = false) {
  el.toast.textContent = message;
  el.toast.className = 'toast' + (isError ? ' error' : '');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.toast.classList.add('hidden'), 5000);
}

function setLoading(active, message) {
  if (message) el.appLoading.querySelector('strong').textContent = message;
  el.appLoading.classList.toggle('hidden', !active);
}

function setButtonLoading(button, active, text) {
  if (!button) return;
  if (active) {
    button.dataset.originalText = button.textContent;
    button.textContent = text || 'กำลังดำเนินการ...';
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}


function apiGetJsonp(action, params = {}, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const callbackName = '__peaJsonp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      try { delete window[callbackName]; } catch (_) { window[callbackName] = undefined; }
      script.remove();
    };

    window[callbackName] = data => {
      if (settled) return;
      settled = true;
      cleanup();
      if (data && data.success === false) {
        reject(new Error(data.message || 'API error'));
        return;
      }
      resolve(data);
    };

    const query = new URLSearchParams({
      action,
      callback: callbackName,
      _: String(Date.now()),
      ...Object.fromEntries(
        Object.entries(params).map(([key, value]) => [
          key,
          typeof value === 'string' ? value : JSON.stringify(value)
        ])
      )
    });

    script.src = APP_CONFIG.API_URL + '?' + query.toString();
    script.async = true;
    script.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('ไม่สามารถโหลดข้อมูลจาก Apps Script ได้ กรุณาตรวจสอบ URL และสิทธิ์ Deployment'));
    };

    document.head.appendChild(script);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Apps Script ไม่ตอบกลับภายในเวลาที่กำหนด กรุณาตรวจสอบ Deployment'));
    }, timeout);
  });
}

function apiCall(action, payload = {}, timeout = APP_CONFIG.API_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const iframeName = 'pea_api_' + requestId;
    const iframe = document.createElement('iframe');
    iframe.name = iframeName;
    iframe.style.display = 'none';
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = APP_CONFIG.API_URL;
    form.target = iframeName;
    form.style.display = 'none';

    const fields = {
      action,
      payload: JSON.stringify(payload),
      callbackMode: 'iframe',
      requestId
    };
    Object.entries(fields).forEach(([name, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });

    let settled = false;
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      iframe.remove();
      form.remove();
      clearTimeout(timer);
    };
    const onMessage = event => {
      const data = event.data;
      if (!data || data.type !== 'PEA_API_RESPONSE' || data.requestId !== requestId) return;
      settled = true;
      cleanup();
      if (data.payload && data.payload.success === false) reject(new Error(data.payload.message || 'API error'));
      else resolve(data.payload);
    };
    window.addEventListener('message', onMessage);
    document.body.appendChild(iframe);
    document.body.appendChild(form);
    form.submit();

    const timer = setTimeout(() => {
      if (settled) return;
      cleanup();
      reject(new Error('การเชื่อมต่อใช้เวลานานเกินไป กรุณาตรวจสอบ Deployment ของ Apps Script'));
    }, timeout);
  });
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('ไฟล์ไม่ใช่รูปภาพ'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('เปิดรูปไม่สำเร็จ'));
      image.onload = () => {
        const maxSide = APP_CONFIG.MAX_IMAGE_SIDE;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', APP_CONFIG.JPEG_QUALITY));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '-';
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function number(value, digits = 0) {
  return Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
}
function escapeAttr(value) { return escapeHtml(value); }
function debounce(fn, wait) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); }; }
