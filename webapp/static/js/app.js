// State Management
let currentView = 'study';
let studyPage = 1;
let studyPageSize = 100;
let studyFilters = {
  section: 'All',
  license: 'All',
  status: '',
  search: '',
  has_image: null
};

// Multi-User Profile & Auth State
let currentUser = null;
let allProfiles = [];

async function authFetch(url, options = {}) {
  const token = localStorage.getItem('nz_roadcode_token');
  const headers = Object.assign({}, options.headers || {});
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'same-origin'
  });
  if (res.status === 401) {
    localStorage.removeItem('nz_roadcode_token');
    currentUser = null;
    showAuthGate();
  }
  return res;
}

// Mock Test State
let currentTest = null;
let testCurrentIndex = 0;
let testAnswers = {}; // index: { question_id, selected_index, flagged }
let testTimerSeconds = 1800; // 30 minutes
let testTimerInterval = null;
let testStartTime = null;

// Chart Instance
let historyChart = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  initNavigation();
  initStudyHub();
  initMockTest();
  initMetrics();
  initAuth();
  loadProfilesList();
  const authed = await checkCurrentUser();
  if (authed) {
    hideAuthGate();
    loadStudyQuestions();
  } else {
    showAuthGate();
  }
});

// View Navigation
function switchView(viewName) {
  if (!currentUser) {
    showAuthGate();
    return;
  }
  currentView = viewName;
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  
  // Update desktop nav buttons
  document.querySelectorAll('.nav-btn').forEach(b => {
    if (b.getAttribute('data-view') === viewName) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  // Update mobile nav buttons
  document.querySelectorAll('.mobile-nav-btn').forEach(b => {
    if (b.getAttribute('data-view') === viewName) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  const activePanel = document.getElementById(`view-${viewName}`);
  if (activePanel) activePanel.classList.add('active');

  // Smooth scroll to top on mobile view switch
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (viewName === 'study') {
    loadStudyQuestions();
  } else if (viewName === 'metrics') {
    loadMetrics();
  } else if (viewName === 'weak') {
    loadWeakAreas();
  }
}

function initNavigation() {
  document.querySelectorAll('.nav-btn, .mobile-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view');
      if (view) switchView(view);
      const action = btn.getAttribute('data-action');
      if (action === 'profile') openAuthModal();
    });
  });
}

// =============================================================================
// HEADER STATS
// =============================================================================
async function loadHeaderStats() {
  await checkCurrentUser();
}

// =============================================================================
// VIEW 1: STUDY HUB
// =============================================================================
function initStudyHub() {
  // Search input debounce
  let searchTimeout;
  const searchInput = document.getElementById('study-search');
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      studyFilters.search = e.target.value.trim();
      studyPage = 1;
      loadStudyQuestions();
    }, 300);
  });

  // Section filter
  document.getElementById('study-section-filter').addEventListener('change', (e) => {
    studyFilters.section = e.target.value;
    studyPage = 1;
    loadStudyQuestions();
  });

  // License filter
  document.getElementById('study-license-filter').addEventListener('change', (e) => {
    studyFilters.license = e.target.value;
    studyPage = 1;
    loadStudyQuestions();
  });

  // Status pills
  document.querySelectorAll('.status-pills .pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.status-pills .pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      studyFilters.status = btn.getAttribute('data-status');
      studyPage = 1;
      loadStudyQuestions();
    });
  });

  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('status')) {
      studyFilters.status = urlParams.get('status');
      document.querySelectorAll('.status-pills .pill-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-status') === studyFilters.status);
      });
    }
  } catch (e) {}

  // Pagination buttons
  document.getElementById('btn-prev-page').addEventListener('click', () => {
    if (studyPage > 1) {
      studyPage--;
      loadStudyQuestions();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  document.getElementById('btn-next-page').addEventListener('click', () => {
    studyPage++;
    loadStudyQuestions();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

async function loadStudyQuestions() {
  if (!currentUser) return;
  const container = document.getElementById('study-questions-container');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--slate-500);">Loading questions...</div>';

  const params = new URLSearchParams({
    page: studyPage,
    page_size: studyPageSize,
    section: studyFilters.section,
    license: studyFilters.license,
    status: studyFilters.status,
    search: studyFilters.search
  });

  try {
    const res = await authFetch(`/api/questions?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Server error ${res.status}`);
    }
    const data = await res.json();
    if (!data || !Array.isArray(data.questions)) {
      return;
    }

    const startQ = data.total > 0 ? (data.page - 1) * data.page_size + 1 : 0;
    const endQ = Math.min(data.page * data.page_size, data.total);
    const rangeText = data.total > 0 ? `(${startQ}–${endQ} of ${data.total})` : `(0)`;
    document.getElementById('page-indicator').innerText = `Page ${data.page} of ${data.total_pages} ${rangeText}`;
    document.getElementById('btn-prev-page').disabled = (data.page <= 1);
    document.getElementById('btn-next-page').disabled = (data.page >= data.total_pages);

    if (data.questions.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding: 50px; background:#fff; border-radius:8px; color:var(--slate-500); font-weight:600;">No questions found matching your filters.</div>';
      return;
    }

    container.innerHTML = '';
    data.questions.forEach(q => {
      container.appendChild(createStudyQuestionCard(q));
    });
  } catch (err) {
    container.innerHTML = `<div style="color:red; text-align:center; padding: 20px;">Error loading questions: ${err.message}</div>`;
  }
}

function getStatusBadgeHtml(status, canonicalId) {
  const s = (status || 'unseen').toLowerCase();
  let iconSvg = '';
  let title = '';
  if (s === 'mastered') {
    title = 'Mastered';
    iconSvg = `<svg class="status-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="16 9 12 15 8 11"></polyline></svg>`;
  } else if (s === 'learning') {
    title = 'Learning / Needs Practice';
    iconSvg = `<svg class="status-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><polyline points="21 3 21 8 16 8"></polyline></svg>`;
  } else {
    title = 'Unseen';
    iconSvg = `<svg class="status-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" stroke-dasharray="3.5 3.5"></circle></svg>`;
  }
  return `<span class="badge-status status-${s}" id="status-badge-${canonicalId}" title="${title}" aria-label="${title}">${iconSvg}</span>`;
}

function updateStatusBadge(qid, newStatus) {
  const badge = document.getElementById(`status-badge-${qid}`);
  if (!badge) return;
  const s = (newStatus || 'unseen').toLowerCase();
  let iconSvg = '';
  let title = '';
  if (s === 'mastered') {
    title = 'Mastered';
    iconSvg = `<svg class="status-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="16 9 12 15 8 11"></polyline></svg>`;
  } else if (s === 'learning') {
    title = 'Learning / Needs Practice';
    iconSvg = `<svg class="status-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><polyline points="21 3 21 8 16 8"></polyline></svg>`;
  } else {
    title = 'Unseen';
    iconSvg = `<svg class="status-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" stroke-dasharray="3.5 3.5"></circle></svg>`;
  }
  badge.className = `badge-status status-${s}`;
  badge.title = title;
  badge.setAttribute('aria-label', title);
  badge.innerHTML = iconSvg;
}

function createStudyQuestionCard(q) {
  const card = document.createElement('div');
  card.className = 'card';
  card.id = `study-card-${q.canonical_id}`;

  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const hasImg = q.has_image && q.image_url;
  const isMulti = q.is_multi_answer || (q.correct_option_indices && q.correct_option_indices.length > 1);

  let imgHtml = '';
  if (hasImg) {
    imgHtml = `
      <div class="q-card-image" onclick="zoomImage('${q.image_url}', 'Question Q${String(q.canonical_id).padStart(4, '0')} Diagram')">
        <img src="${q.image_url}" alt="Diagram" loading="lazy" />
      </div>
    `;
  }

  let optionsHtml = '';
  if (isMulti) {
    optionsHtml += `<div class="multi-instruction">Select all applicable answers below, then click &quot;Check Answers&quot;:</div>`;
  }

  q.options.forEach((opt, idx) => {
    const letter = letters[idx] || (idx + 1);
    if (isMulti) {
      optionsHtml += `
        <button type="button" class="study-opt-btn study-multi-opt" data-qid="${q.canonical_id}" data-oidx="${idx}" onclick="handleStudyMultiOptionToggle(this, ${q.canonical_id}, ${idx})">
          <input type="checkbox" class="study-opt-checkbox" pointer-events="none" tabindex="-1" />
          <span class="opt-prefix">[${letter}]</span>
          <span class="opt-text">${escapeHtml(opt)}</span>
          <span class="opt-feedback" style="display:flex; align-items:center;"></span>
        </button>
      `;
    } else {
      optionsHtml += `
        <button type="button" class="study-opt-btn" data-qid="${q.canonical_id}" data-oidx="${idx}" onclick="handleStudyOptionClick(this, ${q.canonical_id}, ${idx})">
          <input type="radio" class="study-opt-radio" name="study-opt-${q.canonical_id}" pointer-events="none" tabindex="-1" />
          <span class="opt-prefix">[${letter}]</span>
          <span class="opt-text">${escapeHtml(opt)}</span>
          <span class="opt-feedback" style="display:flex; align-items:center;"></span>
        </button>
      `;
    }
  });

  const multiTag = isMulti ? '<span class="badge-tag badge-multi">Multiple Answers</span>' : '';
  const starActive = q.is_bookmarked ? 'active' : '';

  let multiActionHtml = '';
  if (isMulti) {
    multiActionHtml = `
      <button class="btn-sm btn-check-multi" id="btn-check-${q.canonical_id}" onclick="submitStudyMultiAnswer(${q.canonical_id})">
        Check Answers
      </button>
    `;
  }

  card.innerHTML = `
    <div class="q-card-header">
      <div class="q-header-tags">
        <span class="badge-qnum">Q${String(q.canonical_id).padStart(4, '0')}</span>
        <span class="badge-tag badge-lic">${escapeHtml(q.license_class)}</span>
        <span class="badge-tag">${escapeHtml(q.section)}</span>
        ${multiTag}
      </div>
      <div class="q-header-actions">
        <button class="bookmark-btn ${starActive}" id="bm-${q.canonical_id}" title="${q.is_bookmarked ? 'Remove bookmark' : 'Bookmark question'}" aria-label="${q.is_bookmarked ? 'Remove bookmark' : 'Bookmark question'}" onclick="toggleBookmark(${q.canonical_id})">
          <svg class="bm-icon" width="15" height="15" viewBox="0 0 24 24" fill="${q.is_bookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
        </button>
        ${getStatusBadgeHtml(q.user_status, q.canonical_id)}
      </div>
    </div>

    <div class="q-prompt-text">${escapeHtml(q.prompt)}</div>

    <div class="q-card-body-layout">
      <div class="q-card-main-col">
        <div class="study-options-list" id="opts-container-${q.canonical_id}">
          ${optionsHtml}
        </div>
      </div>
      ${imgHtml}
    </div>

    <div class="q-explanation-box" id="exp-box-${q.canonical_id}" style="display: none;">
      <b>Explanation:</b> <span id="exp-text-${q.canonical_id}"></span>
    </div>

    <div class="card-actions">
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        ${multiActionHtml}
        <button class="btn-sm btn-reveal" id="btn-reveal-${q.canonical_id}" onclick="toggleRevealAnswer(${q.canonical_id})">
          Reveal Answer
        </button>
      </div>
      <div class="action-btn-group">
        <button class="btn-sm btn-mastered" onclick="updateStatus(${q.canonical_id}, 'mastered')">
          Mastered
        </button>
        <button class="btn-sm btn-learning" onclick="updateStatus(${q.canonical_id}, 'learning')">
          Needs Practice
        </button>
      </div>
    </div>
  `;

  return card;
}

function handleStudyMultiOptionToggle(btn, qid, idx) {
  btn.classList.toggle('selected');
  const chk = btn.querySelector('.study-opt-checkbox');
  if (chk) chk.checked = btn.classList.contains('selected');

  // Clear previous answer check feedback if user changes selection
  const parent = document.getElementById(`opts-container-${qid}`);
  if (parent) {
    const hasHighlights = parent.querySelector('.correct-highlight') || parent.querySelector('.incorrect-highlight');
    if (hasHighlights) {
      parent.querySelectorAll('.study-multi-opt').forEach(b => {
        b.classList.remove('correct-highlight', 'incorrect-highlight');
        const fb = b.querySelector('.opt-feedback');
        if (fb) fb.innerHTML = '';
      });
      const checkBtn = document.getElementById(`btn-check-${qid}`);
      if (checkBtn) checkBtn.innerText = 'Check Answers';
    }
  }
}

async function submitStudyMultiAnswer(qid) {
  const parent = document.getElementById(`opts-container-${qid}`);
  if (!parent) return;

  const buttons = parent.querySelectorAll('.study-multi-opt');
  const selectedIndices = [];
  buttons.forEach(b => {
    if (b.classList.contains('selected')) {
      selectedIndices.push(parseInt(b.getAttribute('data-oidx'), 10));
    }
  });

  if (selectedIndices.length === 0) {
    alert('Please select at least one answer before checking.');
    return;
  }

  try {
    const res = await authFetch(`/api/questions/${qid}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selected_indices: selectedIndices })
    });
    const data = await res.json();

    const correctIndices = new Set(data.correct_option_indices || [data.correct_option_index]);
    const userSet = new Set(selectedIndices);

    buttons.forEach((b, idx) => {
      b.classList.remove('correct-highlight', 'incorrect-highlight');
      const fb = b.querySelector('.opt-feedback');
      if (fb) fb.innerHTML = '';

      const isAns = correctIndices.has(idx);
      const isChosen = userSet.has(idx);

      if (isAns && isChosen) {
        b.classList.add('correct-highlight');
        if (fb) fb.innerHTML = '<span class="correct-check">Correct Choice</span>';
      } else if (isAns && !isChosen) {
        b.classList.add('correct-highlight');
        if (fb) fb.innerHTML = '<span class="correct-check">Missed Answer</span>';
      } else if (!isAns && isChosen) {
        b.classList.add('incorrect-highlight');
        if (fb) fb.innerHTML = '<span style="margin-left:auto; color:#dc2626; font-weight:700; font-size:12px; padding-left:8px;">Incorrect Choice</span>';
      }
    });

    const expBox = document.getElementById(`exp-box-${qid}`);
    const expText = document.getElementById(`exp-text-${qid}`);
    if (data.explanation && expBox && expText) {
      expText.innerText = data.explanation;
      expBox.style.display = 'block';
    }

    // Update status badge dynamically
    const newStatus = data.is_correct ? 'mastered' : 'learning';
    updateStatusBadge(qid, newStatus);

    const revealBtn = document.getElementById(`btn-reveal-${qid}`);
    if (revealBtn) {
      revealBtn.innerText = 'Hide Answer';
    }

    const checkBtn = document.getElementById(`btn-check-${qid}`);
    if (checkBtn) {
      checkBtn.innerText = data.is_correct ? 'Passed' : 'Re-check Answers';
    }

    loadHeaderStats();
  } catch (err) {
    console.error('Failed to submit multi-answer:', err);
  }
}

async function handleStudyOptionClick(btn, qid, selectedIdx) {
  const isQuizMode = document.getElementById('chk-instant-quiz').checked;
  if (!isQuizMode) return;

  try {
    const res = await authFetch(`/api/questions/${qid}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selected_index: selectedIdx })
    });
    const data = await res.json();

    const parent = document.getElementById(`opts-container-${qid}`);
    const buttons = parent.querySelectorAll('.study-opt-btn');
    const correctIndices = new Set(data.correct_option_indices || [data.correct_option_index]);

    buttons.forEach((b, idx) => {
      b.classList.remove('correct-highlight', 'incorrect-highlight', 'selected');
      const rad = b.querySelector('.study-opt-radio');
      if (rad) rad.checked = (idx === selectedIdx);
      if (idx === selectedIdx) b.classList.add('selected');

      if (correctIndices.has(idx)) {
        b.classList.add('correct-highlight');
        if (!b.querySelector('.correct-check')) {
          b.insertAdjacentHTML('beforeend', '<span class="correct-check">Correct</span>');
        }
      } else if (idx === selectedIdx && !data.is_correct) {
        b.classList.add('incorrect-highlight');
      }
    });

    const expBox = document.getElementById(`exp-box-${qid}`);
    const expText = document.getElementById(`exp-text-${qid}`);
    if (data.explanation) {
      expText.innerText = data.explanation;
      expBox.style.display = 'block';
    }

    // Update status badge dynamically
    const newStatus = data.is_correct ? 'mastered' : 'learning';
    updateStatusBadge(qid, newStatus);

    const revealBtn = document.getElementById(`btn-reveal-${qid}`);
    if (revealBtn) {
      revealBtn.innerText = 'Hide Answer';
    }

    loadHeaderStats();
  } catch (err) {
    console.error('Failed to check answer:', err);
  }
}

async function toggleRevealAnswer(qid) {
  const expBox = document.getElementById(`exp-box-${qid}`);
  const parent = document.getElementById(`opts-container-${qid}`);
  const revealBtn = document.getElementById(`btn-reveal-${qid}`);

  // Check if answer or explanation is currently visible/revealed
  const isExpVisible = expBox && expBox.style.display === 'block';
  const hasHighlights = parent && (parent.querySelector('.correct-highlight') !== null || parent.querySelector('.incorrect-highlight') !== null);
  const isRevealed = isExpVisible || hasHighlights;

  if (isRevealed) {
    // Hide explanation
    if (expBox) expBox.style.display = 'none';

    // Remove all highlight classes and check indicators from buttons
    if (parent) {
      parent.querySelectorAll('.study-opt-btn').forEach(b => {
        b.classList.remove('correct-highlight', 'incorrect-highlight', 'selected');
        const chk = b.querySelector('.correct-check');
        if (chk) chk.remove();
        const fb = b.querySelector('.opt-feedback');
        if (fb) fb.innerHTML = '';
        const cb = b.querySelector('.study-opt-checkbox');
        if (cb) cb.checked = false;
        const rad = b.querySelector('.study-opt-radio');
        if (rad) rad.checked = false;
      });
    }

    const checkBtn = document.getElementById(`btn-check-${qid}`);
    if (checkBtn) checkBtn.innerText = 'Check Answers';

    // Reset button text
    if (revealBtn) revealBtn.innerText = 'Reveal Answer';
    return;
  }

  // Otherwise, reveal the answer
  try {
    const res = await authFetch(`/api/questions/${qid}`);
    const q = await res.json();

    if (parent) {
      const buttons = parent.querySelectorAll('.study-opt-btn');
      const correctIndices = new Set(q.correct_option_indices || [q.correct_option_index]);
      buttons.forEach((b, idx) => {
        b.classList.remove('correct-highlight', 'incorrect-highlight');
        const chk = b.querySelector('.correct-check');
        if (chk) chk.remove();
        const fb = b.querySelector('.opt-feedback');
        if (fb) fb.innerHTML = '';

        if (correctIndices.has(idx)) {
          b.classList.add('correct-highlight');
          const cb = b.querySelector('.study-opt-checkbox');
          if (cb) cb.checked = true;
          const rad = b.querySelector('.study-opt-radio');
          if (rad) rad.checked = true;
          if (fb) {
            fb.innerHTML = '<span class="correct-check">Correct</span>';
          } else {
            b.insertAdjacentHTML('beforeend', '<span class="correct-check">Correct</span>');
          }
        }
      });
    }

    if (expBox) {
      const expText = document.getElementById(`exp-text-${qid}`);
      if (expText) expText.innerText = q.explanation || 'No detailed explanation provided.';
      expBox.style.display = 'block';
    }

    if (revealBtn) revealBtn.innerText = 'Hide Answer';
  } catch (err) {
    console.error('Failed to reveal answer:', err);
  }
}

async function updateStatus(qid, status) {
  try {
    await authFetch(`/api/questions/${qid}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    updateStatusBadge(qid, status);
    loadHeaderStats();
  } catch (err) {
    console.error('Failed to update status:', err);
  }
}

async function toggleBookmark(qid) {
  try {
    const res = await authFetch(`/api/questions/${qid}/bookmark`, { method: 'POST' });
    const data = await res.json();
    const btn = document.getElementById(`bm-${qid}`);
    if (btn) {
      const svg = btn.querySelector('svg');
      if (data.is_bookmarked) {
        btn.classList.add('active');
        btn.title = 'Remove bookmark';
        btn.setAttribute('aria-label', 'Remove bookmark');
        if (svg) svg.setAttribute('fill', 'currentColor');
      } else {
        btn.classList.remove('active');
        btn.title = 'Bookmark question';
        btn.setAttribute('aria-label', 'Bookmark question');
        if (svg) svg.setAttribute('fill', 'none');
      }
    }
    loadHeaderStats();
  } catch (err) {
    console.error('Failed to toggle bookmark:', err);
  }
}

// =============================================================================
// VIEW 2: MOCK TEST (35 Questions, 30-Min Timer)
// =============================================================================
function initMockTest() {
  document.getElementById('btn-start-mock-test').addEventListener('click', startMockTest);
  document.getElementById('btn-test-prev').addEventListener('click', prevTestQuestion);
  document.getElementById('btn-test-next').addEventListener('click', nextTestQuestion);
  document.getElementById('btn-test-flag').addEventListener('click', toggleTestFlag);
  document.getElementById('btn-test-finish').addEventListener('click', promptSubmitTest);
  document.getElementById('btn-confirm-submit').addEventListener('click', submitMockTest);

  // Mobile Grid Drawer Toggle
  const btnToggleGrid = document.getElementById('btn-toggle-grid');
  const btnCloseSidebar = document.getElementById('btn-close-sidebar');
  const drawerBackdrop = document.getElementById('drawer-backdrop');
  const sidebar = document.getElementById('test-sidebar-drawer');

  if (btnToggleGrid && sidebar) {
    btnToggleGrid.addEventListener('click', () => {
      sidebar.classList.toggle('drawer-open');
      if (drawerBackdrop) drawerBackdrop.classList.toggle('active');
    });
  }

  function closeMobileNavigator() {
    if (sidebar) sidebar.classList.remove('drawer-open');
    if (drawerBackdrop) drawerBackdrop.classList.remove('active');
  }

  if (btnCloseSidebar) btnCloseSidebar.addEventListener('click', closeMobileNavigator);
  if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeMobileNavigator);

  // Review filters
  document.getElementById('btn-filter-rev-all').addEventListener('click', () => filterReview('all'));
  document.getElementById('btn-filter-rev-wrong').addEventListener('click', () => filterReview('wrong'));
  document.getElementById('btn-filter-rev-flagged').addEventListener('click', () => filterReview('flagged'));
}

async function startMockTest() {
  const licenseFilter = document.getElementById('mock-test-license-select').value;
  try {
    const res = await authFetch(`/api/test/generate?license_filter=${encodeURIComponent(licenseFilter)}`);
    if (!res.ok) {
      throw new Error(`Server error ${res.status}`);
    }
    currentTest = await res.json();
    testAnswers = {};
    testCurrentIndex = 0;
    testTimerSeconds = 1800; // 30 mins
    testStartTime = Date.now();

    document.getElementById('test-welcome-screen').style.display = 'none';
    document.getElementById('test-active-screen').style.display = 'grid';

    buildTestNavigatorGrid();
    renderCurrentTestQuestion();
    startTestTimer();
  } catch (err) {
    alert('Error generating test: ' + err.message);
  }
}

function startTestTimer() {
  clearInterval(testTimerInterval);
  updateTimerDisplay();

  testTimerInterval = setInterval(() => {
    testTimerSeconds--;
    updateTimerDisplay();

    if (testTimerSeconds <= 0) {
      clearInterval(testTimerInterval);
      alert('Time has expired! Submitting your exam now.');
      submitMockTest();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const mins = Math.floor(testTimerSeconds / 60);
  const secs = testTimerSeconds % 60;
  const timerBadge = document.getElementById('test-timer-badge');
  const timerDisplay = document.getElementById('test-timer-display');

  timerDisplay.innerText = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  if (testTimerSeconds < 300) {
    timerBadge.classList.add('timer-pulse-red');
  } else {
    timerBadge.classList.remove('timer-pulse-red');
  }
}

function buildTestNavigatorGrid() {
  const grid = document.getElementById('test-navigator-grid');
  grid.innerHTML = '';

  for (let i = 0; i < currentTest.questions.length; i++) {
    const btn = document.createElement('button');
    btn.className = 'q-grid-btn';
    btn.id = `nav-grid-${i}`;
    btn.innerText = i + 1;
    btn.addEventListener('click', () => {
      testCurrentIndex = i;
      renderCurrentTestQuestion();

      // On mobile, auto-close drawer when question is tapped
      const sidebar = document.getElementById('test-sidebar-drawer');
      const drawerBackdrop = document.getElementById('drawer-backdrop');
      if (sidebar) sidebar.classList.remove('drawer-open');
      if (drawerBackdrop) drawerBackdrop.classList.remove('active');
    });
    grid.appendChild(btn);
  }
  updateNavigatorButtons();
}

function updateNavigatorButtons() {
  for (let i = 0; i < currentTest.questions.length; i++) {
    const btn = document.getElementById(`nav-grid-${i}`);
    if (!btn) continue;

    btn.className = 'q-grid-btn';
    if (i === testCurrentIndex) btn.classList.add('current');

    const ans = testAnswers[i];
    const isAnswered = ans && (
      (ans.selected_indices && ans.selected_indices.length > 0) ||
      (ans.selected_index !== undefined && ans.selected_index !== null && ans.selected_index >= 0)
    );
    if (isAnswered) {
      btn.classList.add('answered');
    }
    if (ans && ans.flagged) {
      btn.classList.add('flagged');
    }
  }
}

function renderCurrentTestQuestion() {
  if (!currentTest || !currentTest.questions[testCurrentIndex]) return;

  const q = currentTest.questions[testCurrentIndex];
  const total = currentTest.questions.length;
  const isMulti = q.is_multi_answer || (q.correct_option_indices && q.correct_option_indices.length > 1);

  document.getElementById('test-item-indicator').innerText = `Question ${testCurrentIndex + 1} of ${total}`;
  document.getElementById('test-q-prompt').innerText = q.prompt;

  // Badges
  const badgesWrap = document.getElementById('test-q-badges');
  const multiTag = isMulti ? '<span class="badge-tag badge-multi">Multiple Answers (Select all that apply)</span>' : '';
  badgesWrap.innerHTML = `
    <span class="badge-tag badge-lic">${escapeHtml(q.license_class)}</span>
    <span class="badge-tag">${escapeHtml(q.section)}</span>
    ${multiTag}
  `;

  // Image
  const imgWrap = document.getElementById('test-q-image-wrap');
  const img = document.getElementById('test-q-image');
  if (q.has_image && q.image_url) {
    img.src = q.image_url;
    imgWrap.style.display = 'block';
  } else {
    imgWrap.style.display = 'none';
  }

  // Options
  const optsContainer = document.getElementById('test-options-container');
  optsContainer.innerHTML = '';

  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const savedAns = testAnswers[testCurrentIndex];
  const inputType = isMulti ? 'checkbox' : 'radio';
  const selectedIndices = new Set(
    savedAns && savedAns.selected_indices ? savedAns.selected_indices :
    (savedAns && savedAns.selected_index !== undefined && savedAns.selected_index !== null && savedAns.selected_index >= 0 ? [savedAns.selected_index] : [])
  );

  q.options.forEach((opt, idx) => {
    const letter = letters[idx] || (idx + 1);
    const isSelected = selectedIndices.has(idx);

    const label = document.createElement('label');
    label.className = `test-opt-label ${isSelected ? 'selected' : ''}`;
    label.innerHTML = `
      <input type="${inputType}" name="test-opt" class="test-opt-radio" value="${idx}" ${isSelected ? 'checked' : ''} />
      <span style="font-weight:700; min-width:24px; color:var(--slate-500);">[${letter}]</span>
      <span>${escapeHtml(opt)}</span>
    `;

    const input = label.querySelector('input');
    input.addEventListener('change', () => {
      if (isMulti) {
        if (input.checked) {
          selectedIndices.add(idx);
          label.classList.add('selected');
        } else {
          selectedIndices.delete(idx);
          label.classList.remove('selected');
        }
        recordTestAnswerMulti(testCurrentIndex, q.canonical_id, Array.from(selectedIndices));
      } else {
        document.querySelectorAll('.test-opt-label').forEach(l => l.classList.remove('selected'));
        label.classList.add('selected');
        recordTestAnswer(testCurrentIndex, q.canonical_id, idx);
      }
      updateNavigatorButtons();
    });

    optsContainer.appendChild(label);
  });

  // Flag state
  const flagBtn = document.getElementById('btn-test-flag');
  if (savedAns && savedAns.flagged) {
    flagBtn.classList.add('active');
    flagBtn.innerText = 'Flagged for Review';
  } else {
    flagBtn.classList.remove('active');
    flagBtn.innerText = 'Flag for Review';
  }

  // Prev / Next button states
  document.getElementById('btn-test-prev').disabled = (testCurrentIndex === 0);
  document.getElementById('btn-test-next').innerText = (testCurrentIndex === total - 1) ? 'Review / Finish' : 'Next →';

  updateNavigatorButtons();
}

function recordTestAnswer(itemIdx, qid, selectedIdx) {
  if (!testAnswers[itemIdx]) {
    testAnswers[itemIdx] = {
      question_id: qid,
      selected_index: selectedIdx,
      selected_indices: [selectedIdx],
      flagged: false
    };
  } else {
    testAnswers[itemIdx].selected_index = selectedIdx;
    testAnswers[itemIdx].selected_indices = [selectedIdx];
  }
}

function recordTestAnswerMulti(itemIdx, qid, selectedIndices) {
  if (!testAnswers[itemIdx]) {
    testAnswers[itemIdx] = {
      question_id: qid,
      selected_index: selectedIndices.length > 0 ? selectedIndices[0] : -1,
      selected_indices: selectedIndices,
      flagged: false
    };
  } else {
    testAnswers[itemIdx].selected_index = selectedIndices.length > 0 ? selectedIndices[0] : -1;
    testAnswers[itemIdx].selected_indices = selectedIndices;
  }
}

function toggleTestFlag() {
  if (!currentTest) return;
  const qid = currentTest.questions[testCurrentIndex].canonical_id;
  if (!testAnswers[testCurrentIndex]) {
    testAnswers[testCurrentIndex] = { question_id: qid, selected_index: null, flagged: true };
  } else {
    testAnswers[testCurrentIndex].flagged = !testAnswers[testCurrentIndex].flagged;
  }
  renderCurrentTestQuestion();
}

function prevTestQuestion() {
  if (testCurrentIndex > 0) {
    testCurrentIndex--;
    renderCurrentTestQuestion();
  }
}

function nextTestQuestion() {
  if (testCurrentIndex < currentTest.questions.length - 1) {
    testCurrentIndex++;
    renderCurrentTestQuestion();
  } else {
    promptSubmitTest();
  }
}

function promptSubmitTest() {
  const total = currentTest.questions.length;
  let answeredCount = 0;
  for (let i = 0; i < total; i++) {
    const a = testAnswers[i];
    if (a) {
      if (Array.isArray(a.selected_indices) && a.selected_indices.length > 0) {
        answeredCount++;
      } else if (a.selected_index !== null && a.selected_index !== undefined && a.selected_index !== -1) {
        answeredCount++;
      }
    }
  }

  const unanswered = total - answeredCount;
  const warnText = document.getElementById('submit-unanswered-warn');

  if (unanswered > 0) {
    warnText.innerHTML = `You have <b>${unanswered} unanswered question${unanswered > 1 ? 's' : ''}</b> out of ${total}.<br><br>Unanswered questions will be marked as incorrect. Are you sure you want to finish and submit?`;
  } else {
    warnText.innerHTML = `You have answered all <b>${total} questions</b>. Are you ready to submit and calculate your official score?`;
  }

  document.getElementById('submitConfirmDialog').showModal();
}

async function submitMockTest() {
  document.getElementById('submitConfirmDialog').close();
  clearInterval(testTimerInterval);

  const timeSpent = Math.max(1, Math.floor((Date.now() - testStartTime) / 1000));
  const payloadAnswers = [];

  for (let i = 0; i < currentTest.questions.length; i++) {
    const q = currentTest.questions[i];
    const ans = testAnswers[i];
    const userChoices = (ans && Array.isArray(ans.selected_indices)) ? ans.selected_indices : (ans && ans.selected_index !== null && ans.selected_index !== undefined && ans.selected_index !== -1 ? [ans.selected_index] : []);
    const userChoice = (userChoices.length > 0) ? userChoices[0] : -1;
    const isFlagged = ans ? ans.flagged : false;
    payloadAnswers.push({
      question_id: q.canonical_id,
      selected_index: userChoice,
      selected_indices: userChoices,
      flagged: isFlagged
    });
  }

  try {
    const res = await authFetch('/api/test/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        time_spent_seconds: timeSpent,
        answers: payloadAnswers,
        test_type: 'mock_35'
      })
    });
    const result = await res.json();
    displayTestResults(result);
    loadHeaderStats();
  } catch (err) {
    alert('Error submitting test: ' + err.message);
  }
}

let lastTestResults = null;

function displayTestResults(result) {
  lastTestResults = result;
  switchView('results');

  // Verdict banner
  const banner = document.getElementById('results-verdict-banner');
  if (result.passed) {
    banner.className = 'verdict-banner verdict-pass';
    banner.innerHTML = `TEST PASSED — Score: ${result.score} / ${result.total_questions} (${result.percentage}%)<br><span style="font-size:14px; font-weight:600;">You met the official standard of 32/35. Outstanding driving knowledge!</span>`;
  } else {
    banner.className = 'verdict-banner verdict-fail';
    banner.innerHTML = `TEST NOT PASSED — Score: ${result.score} / ${result.total_questions} (${result.percentage}%)<br><span style="font-size:14px; font-weight:600;">Official pass mark is 32/35. You need ${(32 - result.score)} more correct answer${(32 - result.score) > 1 ? 's' : ''} to pass. Review below!</span>`;
  }

  // Summary boxes
  document.getElementById('res-score').innerText = `${result.score} / ${result.total_questions}`;
  document.getElementById('res-percent').innerText = `${result.percentage}%`;
  const m = Math.floor(result.time_spent_seconds / 60);
  const s = result.time_spent_seconds % 60;
  document.getElementById('res-time').innerText = `${m}m ${s}s`;
  document.getElementById('res-status-lbl').innerText = result.passed ? 'PASSED' : 'FAILED';
  document.getElementById('res-status-lbl').style.color = result.passed ? '#059669' : '#dc2626';

  // Section score bars
  const sectionBars = document.getElementById('res-section-bars');
  sectionBars.innerHTML = '<h4 style="font-size:14px; font-weight:800; color:var(--slate-800); margin-bottom:10px;">Section Breakdown:</h4>';

  for (const [sec, stats] of Object.entries(result.section_breakdown)) {
    const pct = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
    const barColor = pct >= 90 ? '#10b981' : (pct >= 70 ? '#f59e0b' : '#ef4444');

    sectionBars.innerHTML += `
      <div class="sec-score-row">
        <div class="sec-score-label">
          <span>${escapeHtml(sec)}</span>
          <span>${stats.correct} / ${stats.total} (${pct}%)</span>
        </div>
        <div class="sec-progress-track">
          <div class="sec-progress-fill" style="width: ${pct}%; background: ${barColor};"></div>
        </div>
      </div>
    `;
  }

  // Render review items
  renderReviewCards(result.review_items);
}

function renderReviewCards(items) {
  const container = document.getElementById('results-review-list');
  container.innerHTML = '';

  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

  items.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('data-correct', item.is_correct ? 'true' : 'false');
    card.setAttribute('data-flagged', item.flagged ? 'true' : 'false');

    const correctIndices = item.correct_option_indices || [item.correct_option_index];
    const correctSet = new Set(correctIndices);
    const userIndices = item.selected_indices || (item.selected_index >= 0 ? [item.selected_index] : []);
    const userSet = new Set(userIndices);
    const isMulti = item.is_multi_answer || correctIndices.length > 1;

    let optHtml = '';
    item.options.forEach((opt, oidx) => {
      const letter = letters[oidx] || (oidx + 1);
      let cls = '';
      let badge = '';

      const isAns = correctSet.has(oidx);
      const isChosen = userSet.has(oidx);

      if (isAns && isChosen) {
        cls = 'correct-highlight';
        badge = '<span class="correct-check">Correct Choice</span>';
      } else if (isAns && !isChosen) {
        cls = 'correct-highlight';
        badge = '<span class="correct-check">Correct Answer</span>';
      } else if (!isAns && isChosen) {
        cls = 'incorrect-highlight';
        badge = '<span style="margin-left:auto; color:#dc2626; font-weight:700; font-size:12px;">Your Choice</span>';
      }

      const bullet = isMulti ?
        `<input type="checkbox" class="study-opt-checkbox" ${isChosen ? 'checked' : ''} disabled style="pointer-events:none;" />` :
        `<input type="radio" class="study-opt-radio" ${isChosen ? 'checked' : ''} disabled style="pointer-events:none;" />`;

      optHtml += `
        <div class="study-opt-btn ${cls}" style="cursor: default;">
          ${bullet}
          <span class="opt-prefix">[${letter}]</span>
          <span class="opt-text">${escapeHtml(opt)}</span>
          ${badge}
        </div>
      `;
    });

    let imgHtml = '';
    if (item.has_image && item.image_url) {
      imgHtml = `
        <div class="q-card-image" onclick="zoomImage('${item.image_url}', 'Question ${idx + 1} Diagram')">
          <img src="${item.image_url}" alt="Diagram" />
        </div>
      `;
    }

    const statusBadge = item.is_correct ?
      '<span class="badge-tag" style="background:#f0fdf4; color:#16a34a; border-color:#bbf7d0; font-weight:700;">Correct</span>' :
      '<span class="badge-tag" style="background:#fef2f2; color:#dc2626; border-color:#fecaca; font-weight:700;">Incorrect</span>';

    const flaggedTag = item.flagged ? '<span class="badge-tag" style="background:#fef3c7; color:#b45309;">Flagged</span>' : '';
    const correctLettersStr = item.correct_letters ? item.correct_letters.join(', ') : item.correct_letter;
    const multiTag = isMulti ? `<span class="badge-tag badge-multi">Multiple Answers (${correctLettersStr})</span>` : '';

    card.innerHTML = `
      <div class="q-card-header">
        <div class="q-header-tags">
          <span class="badge-qnum">Item #${idx + 1}</span>
          <span class="badge-tag">${escapeHtml(item.section)}</span>
          ${multiTag}
          ${flaggedTag}
        </div>
        <div class="q-header-actions">
          ${statusBadge}
        </div>
      </div>

      <div class="q-prompt-text">${escapeHtml(item.prompt)}</div>

      <div class="q-card-body-layout">
        <div class="q-card-main-col">
          <div class="study-options-list">${optHtml}</div>
        </div>
        ${imgHtml}
      </div>

      <div class="q-explanation-box">
        <b>Explanation:</b> ${escapeHtml(item.explanation || 'Refer to standard New Zealand road rules.')}
      </div>
    `;

    container.appendChild(card);
  });
}

function filterReview(type) {
  document.querySelectorAll('#view-results .status-pills .pill-btn').forEach(b => b.classList.remove('active'));

  if (type === 'all') document.getElementById('btn-filter-rev-all').classList.add('active');
  if (type === 'wrong') document.getElementById('btn-filter-rev-wrong').classList.add('active');
  if (type === 'flagged') document.getElementById('btn-filter-rev-flagged').classList.add('active');

  const cards = document.querySelectorAll('#results-review-list .card');
  cards.forEach(card => {
    const isCorrect = card.getAttribute('data-correct') === 'true';
    const isFlagged = card.getAttribute('data-flagged') === 'true';

    if (type === 'all') {
      card.style.display = 'block';
    } else if (type === 'wrong') {
      card.style.display = isCorrect ? 'none' : 'block';
    } else if (type === 'flagged') {
      card.style.display = isFlagged ? 'block' : 'none';
    }
  });
}

function resetTestUI() {
  document.getElementById('test-welcome-screen').style.display = 'block';
  document.getElementById('test-active-screen').style.display = 'none';
}

// =============================================================================
// VIEW 4: GROWTH METRICS & DASHBOARD
// =============================================================================
function initMetrics() {
  document.getElementById('btn-reset-data').addEventListener('click', () => {
    document.getElementById('resetConfirmDialog').showModal();
  });
  document.getElementById('btn-confirm-reset').addEventListener('click', async () => {
    await authFetch('/api/reset', { method: 'POST' });
    document.getElementById('resetConfirmDialog').close();
    await checkCurrentUser();
    loadMetrics();
    alert('Study progress and test history have been reset for this profile.');
  });
}

async function loadMetrics() {
  if (!currentUser) {
    document.getElementById('metric-mastery-num').innerText = '0 / 716';
    document.getElementById('metric-mastery-sub').innerHTML = '<a href="javascript:void(0)" onclick="openAuthModal()" style="color:var(--primary); font-weight:600; text-decoration:underline;">Sign in to track progress</a>';
    document.getElementById('metric-readiness-num').innerText = '0%';
    document.getElementById('metric-tests-num').innerText = '0';
    document.getElementById('metric-tests-sub').innerHTML = '<a href="javascript:void(0)" onclick="openAuthModal()" style="color:var(--primary); font-weight:600; text-decoration:underline;">Sign in to record exams</a>';
    document.getElementById('metric-avg-score').innerText = '0 / 35';
    const tbody = document.getElementById('matrix-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--slate-500);">Sign in to your learner profile to track section-by-section mastery and test readiness.</td></tr>';
    const historyLog = document.getElementById('test-history-log');
    if (historyLog) {
      historyLog.innerHTML = '<div style="text-align:center; padding:24px; color:var(--slate-500); font-size:13.5px;">Sign in to track your mock exam scores and historical growth.<br><button type="button" class="btn-primary" style="margin-top:12px;" onclick="openAuthModal()">Sign In or Create Account</button></div>';
    }
    return;
  }

  try {
    const res = await authFetch('/api/metrics');
    if (!res.ok) {
      throw new Error(`Server error ${res.status}`);
    }
    const data = await res.json();

    // Summary Cards
    document.getElementById('metric-mastery-num').innerText = `${data.mastered_count} / ${data.total_questions}`;
    document.getElementById('metric-mastery-sub').innerText = `${data.mastery_percent}% mastered (${data.learning_count} learning, ${data.unseen_count} unseen)`;

    document.getElementById('metric-readiness-num').innerText = `${data.readiness_score}%`;
    document.getElementById('metric-tests-num').innerText = data.tests_taken;
    document.getElementById('metric-tests-sub').innerText = `${data.tests_passed} passed (${data.pass_rate}% pass rate)`;

    document.getElementById('metric-avg-score').innerText = `${data.avg_test_score} / 35`;

    // Render Section Matrix Table
    const tbody = document.getElementById('matrix-tbody');
    tbody.innerHTML = '';

    for (const [sec, s] of Object.entries(data.section_metrics)) {
      const accText = s.tested_accuracy !== null ? `${s.tested_accuracy}%` : '<span style="color:var(--slate-400);">Not tested</span>';
      const ratingClass = `rating-${s.rating.replace(/\s+/g, '-')}`;

      tbody.innerHTML += `
        <tr>
          <td><b>${escapeHtml(sec)}</b></td>
          <td>${s.total}</td>
          <td><span style="color:#059669; font-weight:700;">${s.mastered}</span> / ${s.total}</td>
          <td>${accText}</td>
          <td style="min-width: 140px;">
            <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:2px;">
              <span>${s.mastery_percent}%</span>
            </div>
            <div class="sec-progress-track">
              <div class="sec-progress-fill" style="width: ${s.mastery_percent}%; background: ${s.mastery_percent >= 80 ? '#10b981' : '#3b82f6'};"></div>
            </div>
          </td>
          <td><span class="rating-badge ${ratingClass}">${s.rating}</span></td>
        </tr>
      `;
    }

    // Load History Chart
    loadHistoryChart();

    // Load Test Log
    loadTestHistoryList();
  } catch (err) {
    console.error('Failed to load metrics:', err);
  }
}

async function loadHistoryChart() {
  try {
    const res = await authFetch('/api/test/history?limit=30');
    const tests = await res.json();

    const ctx = document.getElementById('scoreHistoryChart').getContext('2d');
    if (historyChart) {
      historyChart.destroy();
    }

    if (tests.length === 0) {
      // Empty placeholder
      tests.push({ timestamp: 'Start', score: 0 });
    }

    // Sort chronologically for chart
    const chronological = [...tests].reverse();
    const labels = chronological.map((t, idx) => `Test #${idx + 1}`);
    const scores = chronological.map(t => t.score);
    const passLine = chronological.map(() => 32);

    historyChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Your Score (out of 35)',
            data: scores,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.1)',
            fill: true,
            tension: 0.25,
            pointRadius: 5,
            pointBackgroundColor: '#2563eb'
          },
          {
            label: 'Official Pass Mark (32 / 35)',
            data: passLine,
            borderColor: '#dc2626',
            borderDash: [6, 6],
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            min: 0,
            max: 35,
            ticks: { stepSize: 5 }
          }
        },
        plugins: {
          legend: { position: 'top' }
        }
      }
    });
  } catch (err) {
    console.error('Failed to render history chart:', err);
  }
}

async function loadTestHistoryList() {
  const container = document.getElementById('test-history-log');
  container.innerHTML = '';
  if (!currentUser) return;

  try {
    const res = await authFetch('/api/test/history?limit=10');
    if (!res.ok) {
      return;
    }
    const list = await res.json();

    if (list.length === 0) {
      container.innerHTML = '<div style="color:var(--slate-500); padding: 10px; font-size:13px;">No mock tests completed yet. Start your first 35-question test above!</div>';
      return;
    }

    list.forEach(t => {
      const dt = new Date(t.timestamp).toLocaleDateString() + ' ' + new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const m = Math.floor(t.time_spent_seconds / 60);
      const s = t.time_spent_seconds % 60;
      const passTag = t.passed ?
        '<span class="rating-badge rating-Strong">PASSED</span>' :
        '<span class="rating-badge rating-Needs-Focus">FAILED</span>';

      container.innerHTML += `
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 10px 14px; background:var(--slate-50); border:1px solid var(--slate-200); border-radius:6px; font-size:13.5px;">
          <div>
            <b>${dt}</b> — <span style="color:var(--slate-500);">${m}m ${s}s</span>
          </div>
          <div style="display:flex; align-items:center; gap:12px;">
            <b style="font-size:15px; color: ${t.passed ? '#059669' : '#dc2626'};">${t.score} / ${t.total_questions}</b>
            ${passTag}
          </div>
        </div>
      `;
    });
  } catch (err) {
    console.error('Failed to load test history log:', err);
  }
}

// =============================================================================
// VIEW 5: WEAK AREAS TARGETED PRACTICE
// =============================================================================
async function loadWeakAreas() {
  const container = document.getElementById('weak-questions-container');
  if (!container) return;
  if (!currentUser) {
    container.innerHTML = `
      <div style="text-align:center; padding: 50px 20px; background:#fff; border-radius:12px; border:1px solid var(--border); box-shadow:var(--shadow-sm); max-width:600px; margin: 20px auto;">
        <h3 style="font-size: 18px; font-weight:800; color:var(--slate-900);">Personalized Weak Areas</h3>
        <p style="color: var(--slate-600); margin-top: 8px; font-size: 14px; line-height: 1.5;">Sign in or create a learner profile to automatically track questions you get wrong on mock exams or study sessions, and practice them until mastered.</p>
        <button type="button" class="btn-primary" style="margin-top: 16px;" onclick="openAuthModal()">Sign In or Create Account</button>
      </div>
    `;
    return;
  }
  container.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--slate-500);">Analyzing weak areas...</div>';

  try {
    const res = await authFetch('/api/weak-areas?limit=50');
    if (!res.ok) {
      throw new Error(`Server error ${res.status}`);
    }
    const questions = await res.json();

    if (!Array.isArray(questions) || questions.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding: 50px; background:#fff; border-radius:8px; border:1px solid var(--slate-200);">
          <h3 style="font-size: 18px; font-weight:800; color:var(--slate-900);">Zero Weak Areas Found</h3>
          <p style="color: var(--slate-600); margin-top: 6px;">You haven't made any mistakes on your tests yet. Take a mock test or study more questions to build your profile.</p>
          <button class="btn-primary" style="margin-top: 16px;" onclick="switchView('test')">Take a 35-Question Mock Test</button>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    questions.forEach(q => {
      container.appendChild(createStudyQuestionCard(q));
    });
  } catch (err) {
    container.innerHTML = `<div style="color:red; text-align:center; padding: 20px;">Error loading weak areas: ${err.message}</div>`;
  }
}

// =============================================================================
// UTILITIES: Modal Image Zoom & HTML Escape
// =============================================================================
function zoomImage(src, title = 'Road Diagram') {
  const dialog = document.getElementById('imgDialog');
  document.getElementById('modalZoomImg').src = src;
  document.getElementById('imgDialogTitle').innerText = title;
  dialog.showModal();
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// =============================================================================
// MULTI-USER PROFILES & AUTHENTICATION
// =============================================================================
function initAuth() {
  const profileBtn = document.getElementById('btn-user-profile');
  if (profileBtn) {
    profileBtn.addEventListener('click', openAuthModal);
  }

  // Escape key listener to close auth modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('authModal');
      if (modal && modal.open) modal.close();
    }
  });

  // Auth Tabs Switching (Modal)
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');

  if (tabLogin && tabRegister) {
    tabLogin.addEventListener('click', () => {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      if (formLogin) formLogin.classList.add('active');
      if (formRegister) formRegister.classList.remove('active');
      hideAuthAlert();
    });

    tabRegister.addEventListener('click', () => {
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      if (formRegister) formRegister.classList.add('active');
      if (formLogin) formLogin.classList.remove('active');
      hideAuthAlert();
    });
  }

  // Login Form Submit (Modal)
  if (formLogin) {
    formLogin.addEventListener('submit', handleLogin);
  }

  // Register Form Submit (Modal)
  if (formRegister) {
    formRegister.addEventListener('submit', handleRegister);
  }

  // Logout Button
  const logoutBtn = document.getElementById('btn-auth-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  // Auth Gate Tab Switching
  const gateTabLogin = document.getElementById('gate-tab-login');
  const gateTabRegister = document.getElementById('gate-tab-register');
  const gateFormLogin = document.getElementById('gate-form-login');
  const gateFormRegister = document.getElementById('gate-form-register');

  if (gateTabLogin && gateTabRegister) {
    gateTabLogin.addEventListener('click', () => {
      gateTabLogin.classList.add('active');
      gateTabRegister.classList.remove('active');
      if (gateFormLogin) gateFormLogin.classList.add('active');
      if (gateFormRegister) gateFormRegister.classList.remove('active');
      const gateAlert = document.getElementById('gate-alert');
      if (gateAlert) gateAlert.style.display = 'none';
    });
    gateTabRegister.addEventListener('click', () => {
      gateTabRegister.classList.add('active');
      gateTabLogin.classList.remove('active');
      if (gateFormRegister) gateFormRegister.classList.add('active');
      if (gateFormLogin) gateFormLogin.classList.remove('active');
      const gateAlert = document.getElementById('gate-alert');
      if (gateAlert) gateAlert.style.display = 'none';
    });

    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('tab') === 'register' && gateTabRegister) {
        gateTabRegister.click();
      }
    } catch (e) {}
  }

  // Gate Sign In Submit
  if (gateFormLogin) {
    gateFormLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertEl = document.getElementById('gate-alert');
      if (alertEl) alertEl.style.display = 'none';
      const username = document.getElementById('gate-login-username').value.trim();
      const password = document.getElementById('gate-login-password').value;
      if (!username || !password) {
        if (alertEl) {
          alertEl.className = 'auth-alert error';
          alertEl.innerText = 'Please enter both username and password.';
          alertEl.style.display = 'block';
        }
        return;
      }
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) {
          if (alertEl) {
            alertEl.className = 'auth-alert error';
            alertEl.innerText = data.detail || 'Sign in failed. Check your credentials.';
            alertEl.style.display = 'block';
          }
          return;
        }
        localStorage.setItem('nz_roadcode_token', data.token);
        currentUser = data.user;
        hideAuthGate();
        document.getElementById('gate-login-password').value = '';
        await checkCurrentUser();
        refreshCurrentView();
      } catch (err) {
        if (alertEl) {
          alertEl.className = 'auth-alert error';
          alertEl.innerText = 'Network error. Please try again.';
          alertEl.style.display = 'block';
        }
      }
    });
  }

  // Gate Create Account Submit
  if (gateFormRegister) {
    gateFormRegister.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertEl = document.getElementById('gate-alert');
      if (alertEl) alertEl.style.display = 'none';
      const username = document.getElementById('gate-reg-username').value.trim();
      const email = document.getElementById('gate-reg-email').value.trim();
      const displayName = document.getElementById('gate-reg-display').value.trim();
      const password = document.getElementById('gate-reg-password').value;
      const confirmPassword = document.getElementById('gate-reg-confirm').value;
      if (!username) {
        if (alertEl) {
          alertEl.className = 'auth-alert error';
          alertEl.innerText = 'Please enter a username.';
          alertEl.style.display = 'block';
        }
        return;
      }
      if (!email || !email.includes('@') || !email.includes('.')) {
        if (alertEl) {
          alertEl.className = 'auth-alert error';
          alertEl.innerText = 'Please enter a valid email address.';
          alertEl.style.display = 'block';
        }
        return;
      }
      if (password.length < 4) {
        if (alertEl) {
          alertEl.className = 'auth-alert error';
          alertEl.innerText = 'Password must be at least 4 characters.';
          alertEl.style.display = 'block';
        }
        return;
      }
      if (password !== confirmPassword) {
        if (alertEl) {
          alertEl.className = 'auth-alert error';
          alertEl.innerText = 'Passwords do not match.';
          alertEl.style.display = 'block';
        }
        return;
      }
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, display_name: displayName || username, password })
        });
        const data = await res.json();
        if (!res.ok) {
          if (alertEl) {
            alertEl.className = 'auth-alert error';
            alertEl.innerText = data.detail || 'Account creation failed.';
            alertEl.style.display = 'block';
          }
          return;
        }
        localStorage.setItem('nz_roadcode_token', data.token);
        currentUser = data.user;
        hideAuthGate();
        gateFormRegister.reset();
        await checkCurrentUser();
        refreshCurrentView();
      } catch (err) {
        if (alertEl) {
          alertEl.className = 'auth-alert error';
          alertEl.innerText = 'Network error. Please try again.';
          alertEl.style.display = 'block';
        }
      }
    });
  }
}

async function checkCurrentUser() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const paramToken = urlParams.get('token');
    if (paramToken) {
      localStorage.setItem('nz_roadcode_token', paramToken);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  } catch (e) {}

  const token = localStorage.getItem('nz_roadcode_token');
  if (!token) {
    currentUser = null;
    const hdrName = document.getElementById('hdr-user-name');
    if (hdrName) hdrName.innerText = 'Sign In';
    const hdrMastery = document.getElementById('hdr-mastery');
    if (hdrMastery) hdrMastery.innerText = '0 / 716';
    const hdrReadiness = document.getElementById('hdr-readiness');
    if (hdrReadiness) hdrReadiness.innerText = '0%';
    return false;
  }
  try {
    const res = await authFetch('/api/auth/me');
    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem('nz_roadcode_token');
      }
      currentUser = null;
      const hdrName = document.getElementById('hdr-user-name');
      if (hdrName) hdrName.innerText = 'Sign In';
      return false;
    }
    const data = await res.json();
    currentUser = data.user;
    hideAuthGate();

    // Update Header
    const hdrName = document.getElementById('hdr-user-name');
    if (hdrName) {
      hdrName.innerText = currentUser.display_name || currentUser.username;
    }
    const hdrMastery = document.getElementById('hdr-mastery');
    if (hdrMastery) {
      hdrMastery.innerText = `${data.mastered_count} / ${data.total_questions || 716}`;
    }
    const hdrReadiness = document.getElementById('hdr-readiness');
    if (hdrReadiness) {
      hdrReadiness.innerText = `${data.readiness_score}%`;
    }

    // Update Active Profile Card in Modal
    const modalName = document.getElementById('modal-active-name');
    if (modalName) modalName.innerText = currentUser.display_name || currentUser.username;
    const modalUser = document.getElementById('modal-active-username');
    if (modalUser) modalUser.innerText = `Username: ${currentUser.username}`;
    const modalEmail = document.getElementById('modal-active-email');
    if (modalEmail) modalEmail.innerText = currentUser.email ? `Email: ${currentUser.email}` : '';
    const modalMastery = document.getElementById('modal-active-mastery');
    if (modalMastery) modalMastery.innerText = data.mastered_count;
    const modalReadiness = document.getElementById('modal-active-readiness');
    if (modalReadiness) modalReadiness.innerText = `${data.readiness_score}%`;
    const modalTests = document.getElementById('modal-active-tests');
    if (modalTests) modalTests.innerText = data.tests_taken;

    // Refresh saved profiles list in switcher
    loadProfilesList();
    return true;
  } catch (err) {
    console.error('Failed to verify current user:', err);
    currentUser = null;
    const hdrName = document.getElementById('hdr-user-name');
    if (hdrName) hdrName.innerText = 'Sign In';
    return false;
  }
}

function showAuthGate() {
  const gate = document.getElementById('auth-gate');
  if (gate) {
    gate.classList.add('visible');
    gate.style.display = 'flex';
  }
}

function hideAuthGate() {
  const gate = document.getElementById('auth-gate');
  if (gate) {
    gate.classList.remove('visible');
    gate.style.display = 'none';
  }
}


async function loadProfilesList() {
  const modalContainer = document.getElementById('saved-profiles-list');
  const gateContainer = document.getElementById('gate-saved-profiles-list');
  const gateSection = document.getElementById('gate-section-saved-profiles');

  try {
    const res = await fetch('/api/auth/users');
    if (!res.ok) return;
    allProfiles = await res.json();

    if (!Array.isArray(allProfiles) || allProfiles.length === 0) {
      if (modalContainer) modalContainer.innerHTML = '<span style="font-size: 12px; color: var(--slate-400);">No other profiles registered yet.</span>';
      if (gateSection) gateSection.style.display = 'none';
      return;
    }

    if (gateSection) gateSection.style.display = 'block';

    const renderChips = (container, isGate) => {
      if (!container) return;
      container.innerHTML = '';
      allProfiles.forEach(u => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'profile-chip' + (currentUser && currentUser.id === u.id ? ' active-chip' : '');
        const activeLabel = (currentUser && currentUser.id === u.id) ? ' (Active)' : '';
        chip.innerText = `${u.display_name || u.username} (${u.mastered_count} mastered)${activeLabel}`;
        chip.title = `Switch to profile @${u.username}`;

        chip.addEventListener('click', () => {
          if (isGate) {
            const tab = document.getElementById('gate-tab-login');
            if (tab) tab.click();
            const userInput = document.getElementById('gate-login-username');
            if (userInput) userInput.value = u.username;
            const passInput = document.getElementById('gate-login-password');
            if (passInput) {
              passInput.value = '';
              passInput.focus();
            }
          } else {
            if (currentUser && currentUser.id === u.id) return;
            const tabLogin = document.getElementById('tab-login');
            if (tabLogin) tabLogin.click();
            const userInput = document.getElementById('login-username');
            if (userInput) userInput.value = u.username;
            const passInput = document.getElementById('login-password');
            if (passInput) {
              passInput.value = '';
              passInput.focus();
            }
            showAuthAlert(`Enter password for profile "${u.display_name || u.username}" to sign in.`, 'info');
          }
        });

        container.appendChild(chip);
      });
    };

    renderChips(modalContainer, false);
    renderChips(gateContainer, true);
  } catch (err) {
    console.error('Failed to load profiles list:', err);
  }
}

function openAuthModal() {
  hideAuthAlert();
  const activeCard = document.getElementById('active-profile-card');
  if (activeCard) {
    activeCard.style.display = currentUser ? 'block' : 'none';
  }
  loadProfilesList();
  const dialog = document.getElementById('authModal');
  if (dialog) dialog.showModal();
}

function showAuthAlert(message, type = 'error') {
  const alertEl = document.getElementById('auth-alert');
  if (!alertEl) return;
  alertEl.className = `auth-alert ${type}`;
  alertEl.innerText = message;
  alertEl.style.display = 'block';
}

function hideAuthAlert() {
  const alertEl = document.getElementById('auth-alert');
  if (alertEl) alertEl.style.display = 'none';
}

async function handleLogin(e) {
  e.preventDefault();
  hideAuthAlert();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  if (!username || !password) {
    showAuthAlert('Please enter both username and password.');
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!res.ok) {
      showAuthAlert(data.detail || 'Sign in failed. Check your username and password.');
      return;
    }

    // Success
    localStorage.setItem('nz_roadcode_token', data.token);
    currentUser = data.user;
    hideAuthGate();
    const modal = document.getElementById('authModal');
    if (modal && modal.open) modal.close();
    document.getElementById('login-password').value = '';

    await checkCurrentUser();
    refreshCurrentView();
  } catch (err) {
    showAuthAlert('Network error while signing in. Please try again.');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  hideAuthAlert();
  const username = document.getElementById('reg-username').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const displayName = document.getElementById('reg-display-name').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirmPassword = document.getElementById('reg-confirm-password').value;

  if (!username) {
    showAuthAlert('Please enter a username.');
    return;
  }
  if (!email || !email.includes('@') || !email.includes('.')) {
    showAuthAlert('Please enter a valid email address.');
    return;
  }
  if (password.length < 4) {
    showAuthAlert('Password must be at least 4 characters long.');
    return;
  }
  if (password !== confirmPassword) {
    showAuthAlert('Passwords do not match. Please retype them carefully.');
    return;
  }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        email,
        display_name: displayName || username,
        password
      })
    });

    const data = await res.json();
    if (!res.ok) {
      showAuthAlert(data.detail || 'Profile creation failed.');
      return;
    }

    // Success
    localStorage.setItem('nz_roadcode_token', data.token);
    currentUser = data.user;
    hideAuthGate();
    const modal = document.getElementById('authModal');
    if (modal && modal.open) modal.close();
    document.getElementById('form-register').reset();

    await checkCurrentUser();
    refreshCurrentView();
  } catch (err) {
    showAuthAlert('Network error while creating profile. Please try again.');
  }
}

async function handleLogout() {
  try {
    await authFetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    console.error('Logout error:', err);
  }
  localStorage.removeItem('nz_roadcode_token');
  currentUser = null;
  const container = document.getElementById('study-questions-container');
  if (container) container.innerHTML = '';
  const weakContainer = document.getElementById('weak-questions-container');
  if (weakContainer) weakContainer.innerHTML = '';
  const hdrName = document.getElementById('hdr-user-name');
  if (hdrName) hdrName.innerText = 'Sign In';
  const hdrMastery = document.getElementById('hdr-mastery');
  if (hdrMastery) hdrMastery.innerText = '0 / 716';
  const hdrReadiness = document.getElementById('hdr-readiness');
  if (hdrReadiness) hdrReadiness.innerText = '0%';
  // Close profile modal if open
  const modal = document.getElementById('authModal');
  if (modal && modal.open) modal.close();
  showAuthGate();
  loadProfilesList();
}

function refreshCurrentView() {
  if (currentView === 'study') {
    loadStudyQuestions();
  } else if (currentView === 'metrics') {
    loadMetrics();
  } else if (currentView === 'weak') {
    loadWeakAreas();
  }
}

