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
  initVoiceEngine();
  loadProfilesList();
  const authed = await checkCurrentUser();
  if (authed) {
    hideAuthGate();
    const urlParams = new URLSearchParams(window.location.search);
    const targetView = urlParams.get('view') || (window.location.hash ? window.location.hash.replace('#', '') : null);
    if (targetView && ['routes', 'theory', 'study', 'test', 'metrics', 'weak'].includes(targetView)) {
      switchView(targetView);
    } else {
      loadStudyQuestions();
    }
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
  } else if (viewName === 'theory') {
    loadTheoryView();
  } else if (viewName === 'routes') {
    loadRoutesView();
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
    if (urlParams.get('search')) {
      studyFilters.search = urlParams.get('search');
      const sInput = document.getElementById('filter-search');
      if (sInput) sInput.value = studyFilters.search;
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
    document.getElementById('metric-mastery-num').innerText = '0 / 570';
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
  if (str === null || str === undefined) return '';
  if (Array.isArray(str)) return str.map(escapeHtml).join(' ');
  if (typeof str !== 'string') str = String(str);
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
    if (hdrMastery) hdrMastery.innerText = '0 / 570';
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
      hdrMastery.innerText = `${data.mastered_count} / ${data.total_questions || 570}`;
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
  if (hdrMastery) hdrMastery.innerText = '0 / 570';
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
  } else if (currentView === 'theory') {
    loadTheoryView();
  } else if (currentView === 'metrics') {
    loadMetrics();
  } else if (currentView === 'weak') {
    loadWeakAreas();
  }
}

// =============================================================================
// THEORY HANDBOOK & DRIVE GO VIDEO LESSONS MODULE
// =============================================================================
let theoryGuideData = null;
let driveGoVideosData = null;
let activeTheoryTab = 'handbook'; // 'handbook' | 'videos'
let selectedVideoCategory = 'All';
let videoSearchQuery = '';
let theoryModuleInitialized = false;

function initTheoryModule() {
  if (theoryModuleInitialized) return;
  theoryModuleInitialized = true;

  const btnHandbook = document.getElementById('tab-btn-handbook');
  const btnVideos = document.getElementById('tab-btn-videos');

  if (btnHandbook) {
    btnHandbook.addEventListener('click', () => {
      activeTheoryTab = 'handbook';
      updateTheoryTabPanes();
    });
  }

  if (btnVideos) {
    btnVideos.addEventListener('click', () => {
      activeTheoryTab = 'videos';
      updateTheoryTabPanes();
      if (!driveGoVideosData) {
        fetchDriveGoVideos();
      }
    });
  }

  const toggleAllBtn = document.getElementById('btn-toggle-all-chapters');
  if (toggleAllBtn) {
    toggleAllBtn.addEventListener('click', () => {
      toggleAllChapters();
    });
  }

  const searchInput = document.getElementById('video-search-input');
  if (searchInput) {
    let searchDebounce;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        videoSearchQuery = e.target.value.trim().toLowerCase();
        renderDriveGoVideos();
      }, 200);
    });
  }

  // Ensure iframe stops audio when dialog is closed via Esc or click outside
  const videoDialog = document.getElementById('videoModal');
  if (videoDialog) {
    videoDialog.addEventListener('close', () => {
      const iframe = document.getElementById('videoModalIframe');
      if (iframe) iframe.src = '';
    });
  }
}

function updateTheoryTabPanes() {
  const btnHandbook = document.getElementById('tab-btn-handbook');
  const btnVideos = document.getElementById('tab-btn-videos');
  const paneHandbook = document.getElementById('theory-pane-handbook');
  const paneVideos = document.getElementById('theory-pane-videos');

  if (activeTheoryTab === 'handbook') {
    if (btnHandbook) {
      btnHandbook.classList.add('active');
      btnHandbook.setAttribute('aria-selected', 'true');
    }
    if (btnVideos) {
      btnVideos.classList.remove('active');
      btnVideos.setAttribute('aria-selected', 'false');
    }
    if (paneHandbook) {
      paneHandbook.classList.add('active');
      paneHandbook.style.display = 'block';
    }
    if (paneVideos) {
      paneVideos.classList.remove('active');
      paneVideos.style.display = 'none';
    }
  } else {
    if (btnVideos) {
      btnVideos.classList.add('active');
      btnVideos.setAttribute('aria-selected', 'true');
    }
    if (btnHandbook) {
      btnHandbook.classList.remove('active');
      btnHandbook.setAttribute('aria-selected', 'false');
    }
    if (paneVideos) {
      paneVideos.classList.add('active');
      paneVideos.style.display = 'block';
    }
    if (paneHandbook) {
      paneHandbook.classList.remove('active');
      paneHandbook.style.display = 'none';
    }
  }
}

async function loadTheoryView() {
  initTheoryModule();
  updateTheoryTabPanes();

  if (activeTheoryTab === 'handbook') {
    if (!theoryGuideData) {
      await fetchTheoryGuide();
    } else {
      renderTheoryHandbook();
    }
  } else {
    if (!driveGoVideosData) {
      await fetchDriveGoVideos();
    } else {
      renderDriveGoVideos();
    }
  }
}

async function fetchTheoryGuide() {
  const container = document.getElementById('theory-chapters-container');
  if (container) {
    container.innerHTML = '<div class="loading-state">Loading official theory handbook...</div>';
  }

  try {
    const res = await authFetch('/api/theory/guide');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    theoryGuideData = data.chapters || [];
    renderTheoryHandbook();
  } catch (err) {
    console.error('Failed to load theory guide:', err);
    if (container) {
      container.innerHTML = `
        <div class="test-welcome-card" style="text-align: center; border-color: #fecaca; background: #fff5f5;">
          <h4 style="color: #dc2626; margin-bottom: 8px;">Unable to load Theory Handbook</h4>
          <p style="color: var(--slate-600); margin-bottom: 12px;">Check your connection and try refreshing.</p>
          <button class="btn-sm btn-primary" onclick="fetchTheoryGuide()">Retry</button>
        </div>
      `;
    }
  }
}

function renderTheoryHandbook() {
  const container = document.getElementById('theory-chapters-container');
  if (!container || !theoryGuideData) return;

  if (theoryGuideData.length === 0) {
    container.innerHTML = '<div class="loading-state">No theory chapters available.</div>';
    return;
  }

  // Chapter to related question section mapping
  const chapterSectionMap = {
    'licences': 'Core Rules & General Theory',
    'speeds-following': 'Core Rules & General Theory',
    'intersections-giveway': 'Intersections & Give-Way Scenarios',
    'signs-markings': 'Road Signs, Signals & Markings',
    'parking-towing': 'Parking & Stopping Restrictions',
    'vehicle-wof': 'Official NZTA Theory (Category 11)',
    'alcohol-drugs': 'Emergencies & Road Safety',
    'motorcycles-heavy': 'Motorcycle Specific (Class 6)'
  };

  // Chapter to Drive Go video playlist category mapping
  const chapterVideoMap = {
    'licences': '1. Starting out (off-road area)',
    'speeds-following': '4. Higher speed areas (80 to 100km/h)',
    'intersections-giveway': '3. Moving into traffic and intersections',
    'signs-markings': '2. Quiet streets (50km/h or less)',
    'parking-towing': '6. Reversing and parking',
    'vehicle-wof': '1. Starting out (off-road area)',
    'alcohol-drugs': '7. Tricky conditions',
    'motorcycles-heavy': '5. Motorways'
  };

  let html = '';
  theoryGuideData.forEach((ch, idx) => {
    const chNum = idx + 1;
    const isFirst = idx === 0;
    const relatedSection = chapterSectionMap[ch.id] || 'Core Rules & General Theory';
    const relatedVideoCat = chapterVideoMap[ch.id] || '';

    html += `
      <div class="chapter-card ${isFirst ? 'expanded' : ''}" id="chapter-card-${escapeHtml(ch.id)}">
        <div class="chapter-header" onclick="toggleChapter('${escapeHtml(ch.id)}')">
          <div class="chapter-title-group">
            <div class="chapter-number-badge">0${chNum}</div>
            <div class="chapter-title-wrap">
              <h4 class="chapter-title">${escapeHtml(ch.title)}</h4>
              <div class="chapter-summary">${escapeHtml(ch.summary)}</div>
            </div>
          </div>
          <div class="chapter-chevron">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
        </div>

        <div class="chapter-body">
          <div class="chapter-sections-list">
    `;

    (ch.sections || []).forEach(sec => {
      html += `
            <div class="chapter-section-item">
              <div class="chapter-section-heading">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
                <span>${escapeHtml(sec.heading)}</span>
              </div>
              <div class="chapter-section-content">${escapeHtml(sec.content)}</div>
            </div>
      `;
    });

    html += `
          </div>

          <div class="chapter-actions-bar">
            <button type="button" class="chapter-action-link" onclick="practiceTheorySection('${escapeHtml(relatedSection)}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
              </svg>
              <span>Practice Questions (${escapeHtml(relatedSection)})</span>
            </button>

            ${relatedVideoCat ? `
            <button type="button" class="chapter-action-link" style="color: #b91c1c; background: #fef2f2; border-color: #fecaca;" onclick="filterVideosByCategory('${escapeHtml(relatedVideoCat)}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="23 7 16 12 23 17 23 7"></polygon>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
              </svg>
              <span>Watch Drive Go Lessons</span>
            </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function toggleChapter(chapterId) {
  const card = document.getElementById(`chapter-card-${chapterId}`);
  if (card) {
    card.classList.toggle('expanded');
  }
}

function toggleAllChapters() {
  const cards = document.querySelectorAll('.chapter-card');
  const anyClosed = Array.from(cards).some(c => !c.classList.contains('expanded'));
  const btn = document.getElementById('btn-toggle-all-chapters');

  cards.forEach(c => {
    if (anyClosed) {
      c.classList.add('expanded');
    } else {
      c.classList.remove('expanded');
    }
  });

  if (btn) {
    btn.innerText = anyClosed ? 'Collapse All' : 'Expand All';
  }
}

function practiceTheorySection(sectionName) {
  switchView('study');
  const sectionFilter = document.getElementById('study-section-filter');
  if (sectionFilter) {
    sectionFilter.value = sectionName;
    studyFilters.section = sectionName;
    studyPage = 1;
    loadStudyQuestions();
  }
}

async function fetchDriveGoVideos() {
  const container = document.getElementById('video-lessons-grid');
  if (container) {
    container.innerHTML = '<div class="loading-state">Loading Drive Go video lessons...</div>';
  }

  try {
    const res = await authFetch('/api/theory/videos');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    driveGoVideosData = data;
    renderDriveGoCategories(data.categories || []);
    renderDriveGoVideos();
  } catch (err) {
    console.error('Failed to load drive go videos:', err);
    if (container) {
      container.innerHTML = `
        <div class="test-welcome-card" style="text-align: center; border-color: #fecaca; background: #fff5f5; grid-column: 1 / -1;">
          <h4 style="color: #dc2626; margin-bottom: 8px;">Unable to load Drive Go Video Lessons</h4>
          <p style="color: var(--slate-600); margin-bottom: 12px;">Check your connection and try refreshing.</p>
          <button class="btn-sm btn-primary" onclick="fetchDriveGoVideos()">Retry</button>
        </div>
      `;
    }
  }
}

function renderDriveGoCategories(categories) {
  const catContainer = document.getElementById('video-categories-container');
  if (!catContainer) return;

  let html = `
    <button type="button" class="video-cat-pill ${selectedVideoCategory === 'All' ? 'active' : ''}" onclick="setVideoCategory('All')">
      All Lessons (63)
    </button>
  `;

  categories.forEach(cat => {
    const isActive = selectedVideoCategory === cat;
    html += `
      <button type="button" class="video-cat-pill ${isActive ? 'active' : ''}" onclick="setVideoCategory('${escapeHtml(cat)}')">
        ${escapeHtml(cat)}
      </button>
    `;
  });

  catContainer.innerHTML = html;
}

function setVideoCategory(cat) {
  selectedVideoCategory = cat;
  if (driveGoVideosData) {
    renderDriveGoCategories(driveGoVideosData.categories || []);
  }
  renderDriveGoVideos();
}

function filterVideosByCategory(categoryName) {
  activeTheoryTab = 'videos';
  updateTheoryTabPanes();
  selectedVideoCategory = categoryName;

  if (!driveGoVideosData) {
    fetchDriveGoVideos();
  } else {
    renderDriveGoCategories(driveGoVideosData.categories || []);
    renderDriveGoVideos();
  }

  const paneVideos = document.getElementById('theory-pane-videos');
  if (paneVideos) {
    paneVideos.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderDriveGoVideos() {
  const container = document.getElementById('video-lessons-grid');
  if (!container || !driveGoVideosData) return;

  const allVideos = driveGoVideosData.videos || [];
  let filtered = allVideos;

  if (selectedVideoCategory && selectedVideoCategory !== 'All') {
    filtered = filtered.filter(v => v.category === selectedVideoCategory);
  }

  if (videoSearchQuery) {
    filtered = filtered.filter(v => {
      const target = `${v.title} ${v.category}`.toLowerCase();
      return target.includes(videoSearchQuery);
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="test-welcome-card" style="text-align: center; grid-column: 1 / -1; padding: 40px 20px;">
        <h4 style="color: var(--slate-800); margin-bottom: 6px;">No video lessons match your search</h4>
        <p style="color: var(--slate-500); font-size: 14px; margin-bottom: 12px;">Try a different keyword or switch category to 'All Lessons'.</p>
        <button class="btn-sm btn-secondary" onclick="setVideoCategory('All'); document.getElementById('video-search-input').value = ''; videoSearchQuery = ''; renderDriveGoVideos();">
          Reset Filter
        </button>
      </div>
    `;
    return;
  }

  let html = '';
  filtered.forEach(v => {
    const encodedVideo = encodeURIComponent(JSON.stringify(v));
    html += `
      <div class="video-card" onclick="openVideoModal('${encodedVideo}')">
        <div class="video-thumb-container">
          <img class="video-thumb-img" src="${escapeHtml(v.thumbnail_url)}" alt="${escapeHtml(v.title)}" loading="lazy" onerror="this.src='/static/favicon.png'" />
          <div class="video-play-overlay">
            <div class="video-play-icon-box">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </div>
          </div>
        </div>
        <div class="video-info-box">
          <div>
            <span class="video-cat-badge">${escapeHtml(v.category)}</span>
            <h4 class="video-card-title">${escapeHtml(v.title)}</h4>
          </div>
          <div class="video-card-action">
            <span>Watch Video Lesson</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function openVideoModal(videoObjOrJson) {
  let video = videoObjOrJson;
  if (typeof videoObjOrJson === 'string') {
    try {
      video = JSON.parse(decodeURIComponent(videoObjOrJson));
    } catch (e) {
      console.error('Error parsing video payload:', e);
      return;
    }
  }

  const modal = document.getElementById('videoModal');
  const titleEl = document.getElementById('videoModalTitle');
  const catEl = document.getElementById('videoModalCategory');
  const iframe = document.getElementById('videoModalIframe');
  const extLink = document.getElementById('videoModalExternalLink');

  if (titleEl) titleEl.innerText = video.title || 'Drive Go Lesson';
  if (catEl) catEl.innerText = video.category || 'Official Lesson';
  if (extLink) extLink.href = video.youtube_url || `https://www.youtube.com/watch?v=${video.video_id}`;

  if (iframe) {
    const embedUrl = video.embed_url || `https://www.youtube-nocookie.com/embed/${video.video_id}`;
    iframe.src = `${embedUrl}?autoplay=1&rel=0`;
  }

  if (modal && typeof modal.showModal === 'function') {
    modal.showModal();
  }
}

function closeVideoModal() {
  const modal = document.getElementById('videoModal');
  const iframe = document.getElementById('videoModalIframe');
  if (iframe) {
    iframe.src = '';
  }
  if (modal && modal.open) {
    modal.close();
  }
}

// Expose handlers globally for template onclick handlers
window.toggleChapter = toggleChapter;
window.toggleAllChapters = toggleAllChapters;
window.practiceTheorySection = practiceTheorySection;
window.filterVideosByCategory = filterVideosByCategory;
window.setVideoCategory = setVideoCategory;
window.openVideoModal = openVideoModal;
window.closeVideoModal = closeVideoModal;
window.fetchTheoryGuide = fetchTheoryGuide;
window.fetchDriveGoVideos = fetchDriveGoVideos;

// =============================================================================
// NEW ZEALAND PRACTICAL DRIVING TEST ROUTES & GOOGLE MAPS NAVIGATION
// =============================================================================
let allRoutesData = null;
let routesFilter = {
  region: 'all',
  area: 'all',
  test_type: 'all',
  search: ''
};
let routesEventsInitialized = false;

async function loadRoutesView() {
  initRoutesEventListeners();

  const container = document.getElementById('routes-centers-container');
  if (!allRoutesData) {
    if (container) {
      container.innerHTML = '<div class="loading-state">Loading New Zealand practical test routes...</div>';
    }
    try {
      const res = await fetch('/api/routes');
      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }
      allRoutesData = await res.json();
    } catch (err) {
      console.error('Failed to load driving routes:', err);
      if (container) {
        container.innerHTML = `
          <div style="text-align: center; padding: 40px; background: #ffffff; border-radius: 8px; border: 1px solid var(--slate-200);">
            <h3 style="font-size: 16px; font-weight: 700; color: var(--slate-800);">Unable to Load Test Routes</h3>
            <p style="color: var(--slate-600); margin: 6px 0 16px;">${err.message}</p>
            <button class="btn-primary" onclick="loadRoutesView()">Retry</button>
          </div>
        `;
      }
      return;
    }
  }

  applyRoutesFilter();
}

function initRoutesEventListeners() {
  if (routesEventsInitialized) return;
  routesEventsInitialized = true;

  // Search input
  const searchInput = document.getElementById('routes-search-input');
  const searchClear = document.getElementById('routes-search-clear');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        routesFilter.search = e.target.value.trim();
        if (searchClear) {
          searchClear.style.display = routesFilter.search ? 'flex' : 'none';
        }
        applyRoutesFilter();
      }, 200);
    });
  }

  if (searchClear) {
    searchClear.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        routesFilter.search = '';
        searchClear.style.display = 'none';
        searchInput.focus();
        applyRoutesFilter();
      }
    });
  }

  // Test type toggle buttons (All, Restricted, Full)
  document.querySelectorAll('.type-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      routesFilter.test_type = btn.getAttribute('data-type') || 'all';
      applyRoutesFilter();
    });
  });

  // Region dropdown select
  const regionSelect = document.getElementById('routes-region-select');
  if (regionSelect) {
    regionSelect.addEventListener('change', (e) => {
      routesFilter.region = e.target.value || 'all';
      document.querySelectorAll('.region-pill-btn').forEach(btn => {
        if (btn.getAttribute('data-region') === routesFilter.region) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
      applyRoutesFilter();
    });
  }

  // Region pill buttons
  document.querySelectorAll('.region-pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.region-pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      routesFilter.region = btn.getAttribute('data-region') || 'all';
      if (regionSelect) {
        regionSelect.value = routesFilter.region;
      }
      applyRoutesFilter();
    });
  });

  // Area pill buttons (if present)
  document.querySelectorAll('.area-pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.area-pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      routesFilter.area = btn.getAttribute('data-area') || 'all';
      applyRoutesFilter();
    });
  });
}

function applyRoutesFilter() {
  if (!allRoutesData || !allRoutesData.centers) return;

  const regionFilter = (routesFilter.region || 'all').toLowerCase();
  const areaFilter = (routesFilter.area || 'all').toLowerCase();
  const typeFilter = (routesFilter.test_type || 'all').toLowerCase();
  const searchFilter = (routesFilter.search || '').toLowerCase();

  let matchedCenters = [];
  let totalMatchingRoutes = 0;

  allRoutesData.centers.forEach(c => {
    // 1. Filter Region
    if (regionFilter !== 'all') {
      const cRegId = (c.region_id || '').toLowerCase();
      const cRegName = (c.region || '').toLowerCase();
      if (cRegId !== regionFilter && cRegName !== regionFilter && !cRegName.includes(regionFilter)) {
        return;
      }
    }

    // 2. Filter Area
    if (areaFilter !== 'all' && (c.area || '').toLowerCase() !== areaFilter) {
      return;
    }

    // 3. Filter Routes in this Center by Test Type
    let routes = c.routes || [];
    if (typeFilter !== 'all') {
      if (typeFilter === 'restricted') {
        routes = routes.filter(r => r.badge_type === 'restricted' || (r.test_type && r.test_type.toLowerCase().includes('restricted')));
      } else if (typeFilter === 'full') {
        routes = routes.filter(r => r.badge_type === 'full' || (r.test_type && r.test_type.toLowerCase().includes('full')));
      }
    }

    // 4. Search text
    if (searchFilter) {
      const centerMatch = (
        c.name.toLowerCase().includes(searchFilter) ||
        (c.region && c.region.toLowerCase().includes(searchFilter)) ||
        (c.suburb && c.suburb.toLowerCase().includes(searchFilter)) ||
        (c.address && c.address.toLowerCase().includes(searchFilter)) ||
        (c.key_features && c.key_features.some(kf => kf.toLowerCase().includes(searchFilter)))
      );

      if (!centerMatch) {
        routes = routes.filter(r => (
          r.name.toLowerCase().includes(searchFilter) ||
          (r.overview && r.overview.toLowerCase().includes(searchFilter)) ||
          (r.key_maneuvers && r.key_maneuvers.some(km => km.toLowerCase().includes(searchFilter))) ||
          (r.steps && r.steps.some(s => s.instruction.toLowerCase().includes(searchFilter)))
        ));
      }
    }

    if (routes.length > 0) {
      const cClone = Object.assign({}, c, { routes: routes });
      matchedCenters.push(cClone);
      totalMatchingRoutes += routes.length;
    }
  });

  // Update summary bar
  const summaryEl = document.getElementById('routes-summary-text');
  if (summaryEl) {
    summaryEl.innerText = `Showing ${matchedCenters.length} testing centre${matchedCenters.length === 1 ? '' : 's'} (${totalMatchingRoutes} route${totalMatchingRoutes === 1 ? '' : 's'})`;
  }

  renderRoutesCenters(matchedCenters);
}

function renderRoutesCenters(centers) {
  const container = document.getElementById('routes-centers-container');
  if (!container) return;

  if (centers.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 50px 20px; background: #ffffff; border-radius: 12px; border: 1px solid var(--slate-200);">
        <h3 style="font-size: 16px; font-weight: 800; color: var(--slate-800); margin: 0 0 6px;">No Driving Routes Found</h3>
        <p style="color: var(--slate-600); font-size: 14px; margin: 0 0 16px;">Try adjusting your search query, selecting another geographic area, or clearing filters.</p>
        <button type="button" class="btn-sm btn-secondary" onclick="resetRoutesFilters()">Reset All Filters</button>
      </div>
    `;
    return;
  }

  let html = '';
  centers.forEach(c => {
    const featuresHtml = (c.key_features || []).map(f => `<span class="center-feature-pill">${escapeHtml(f)}</span>`).join('');
    
    let routesHtml = '';
    (c.routes || []).forEach(r => {
      const isRestricted = r.badge_type === 'restricted';
      const badgeClass = isRestricted ? 'restricted' : 'full';
      const badgeText = isRestricted ? 'Restricted (1R)' : 'Full (1F)';

      routesHtml += `
        <div class="route-card" id="card-${escapeHtml(r.id)}">
          <div class="route-card-top">
            <div class="route-meta-badges">
              <span class="route-code-badge">${escapeHtml(r.route_code || 'Practical Route')}</span>
              <span class="route-type-badge ${badgeClass}">${badgeText}</span>
            </div>
            <h4 class="route-title">${escapeHtml(r.name)}</h4>
            <div class="route-stats-chips">
              <span class="route-chip">${escapeHtml(r.distance || '')}</span>
              <span class="route-chip">${escapeHtml(r.duration || '')}</span>
              <span class="route-chip">${escapeHtml(r.difficulty || 'Moderate')}</span>
              <span class="route-chip">${(r.steps || []).length} turns</span>
            </div>
            <p class="route-overview-text">${escapeHtml(r.overview || '')}</p>
          </div>
          <div class="route-actions-row">
            <button type="button" class="btn-gps-nav-primary" onclick="launchDriverNav('${escapeHtml(r.id)}', false)" title="Launch live turn-by-turn in-app GPS navigation with voice guidance">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>
              <span>Drive (Live GPS)</span>
            </button>
            <button type="button" class="btn-demo-sim-card" onclick="launchDriverNav('${escapeHtml(r.id)}', true)" title="Instant animated drive simulation with voice and speedometer playback">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              <span>Demo Drive</span>
            </button>
            <button type="button" class="btn-route-details" onclick="openRouteModal('${escapeHtml(r.id)}')" title="View turn-by-turn steps, examiner tips, and maneuvers">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
              <span>Steps &amp; Tips</span>
            </button>
            <a href="${escapeHtml(r.google_maps_url)}" target="_blank" rel="noopener noreferrer" class="btn-gmaps-secondary" title="Open live GPS directions in Google Maps">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
              <span>Google Maps</span>
            </a>
            <a href="/api/routes/route/${escapeHtml(r.id)}/gpx" class="btn-gpx-export" download title="Download GPX file for Garmin, TomTom or car GPS">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              <span>GPX</span>
            </a>
          </div>
        </div>
      `;
    });

    html += `
      <div class="center-card" id="center-${escapeHtml(c.center_id)}">
        <div class="center-card-header">
          <div class="center-title-row">
            <h3 class="center-title">${escapeHtml(c.name)}</h3>
            <div class="center-badges-row">
              ${c.region ? `<span class="badge-region">${escapeHtml(c.region)}</span>` : ''}
              <span class="badge-area">${escapeHtml(c.area)}</span>
              <span class="badge-passrate">Pass Rate ~${escapeHtml(c.pass_rate || '60%')}</span>
              <span class="badge-agency">${escapeHtml(c.agency || 'VTNZ')}</span>
            </div>
          </div>
          <div class="center-address-row">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            <span>${escapeHtml(c.address)}</span>
          </div>
          ${featuresHtml ? `<div class="center-features-row">${featuresHtml}</div>` : ''}
          ${c.center_tips && c.center_tips.length ? `
            <div class="center-officer-tip">
              <b>Testing Area Note:</b> ${escapeHtml(Array.isArray(c.center_tips) ? c.center_tips.join(' ') : c.center_tips)}
            </div>
          ` : ''}
        </div>
        <div class="center-routes-grid">
          ${routesHtml}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function resetRoutesFilters() {
  routesFilter = { region: 'all', area: 'all', test_type: 'all', search: '' };
  const searchInput = document.getElementById('routes-search-input');
  if (searchInput) searchInput.value = '';
  const searchClear = document.getElementById('routes-search-clear');
  if (searchClear) searchClear.style.display = 'none';

  const regSelect = document.getElementById('routes-region-select');
  if (regSelect) regSelect.value = 'all';

  document.querySelectorAll('.type-filter-btn').forEach(b => {
    if (b.getAttribute('data-type') === 'all') b.classList.add('active');
    else b.classList.remove('active');
  });

  document.querySelectorAll('.region-pill-btn').forEach(b => {
    if (b.getAttribute('data-region') === 'all') b.classList.add('active');
    else b.classList.remove('active');
  });

  document.querySelectorAll('.area-pill-btn').forEach(b => {
    if (b.getAttribute('data-area') === 'all') b.classList.add('active');
    else b.classList.remove('active');
  });

  applyRoutesFilter();
}

async function openRouteModal(routeId) {
  let targetCenter = null;
  let targetRoute = null;

  if (allRoutesData && allRoutesData.centers) {
    for (const c of allRoutesData.centers) {
      for (const r of (c.routes || [])) {
        if (r.id === routeId) {
          targetCenter = c;
          targetRoute = r;
          break;
        }
      }
      if (targetRoute) break;
    }
  }

  if (!targetRoute) {
    try {
      const res = await fetch(`/api/routes/route/${routeId}`);
      if (!res.ok) throw new Error('Route not found');
      const data = await res.json();
      targetCenter = data.center;
      targetRoute = data.route;
    } catch (e) {
      alert('Could not load route details: ' + e.message);
      return;
    }
  }

  // Populate Modal Fields
  const modal = document.getElementById('routeModal');
  const codeEl = document.getElementById('routeModalCode');
  const typeEl = document.getElementById('routeModalType');
  const areaEl = document.getElementById('routeModalArea');
  const titleEl = document.getElementById('routeModalTitle');
  const addrTextEl = document.getElementById('routeModalAddressText');
  const distEl = document.getElementById('routeModalDistance');
  const durEl = document.getElementById('routeModalDuration');
  const stepsCountEl = document.getElementById('routeModalStepsCount');
  const diffEl = document.getElementById('routeModalDifficulty');
  const passEl = document.getElementById('routeModalPassRate');
  const gmapsBtn = document.getElementById('routeModalGmapsBtn');
  const footerGmapsBtn = document.getElementById('routeModalFooterGmapsBtn');
  const appleBtn = document.getElementById('routeModalAppleBtn');
  const overviewEl = document.getElementById('routeModalOverview');
  const speedZonesEl = document.getElementById('routeModalSpeedZones');
  const keyManeuversEl = document.getElementById('routeModalKeyManeuvers');
  const examinerTipsEl = document.getElementById('routeModalExaminerTips');
  const stepsSummaryEl = document.getElementById('routeModalStepsSummary');
  const stepsListEl = document.getElementById('routeModalStepsList');

  if (codeEl) codeEl.innerText = targetRoute.route_code || 'Practical Route';
  if (typeEl) {
    typeEl.innerText = targetRoute.test_type || 'Restricted Licence (Class 1R)';
    typeEl.className = `route-badge-type ${targetRoute.badge_type === 'full' ? 'full' : 'restricted'}`;
  }
  if (areaEl) areaEl.innerText = (targetCenter && targetCenter.region ? `${targetCenter.region} · ` : '') + ((targetCenter && targetCenter.area) || 'New Zealand');
  if (titleEl) titleEl.innerText = targetRoute.name || 'Practical Driving Route';
  if (addrTextEl) addrTextEl.innerText = (targetCenter && targetCenter.address) || '';

  if (distEl) distEl.innerText = targetRoute.distance || '--';
  if (durEl) durEl.innerText = targetRoute.duration || '--';
  if (stepsCountEl) stepsCountEl.innerText = `${(targetRoute.steps || []).length} maneuvers`;
  if (diffEl) diffEl.innerText = targetRoute.difficulty || 'Moderate';
  if (passEl) passEl.innerText = (targetCenter && targetCenter.pass_rate) || '60%';

  if (gmapsBtn) gmapsBtn.href = targetRoute.google_maps_url || '#';
  if (footerGmapsBtn) footerGmapsBtn.href = targetRoute.google_maps_url || '#';
  if (appleBtn && targetRoute.apple_maps_url) {
    appleBtn.href = targetRoute.apple_maps_url;
    appleBtn.style.display = 'inline-flex';
  } else if (appleBtn) {
    appleBtn.style.display = 'none';
  }

  // Wire GPX download and In-App GPS navigation buttons
  currentModalRouteId = routeId;
  const startGpsBtn = document.getElementById('routeModalStartGpsBtn');
  if (startGpsBtn) {
    startGpsBtn.onclick = () => {
      closeRouteModal();
      launchDriverNav(routeId);
    };
  }
  const gpxBtn = document.getElementById('routeModalGpxBtn');
  const footerGpxBtn = document.getElementById('routeModalFooterGpxBtn');
  if (gpxBtn) gpxBtn.href = `/api/routes/route/${routeId}/gpx`;
  if (footerGpxBtn) footerGpxBtn.href = `/api/routes/route/${routeId}/gpx`;

  if (overviewEl) overviewEl.innerText = targetRoute.overview || '';

  // Speed zones
  if (speedZonesEl) {
    const zones = targetRoute.speed_zones || ['50 km/h Suburban'];
    speedZonesEl.innerHTML = zones.map(z => `<span class="speed-pill">${escapeHtml(z)}</span>`).join('');
  }

  // Key maneuvers
  if (keyManeuversEl) {
    const maneuvers = targetRoute.key_maneuvers || [];
    keyManeuversEl.innerHTML = maneuvers.map(m => `<li>${escapeHtml(m)}</li>`).join('');
  }

  // Examiner tips
  if (examinerTipsEl) {
    const tips = targetRoute.examiner_tips || [];
    examinerTipsEl.innerHTML = tips.map(t => `<li>${escapeHtml(t)}</li>`).join('');
  }

  // Steps list
  if (stepsSummaryEl) {
    stepsSummaryEl.innerText = `${(targetRoute.steps || []).length} Turn-by-Turn Steps`;
  }

  if (stepsListEl) {
    const steps = targetRoute.steps || [];
    let stepsHtml = '';
    steps.forEach(s => {
      stepsHtml += `
        <div class="route-step-row">
          <div class="step-num-badge">${s.step_number}</div>
          <div class="step-main">
            <div class="step-instruction">${escapeHtml(s.instruction)}</div>
            ${s.examiner_focus ? `<div class="step-tip">${escapeHtml(s.examiner_focus)}</div>` : ''}
          </div>
          <div class="step-meta">
            ${s.road_type ? `<span class="step-road-type">${escapeHtml(s.road_type)}</span>` : ''}
            <span class="step-distance">${escapeHtml(s.distance || '')}</span>
          </div>
        </div>
      `;
    });
    stepsListEl.innerHTML = stepsHtml;
  }

  if (modal && typeof modal.showModal === 'function') {
    modal.showModal();
  }
}

function closeRouteModal() {
  const modal = document.getElementById('routeModal');
  if (modal && modal.open) {
    modal.close();
  }
}

// Expose routes functions globally
window.openRouteModal = openRouteModal;
window.closeRouteModal = closeRouteModal;
window.resetRoutesFilters = resetRoutesFilters;
window.loadRoutesView = loadRoutesView;



// ============================================================================
// IN-APP TURN-BY-TURN GPS DRIVER NAVIGATION SYSTEM
// ============================================================================
let currentModalRouteId = null;

function launchDriverNavFromModal(autoDemo = false) {
  if (currentModalRouteId) {
    closeRouteModal();
    launchDriverNav(currentModalRouteId, autoDemo);
  }
}
window.launchDriverNavFromModal = launchDriverNavFromModal;

const driverNavState = {
  activeRoute: null,
  activeCenter: null,
  map: null,
  polylineLayer: null,
  vehicleMarker: null,
  startMarker: null,
  watchId: null,
  wakeLock: null,
  voiceEnabled: true,
  currentStepIndex: 0,
  speedLimit: 50,
  userLocation: null,
  lastSpokenText: '',
  isOffRoute: false,
  isDemoPlaying: false,
  demoTimer: null,
  demoIndex: 0,
  startTime: null,
  hasStartedRoute: false,
  offRouteCount: 0,
  onRouteCount: 0
};

// Web Audio API Chime for turn alert
function playNavChime() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(540, now);
    osc.frequency.setValueAtTime(720, now + 0.1);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.start(now);
    osc.stop(now + 0.35);
  } catch (e) {}
}

// ============================================================================
// VOICE SYNTHESIS ENGINE (CLEAN ENGLISH SAT-NAV AUDIO)
// ============================================================================
let availableEnglishVoices = [];
let activeNavVoice = null;

function findBestEnglishVoice() {
  const allVoices = ('speechSynthesis' in window) ? window.speechSynthesis.getVoices() || [] : [];
  if (!allVoices.length) return null;

  availableEnglishVoices = allVoices.filter(v => v.lang && v.lang.toLowerCase().startsWith('en'));
  if (!availableEnglishVoices.length) {
    availableEnglishVoices = allVoices;
  }

  // Check saved voice from localStorage
  const savedName = localStorage.getItem('nz_driver_voice');
  if (savedName) {
    const matched = availableEnglishVoices.find(v => v.name === savedName);
    if (matched) return matched;
  }

  // Priority ranking: en-NZ > en-AU > en-GB > en-US > any English
  const nz = availableEnglishVoices.find(v => /en[-_]NZ/i.test(v.lang));
  if (nz) return nz;

  const au = availableEnglishVoices.find(v => /en[-_]AU/i.test(v.lang));
  if (au) return au;

  const gb = availableEnglishVoices.find(v => /en[-_]GB/i.test(v.lang));
  if (gb) return gb;

  const us = availableEnglishVoices.find(v => /en[-_]US/i.test(v.lang));
  if (us) return us;

  return availableEnglishVoices[0] || allVoices[0];
}

function initVoiceEngine() {
  if (!('speechSynthesis' in window)) return;

  function loadAndSelect() {
    activeNavVoice = findBestEnglishVoice();
    populateVoicePicker();
  }

  loadAndSelect();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadAndSelect;
  }
}
window.initVoiceEngine = initVoiceEngine;

function populateVoicePicker() {
  const select = document.getElementById('driverVoiceSelect');
  if (!select) return;

  const allVoices = ('speechSynthesis' in window) ? window.speechSynthesis.getVoices() || [] : [];
  const enVoices = allVoices.filter(v => v.lang && v.lang.toLowerCase().startsWith('en'));
  const list = enVoices.length ? enVoices : allVoices;

  select.innerHTML = '';
  if (!list.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'English (Default)';
    select.appendChild(opt);
    return;
  }

  list.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.name;
    const langTag = v.lang ? `[${v.lang}] ` : '';
    opt.textContent = `${langTag}${v.name}`;
    if (activeNavVoice && activeNavVoice.name === v.name) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}
window.populateVoicePicker = populateVoicePicker;

function changeDriverNavVoice(voiceName) {
  const allVoices = ('speechSynthesis' in window) ? window.speechSynthesis.getVoices() || [] : [];
  const found = allVoices.find(v => v.name === voiceName);
  if (found) {
    activeNavVoice = found;
    localStorage.setItem('nz_driver_voice', found.name);
    speakNavInstruction(`Voice set to ${found.name}`, true);
  }
}
window.changeDriverNavVoice = changeDriverNavVoice;

// Clean street names & abbreviations for natural English GPS speech
function cleanTextForSpeech(text) {
  if (!text) return '';
  let s = String(text);

  // Expand VTNZ acronym
  s = s.replace(/\bVTNZ\b/g, 'V T N Z');

  // Format parenthetical signs
  s = s.replace(/\((?:signs\s+for\s+)?([^)]+)\)/gi, ', signs for $1');

  // Highway and Route numbers
  s = s.replace(/\s*\/\s*State\s*Hwy\s*(\d+)/gi, ', State Highway $1');
  s = s.replace(/\s*\/\s*SH\s*(\d+)/gi, ', State Highway $1');
  s = s.replace(/\s*\/\s*Rte\s*(\d+)/gi, ', Route $1');
  s = s.replace(/\bSH(\d+)\b/gi, 'State Highway $1');
  s = s.replace(/\s*\/\s*/g, ' or ');

  // Place name prefixes
  s = s.replace(/\bMt\.?\s*([A-Z])/g, 'Mount $1');
  s = s.replace(/\bPt\.?\s*([A-Z])/g, 'Point $1');
  s = s.replace(/\bSt\.?\s*([A-Z])/g, 'Saint $1');

  // Street suffixes
  s = s.replace(/\bAve\b\.?/gi, 'Avenue');
  s = s.replace(/\bRd\b\.?/gi, 'Road');
  s = s.replace(/\bDr\b\.?/gi, 'Drive');
  s = s.replace(/\bCres\b\.?/gi, 'Crescent');
  s = s.replace(/\bPl\b\.?/gi, 'Place');
  s = s.replace(/\bPde\b\.?/gi, 'Parade');
  s = s.replace(/\bHwy\b\.?/gi, 'Highway');
  s = s.replace(/\bMtwy\b\.?/gi, 'Motorway');
  s = s.replace(/\bCt\b\.?/gi, 'Court');
  s = s.replace(/\bBlvd\b\.?/gi, 'Boulevard');
  s = s.replace(/\bLn\b\.?/gi, 'Lane');
  s = s.replace(/\bTerr?\b\.?/gi, 'Terrace');
  s = s.replace(/\bSt\b\.?/gi, 'Street');

  // Ordinal numbers (roundabout exits)
  s = s.replace(/\b1st\b/gi, 'first');
  s = s.replace(/\b2nd\b/gi, 'second');
  s = s.replace(/\b3rd\b/gi, 'third');
  s = s.replace(/\b4th\b/gi, 'fourth');
  s = s.replace(/\b5th\b/gi, 'fifth');

  // Speed symbols
  s = s.replace(/(\d+)\s*km\/h/gi, '$1 kilometers per hour');

  // Clean symbols and extra punctuation
  s = s.replace(/[•&]/g, ' and ');
  s = s.replace(/[()\[\]"]/g, '');
  s = s.replace(/\s*,\s*,+/g, ',').replace(/\s*,\s*/g, ', ');
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s;
}

// Spoken Voice Guidance via HTML5 Speech Synthesis
function speakNavInstruction(text, force = false) {
  if (!driverNavState.voiceEnabled) return;
  if (!('speechSynthesis' in window)) return;
  if (!text) return;

  const spokenText = cleanTextForSpeech(text);
  if (!spokenText) return;
  if (driverNavState.lastSpokenText === spokenText && !force) return;

  driverNavState.lastSpokenText = spokenText;
  playNavChime();

  setTimeout(() => {
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(spokenText);
      utter.rate = 1.0;
      utter.pitch = 1.0;

      // Lock strictly to an English language tag to prevent foreign TTS mixing
      const voice = activeNavVoice || findBestEnglishVoice();
      if (voice) {
        utter.voice = voice;
        utter.lang = voice.lang || 'en-NZ';
      } else {
        utter.lang = 'en-NZ';
      }

      window.speechSynthesis.speak(utter);
    } catch (e) {
      console.warn('Speech error:', e);
    }
  }, 100);
}

// Distance between coordinates in meters (Haversine formula)
function calcDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Shortest perpendicular distance from a point to a polyline
function calcMinDistToPolyline(point, polyline) {
  if (!polyline || polyline.length === 0) return 0;
  let minD = Infinity;
  for (let i = 0; i < polyline.length; i++) {
    const d = calcDistanceMeters(point[0], point[1], polyline[i][0], polyline[i][1]);
    if (d < minD) minD = d;
  }
  return minD;
}

// Maneuver SVG Icons based on turn instruction
function getManeuverSvg(instruction) {
  const text = (instruction || '').toLowerCase();
  if (text.includes('left') && text.includes('slight')) {
    return `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M14 4l-4 4 4 4"/><path d="M10 8h5a5 5 0 0 1 5 5v7"/></svg>`;
  } else if (text.includes('right') && text.includes('slight')) {
    return `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M10 4l4 4-4 4"/><path d="M14 8h-5a5 5 0 0 0-5 5v7"/></svg>`;
  } else if (text.includes('left') || text.includes('sharp left')) {
    return `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8"><polyline points="9 10 4 15 9 20"></polyline><path d="M20 4v7a4 4 0 0 1-4 4H4"></path></svg>`;
  } else if (text.includes('right') || text.includes('sharp right')) {
    return `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8"><polyline points="15 10 20 15 15 20"></polyline><path d="M4 4v7a4 4 0 0 0 4 4h12"></path></svg>`;
  } else if (text.includes('roundabout')) {
    return `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><circle cx="12" cy="12" r="5"></circle><polyline points="12 2 15 5 12 8"></polyline><path d="M12 2a10 10 0 1 1-7.07 17.07"></path></svg>`;
  } else if (text.includes('u-turn')) {
    return `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M9 10L4 15l5 5"></path><path d="M20 4v7a6 6 0 0 1-12 0V4"></path></svg>`;
  } else if (text.includes('finish') || text.includes('arrive') || text.includes('destination')) {
    return `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>`;
  } else {
    return `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
  }
}

// Launch Navigation Mode
async function launchDriverNav(routeId, autoDemo = false) {
  let targetCenter = null;
  let targetRoute = null;

  if (allRoutesData && allRoutesData.centers) {
    for (const c of allRoutesData.centers) {
      for (const r of (c.routes || [])) {
        if (r.id === routeId) {
          targetCenter = c;
          targetRoute = r;
          break;
        }
      }
      if (targetRoute) break;
    }
  }

  if (!targetRoute) {
    try {
      const res = await fetch(`/api/routes/route/${routeId}`);
      if (!res.ok) throw new Error('Route not found');
      const data = await res.json();
      targetCenter = data.center;
      targetRoute = data.route;
    } catch (e) {
      alert('Could not load route for driving: ' + e.message);
      return;
    }
  }

  driverNavState.activeRoute = targetRoute;
  driverNavState.activeCenter = targetCenter;
  driverNavState.currentStepIndex = 0;
  driverNavState.lastSpokenText = '';
  driverNavState.isOffRoute = false;
  driverNavState.isDemoPlaying = false;
  driverNavState.demoIndex = 0;
  driverNavState.startTime = Date.now();
  driverNavState.hasStartedRoute = false;
  driverNavState.offRouteCount = 0;
  driverNavState.onRouteCount = 0;

  const offRouteEl = document.getElementById('driverOffRouteBanner');
  if (offRouteEl) offRouteEl.style.display = 'none';

  // Screen WakeLock to keep screen on while driving
  if ('wakeLock' in navigator) {
    try {
      driverNavState.wakeLock = await navigator.wakeLock.request('screen');
    } catch (err) {}
  }

  // Display overlay
  const overlay = document.getElementById('driverNavOverlay');
  if (overlay) overlay.style.display = 'flex';

  // Initialize or update voice picker
  populateVoicePicker();

  // Initialize Leaflet Map
  initDriverNavMap(targetRoute, targetCenter);

  // Update HUD
  updateDriverHudStep(0, 0);

  // If autoDemo requested, start simulation directly without touching device GPS hardware
  if (autoDemo) {
    startDriverDemoSimulation();
  } else {
    // Start GPS Geolocation for live on-road driving
    startDriverGeolocation();
    speakNavInstruction(`Starting driving test route for ${targetRoute.name}. Follow the highlighted route.`);
  }
}
window.launchDriverNav = launchDriverNav;

// Initialize or update Leaflet Map
function initDriverNavMap(route, center) {
  const mapContainer = document.getElementById('driverNavMap');
  if (!mapContainer) return;

  if (driverNavState.map) {
    driverNavState.map.remove();
    driverNavState.map = null;
  }

  const polyline = route.polyline_coords || [];
  let centerLat = center && center.coords ? center.coords.lat : -36.8485;
  let centerLng = center && center.coords ? center.coords.lng : 174.7633;

  if (polyline.length > 0) {
    centerLat = polyline[0][0];
    centerLng = polyline[0][1];
  }

  driverNavState.map = L.map('driverNavMap', {
    zoomControl: false,
    attributionControl: false
  }).setView([centerLat, centerLng], 17);

  // Clean OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(driverNavState.map);

  // Polyline shadow and glowing path
  if (polyline.length > 1) {
    // Outer casing (casing layer for high visibility)
    L.polyline(polyline, {
      color: '#0369a1',
      weight: 9,
      opacity: 0.65,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(driverNavState.map);

    // Inner bright navigation polyline
    driverNavState.polylineLayer = L.polyline(polyline, {
      color: '#0284c7',
      weight: 6,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(driverNavState.map);

    driverNavState.map.fitBounds(driverNavState.polylineLayer.getBounds(), {
      padding: [80, 80]
    });
  }

  // Start & Finish Markers
  const startIcon = L.divIcon({
    className: 'custom-pin-start',
    html: `<div style="background:#16a34a;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:10px;border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,0.4);">START</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
  if (polyline.length > 0) {
    driverNavState.startMarker = L.marker(polyline[0], { icon: startIcon }).addTo(driverNavState.map);
  }

  // Vehicle puck marker
  const puckIcon = L.divIcon({
    className: 'vehicle-marker-puck',
    html: `
      <div class="vehicle-puck-pulse"></div>
      <div class="vehicle-puck-body" id="vehiclePuckRotator">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 19 21 12 17 5 21 12 2"></polygon></svg>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  const initialLoc = polyline.length > 0 ? polyline[0] : [centerLat, centerLng];
  driverNavState.vehicleMarker = L.marker(initialLoc, { icon: puckIcon, zIndexOffset: 1000 }).addTo(driverNavState.map);
  driverNavState.userLocation = { lat: initialLoc[0], lng: initialLoc[1], speed: 0, heading: 0 };
}

// Start Geolocation Watcher
function startDriverGeolocation() {
  if (!('geolocation' in navigator)) {
    updateDriverGpsStatus('GPS Unavailable', false);
    return;
  }

  updateDriverGpsStatus('Acquiring GPS...', true);

  if (driverNavState.watchId !== null) {
    navigator.geolocation.clearWatch(driverNavState.watchId);
    driverNavState.watchId = null;
  }

  driverNavState.watchId = navigator.geolocation.watchPosition(
    (pos) => {
      // If demo simulation is actively playing, ignore real hardware GPS updates
      if (driverNavState.isDemoPlaying) {
        return;
      }

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const rawSpeed = pos.coords.speed;
      const speedKmh = rawSpeed !== null && rawSpeed > 0 ? Math.round(rawSpeed * 3.6) : 0;
      const heading = pos.coords.heading || 0;

      updateDriverGpsStatus('GPS Locked', true);
      processVehiclePosition(lat, lng, speedKmh, heading);
    },
    (err) => {
      console.warn('Geolocation warning:', err.message);
      if (!driverNavState.isDemoPlaying) {
        updateDriverGpsStatus('Weak GPS', false);
      }
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000
    }
  );
}

function updateDriverGpsStatus(text, isGood) {
  const el = document.getElementById('driverGpsStatus');
  if (el) {
    el.innerText = text;
    el.className = `dash-stat-val ${isGood ? 'status-active' : ''}`;
  }
}

// Process new vehicle location & update HUD
function processVehiclePosition(lat, lng, speedKmh, heading) {
  driverNavState.userLocation = { lat, lng, speed: speedKmh, heading };

  // Update vehicle marker on map
  if (driverNavState.vehicleMarker) {
    driverNavState.vehicleMarker.setLatLng([lat, lng]);
  }

  // Rotate vehicle arrowhead
  const rotator = document.getElementById('vehiclePuckRotator');
  if (rotator && heading !== null && heading !== undefined) {
    rotator.style.transform = `rotate(${heading}deg)`;
  }

  // Update Speedometer HUD
  const speedEl = document.getElementById('driverLiveSpeed');
  if (speedEl) speedEl.innerText = speedKmh;

  const speedBox = document.getElementById('driverSpeedBox');
  if (speedBox) {
    if (speedKmh > driverNavState.speedLimit) {
      speedBox.classList.add('speed-warning');
    } else {
      speedBox.classList.remove('speed-warning');
    }
  }

  // Follow vehicle smoothly
  if (driverNavState.map && !driverNavState.isDemoPlaying) {
    driverNavState.map.panTo([lat, lng], { animate: true, duration: 0.5 });
  }

  // Check off-route status (ONLY for live driving GPS, NEVER during demo simulation!)
  if (!driverNavState.isDemoPlaying) {
    const polyline = (driverNavState.activeRoute && driverNavState.activeRoute.polyline_coords) || [];
    if (polyline.length > 0) {
      const startCoord = polyline[0];
      const distToStart = calcDistanceMeters(lat, lng, startCoord[0], startCoord[1]);

      // Before driver arrives at starting point (e.g. at home or heading to test centre)
      if (!driverNavState.hasStartedRoute) {
        if (distToStart <= 120) {
          driverNavState.hasStartedRoute = true;
          speakNavInstruction('Arrived at test starting point. Follow the highlighted route.');
        } else {
          // Guide toward test centre without false off-route alarms
          const offRouteEl = document.getElementById('driverOffRouteBanner');
          if (offRouteEl) offRouteEl.style.display = 'none';
          const countEl = document.getElementById('driverCountdown');
          if (countEl) countEl.innerText = `${Math.round(distToStart / 100) / 10} km`;
          const instEl = document.getElementById('driverInstruction');
          if (instEl) instEl.innerText = `Proceed to starting point: ${driverNavState.activeCenter?.name || 'Testing Centre'}`;
          return;
        }
      }

      // Live GPS Debounced Off-Route check
      const minDist = calcMinDistToPolyline([lat, lng], polyline);
      const offRouteEl = document.getElementById('driverOffRouteBanner');

      if (minDist > 65) {
        driverNavState.offRouteCount = (driverNavState.offRouteCount || 0) + 1;
        driverNavState.onRouteCount = 0;
        // Require 3 consecutive readings (>3s) outside 65m to avoid GPS jitter
        if (driverNavState.offRouteCount >= 3) {
          if (!driverNavState.isOffRoute) {
            driverNavState.isOffRoute = true;
            if (offRouteEl) offRouteEl.style.display = 'flex';
            speakNavInstruction('You are off the test route. Please return to the official route.');
          }
        }
      } else if (minDist < 40) {
        driverNavState.onRouteCount = (driverNavState.onRouteCount || 0) + 1;
        driverNavState.offRouteCount = 0;
        // Require 2 consecutive readings inside 40m before confirming rejoin
        if (driverNavState.onRouteCount >= 2) {
          if (driverNavState.isOffRoute) {
            driverNavState.isOffRoute = false;
            if (offRouteEl) offRouteEl.style.display = 'none';
            speakNavInstruction('Rejoined test route. Continuing navigation.');
          }
        }
      }
    }
  } else {
    // In demo mode: strictly keep off-route state and banner disabled
    driverNavState.isOffRoute = false;
    const offRouteEl = document.getElementById('driverOffRouteBanner');
    if (offRouteEl) offRouteEl.style.display = 'none';
  }

  // Advance steps based on proximity (live GPS only, demo mode handles its own countdown)
  if (!driverNavState.isDemoPlaying) {
    const steps = (driverNavState.activeRoute && driverNavState.activeRoute.steps) || [];
    const currIdx = driverNavState.currentStepIndex;
    if (currIdx < steps.length) {
      updateDriverHudStep(currIdx, 150);
    }
  }
}

// Update Driver HUD
function updateDriverHudStep(stepIndex, countdownMeters) {
  const route = driverNavState.activeRoute;
  if (!route) return;
  const steps = route.steps || [];
  const step = steps[stepIndex] || {
    instruction: 'Follow route circuit',
    road_type: 'Suburban Street',
    examiner_focus: 'Maintain safe following distance, scan mirrors regularly.'
  };

  // Maneuver Icon
  const iconWrap = document.getElementById('driverManeuverIcon');
  if (iconWrap) iconWrap.innerHTML = getManeuverSvg(step.instruction);

  // Countdown text
  const countEl = document.getElementById('driverCountdown');
  if (countEl) {
    if (countdownMeters <= 30) countEl.innerText = 'Now';
    else countEl.innerText = `In ${Math.round(countdownMeters)} m`;
  }

  // Instruction text
  const instEl = document.getElementById('driverInstruction');
  if (instEl) instEl.innerText = step.instruction;

  // Step Meta
  const metaEl = document.getElementById('driverStepMeta');
  if (metaEl) {
    const roadType = step.road_type || 'Suburban Street';
    let limit = 50;
    if (roadType.includes('Arterial') || roadType.includes('60')) limit = 60;
    if (roadType.includes('Expressway') || roadType.includes('Motorway') || roadType.includes('80')) limit = 80;
    if (roadType.includes('100')) limit = 100;
    driverNavState.speedLimit = limit;

    const limitBadge = document.getElementById('driverSpeedLimitBadge');
    if (limitBadge) limitBadge.innerText = limit;

    metaEl.innerHTML = `Step ${stepIndex + 1} of ${steps.length} &bull; ${limit} km/h ${escapeHtml(roadType)}`;
  }

  // Examiner focus tip
  const tipEl = document.getElementById('driverExaminerTipText');
  if (tipEl) {
    tipEl.innerText = step.examiner_focus || 'Scan mirrors every 10-15 seconds, check blind spots before changing lanes.';
  }

  // Progress Bar
  const fillEl = document.getElementById('driverProgressFill');
  if (fillEl && steps.length > 0) {
    const pct = Math.round(((stepIndex + 1) / steps.length) * 100);
    fillEl.style.width = `${pct}%`;
  }

  // Remaining Distance
  const remDistEl = document.getElementById('driverRemainingDist');
  if (remDistEl) remDistEl.innerText = route.distance || '-- km';

  const remTimeEl = document.getElementById('driverRemainingTime');
  if (remTimeEl) remTimeEl.innerText = route.duration || '-- min';
}

// Toggle Voice Guidance
function toggleDriverVoice() {
  driverNavState.voiceEnabled = !driverNavState.voiceEnabled;
  const btn = document.getElementById('driverVoiceBtn');
  if (btn) {
    if (driverNavState.voiceEnabled) {
      btn.classList.add('active');
      btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
      speakNavInstruction('Voice guidance unmuted.');
    } else {
      btn.classList.remove('active');
      btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
  }
}
window.toggleDriverVoice = toggleDriverVoice;

// Re-center Map on Vehicle
function recenterDriverMap() {
  if (driverNavState.map && driverNavState.userLocation) {
    driverNavState.map.setView([driverNavState.userLocation.lat, driverNavState.userLocation.lng], 17, {
      animate: true,
      duration: 0.5
    });
  }
}
window.recenterDriverMap = recenterDriverMap;

// Toggle Demo Simulation Playback
function toggleDriverDemoSimulation() {
  if (driverNavState.isDemoPlaying) {
    stopDriverDemoSimulation();
  } else {
    startDriverDemoSimulation();
  }
}
window.toggleDriverDemoSimulation = toggleDriverDemoSimulation;

function startDriverDemoSimulation() {
  const polyline = (driverNavState.activeRoute && driverNavState.activeRoute.polyline_coords) || [];
  if (polyline.length < 2) {
    alert('Polyline not loaded for simulation.');
    return;
  }

  // Clear any existing simulation timer
  if (driverNavState.demoTimer) clearInterval(driverNavState.demoTimer);

  driverNavState.isDemoPlaying = true;
  driverNavState.isOffRoute = false;
  driverNavState.offRouteCount = 0;
  driverNavState.onRouteCount = 0;

  const offRouteEl = document.getElementById('driverOffRouteBanner');
  if (offRouteEl) offRouteEl.style.display = 'none';

  const btn = document.getElementById('driverDemoBtn');
  if (btn) {
    btn.classList.add('playing');
    const text = document.getElementById('driverDemoBtnText');
    if (text) text.innerText = 'Pause Demo';
  }
  updateDriverGpsStatus('Demo Simulating', true);

  const steps = (driverNavState.activeRoute && driverNavState.activeRoute.steps) || [];
  const stepInterval = Math.max(1, Math.floor(polyline.length / Math.max(1, steps.length)));

  if (driverNavState.demoIndex >= polyline.length - 1) {
    driverNavState.demoIndex = 0;
    driverNavState.currentStepIndex = 0;
  }

  if (driverNavState.demoIndex === 0 && steps.length > 0) {
    const firstStep = steps[0];
    updateDriverHudStep(0, 50);
    speakNavInstruction(`Starting demo simulation for ${driverNavState.activeRoute.name}. ${firstStep.instruction}.`);
  }

  driverNavState.demoTimer = setInterval(() => {
    if (driverNavState.demoIndex >= polyline.length - 1) {
      // Completed route circuit
      stopDriverDemoSimulation();
      speakNavInstruction('You have arrived back at the testing centre. Practical driving test circuit completed!');
      return;
    }

    const p1 = polyline[driverNavState.demoIndex];
    driverNavState.demoIndex = Math.min(driverNavState.demoIndex + 2, polyline.length - 1);
    const p2 = polyline[driverNavState.demoIndex];

    // Calculate bearing between p1 and p2
    const dLon = (p2[1] - p1[1]) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(p2[0] * Math.PI / 180);
    const x = Math.cos(p1[0] * Math.PI / 180) * Math.sin(p2[0] * Math.PI / 180) -
              Math.sin(p1[0] * Math.PI / 180) * Math.cos(p2[0] * Math.PI / 180) * Math.cos(dLon);
    const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;

    // Realistic simulated speed ~ 48-52 km/h
    const simSpeed = Math.floor(45 + Math.random() * 8);

    processVehiclePosition(p2[0], p2[1], simSpeed, bearing);

    if (driverNavState.map) {
      driverNavState.map.panTo([p2[0], p2[1]], { animate: true, duration: 0.2 });
    }

    // Dynamic countdown and step advancement
    const stepIdx = Math.min(steps.length - 1, Math.floor(driverNavState.demoIndex / stepInterval));
    const nextTargetPoint = (stepIdx + 1) * stepInterval;
    const pointsRemaining = Math.max(0, nextTargetPoint - driverNavState.demoIndex);
    const countdownMeters = Math.max(15, Math.round(pointsRemaining * 12));

    updateDriverHudStep(stepIdx, countdownMeters);

    if (stepIdx !== driverNavState.currentStepIndex) {
      driverNavState.currentStepIndex = stepIdx;
      const currentStep = steps[stepIdx];
      speakNavInstruction(currentStep.instruction);
    }
  }, 250);
}
window.startDriverDemoSimulation = startDriverDemoSimulation;

function stopDriverDemoSimulation() {
  driverNavState.isDemoPlaying = false;
  if (driverNavState.demoTimer) clearInterval(driverNavState.demoTimer);
  driverNavState.demoTimer = null;

  const btn = document.getElementById('driverDemoBtn');
  if (btn) {
    btn.classList.remove('playing');
    const text = document.getElementById('driverDemoBtnText');
    if (text) text.innerText = 'Demo Play';
  }
  updateDriverGpsStatus('GPS Ready', true);
}
window.stopDriverDemoSimulation = stopDriverDemoSimulation;

// Exit Driver Navigation
function exitDriverNavigation() {
  if (driverNavState.isDemoPlaying) {
    stopDriverDemoSimulation();
  }

  if (driverNavState.watchId !== null) {
    navigator.geolocation.clearWatch(driverNavState.watchId);
    driverNavState.watchId = null;
  }

  if (driverNavState.wakeLock) {
    driverNavState.wakeLock.release().catch(() => {});
    driverNavState.wakeLock = null;
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  const overlay = document.getElementById('driverNavOverlay');
  if (overlay) overlay.style.display = 'none';

  if (driverNavState.map) {
    driverNavState.map.remove();
    driverNavState.map = null;
  }

  driverNavState.activeRoute = null;
  driverNavState.activeCenter = null;
  driverNavState.isOffRoute = false;
  driverNavState.lastSpokenText = '';
  driverNavState.hasStartedRoute = false;
  driverNavState.offRouteCount = 0;
  driverNavState.onRouteCount = 0;
  driverNavState.demoIndex = 0;
}
window.exitDriverNavigation = exitDriverNavigation;
