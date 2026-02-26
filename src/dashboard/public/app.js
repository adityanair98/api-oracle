// API Oracle Dashboard — app.js
// Vanilla JS, no framework, no CDN dependencies.

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  entries: [],
  categories: [],
  stats: null,
  filtered: [],
  activeCategory: 'all',
  activeView: 'dashboard',
  searchQuery: '',
  sortValue: 'qualityScore-desc',
  loading: false,
  viewsLoaded: new Set(),
};

// ─── Category Color Helper ─────────────────────────────────────────────────────

function getCategoryColor(category) {
  const colors = {
    email: '#3B82F6', messaging: '#3B82F6', communication: '#3B82F6', notifications: '#3B82F6',
    payments: '#059669', commerce: '#059669',
    ai: '#7C3AED', media: '#7C3AED',
    database: '#EA580C', storage: '#EA580C', infrastructure: '#EA580C',
    auth: '#DC2626', security: '#DC2626',
    devops: '#475569', testing: '#475569', workflow: '#475569', integration: '#475569',
    maps: '#0891B2', search: '#0891B2', analytics: '#0891B2',
    cms: '#DB2777', forms: '#DB2777', scheduling: '#DB2777',
  };
  return colors[category] || '#6B7280';
}

// ─── Staleness Helpers ─────────────────────────────────────────────────────────

function getStalenessColor(level) {
  const map = { fresh: '#22C55E', aging: '#EAB308', stale: '#F97316', critical: '#DC2626' };
  return map[level] || '#6B7280';
}

function getStalenessLabel(level) {
  const map = { fresh: 'Fresh', aging: 'Aging', stale: 'Stale', critical: 'Critical' };
  return map[level] || level;
}

function getStalenessEmoji(level) {
  const map = { fresh: '✅', aging: '🟡', stale: '🟠', critical: '🔴' };
  return map[level] || '⚪';
}

function getStalenessBadge(level) {
  const cls = { fresh: 'badge-green', aging: 'badge-yellow', stale: 'badge-orange', critical: 'badge-red' };
  return cls[level] || 'badge-gray';
}

// ─── Score Helpers ─────────────────────────────────────────────────────────────

function renderScoreDots(score) {
  const filled = Math.round(score);
  const cls = score >= 8 ? 'score-high' : score >= 6 ? 'score-mid' : 'score-low';
  let dots = '';
  for (let i = 1; i <= 10; i++) {
    dots += i <= filled ? '●' : '○';
  }
  return `<span class="score-dots ${cls}">${dots}</span>`;
}

function scoreBarClass(value) {
  if (value >= 0.7) return 'high';
  if (value >= 0.4) return 'medium';
  return 'low';
}

// ─── Toast ─────────────────────────────────────────────────────────────────────

function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    setTimeout(() => toast.remove(), 280);
  }, 3000);
}

// ─── Fetch Helpers ─────────────────────────────────────────────────────────────

async function apiFetch(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Unknown API error');
  return json.data;
}

async function apiPost(path) {
  const res = await fetch(path, { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Unknown API error');
  return json.data;
}

// ─── Sorting ───────────────────────────────────────────────────────────────────

function sortEntries(entries, sortValue) {
  const [field, order] = sortValue.split('-');
  const dir = order === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    switch (field) {
      case 'qualityScore':
        return (a.qualityScore - b.qualityScore) * dir;
      case 'name':
        return a.name.localeCompare(b.name) * dir;
      case 'lastVerified':
        return a.lastVerified.localeCompare(b.lastVerified) * dir;
      case 'staleness': {
        const levels = { fresh: 0, aging: 1, stale: 2, critical: 3 };
        const la = levels[a.staleness?.level ?? 'fresh'];
        const lb = levels[b.staleness?.level ?? 'fresh'];
        return (la - lb) * dir;
      }
      default:
        return 0;
    }
  });
}

// ─── Category Sidebar ──────────────────────────────────────────────────────────

function renderCategoryList() {
  const container = document.getElementById('category-list');
  if (!container) return;

  let html = `<a class="category-item ${state.activeCategory === 'all' ? 'active' : ''}" data-category="all" href="#category=all">
    All <span class="category-count" id="cat-count-all">${state.entries.length}</span>
  </a>`;

  for (const { category, count } of state.categories) {
    const active = state.activeCategory === category ? 'active' : '';
    html += `<a class="category-item ${active}" data-category="${category}" href="#category=${category}">
      ${capitalize(category)} <span class="category-count">${count}</span>
    </a>`;
  }

  container.innerHTML = html;

  container.querySelectorAll('.category-item').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const cat = el.dataset.category;
      selectCategory(cat);
    });
  });
}

function selectCategory(category) {
  state.activeCategory = category;
  updateHash();
  filterAndRender();
  renderCategoryList();
}

// ─── Stats Bar ─────────────────────────────────────────────────────────────────

function renderStats() {
  if (!state.stats) return;
  const s = state.stats;
  setText('stat-total', s.totalEntries);
  setText('stat-categories', s.categories);
  setText('stat-fresh', s.staleness.fresh);
  setText('stat-aging', s.staleness.aging);
  setText('stat-stale', (s.staleness.stale || 0) + (s.staleness.critical || 0));
  setText('stat-avg-score', s.averageQualityScore.toFixed(1));
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(val);
}

// ─── Filter + Render Grid ──────────────────────────────────────────────────────

function filterAndRender() {
  let entries = state.entries;

  if (state.activeCategory !== 'all') {
    entries = entries.filter(e => e.category === state.activeCategory);
  }

  if (!state.searchQuery) {
    entries = sortEntries(entries, state.sortValue);
  }

  state.filtered = entries;

  const countEl = document.getElementById('results-count');
  if (countEl) {
    countEl.textContent = `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`;
  }

  renderGrid(entries);
}

function renderGrid(entries) {
  const grid = document.getElementById('entries-grid');
  if (!grid) return;

  if (entries.length === 0) {
    grid.innerHTML = `<div class="empty-state">
      <span class="empty-state-icon">🔍</span>
      <div class="empty-state-title">No entries found</div>
      <div class="empty-state-subtitle">Try a different search term or category.</div>
    </div>`;
    return;
  }

  grid.innerHTML = entries.map(e => renderCard(e)).join('');

  grid.querySelectorAll('.view-details-btn').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.slug));
  });
}

function renderCard(entry) {
  const color = getCategoryColor(entry.category);
  const level = entry.staleness?.level || 'fresh';
  const days = entry.staleness?.daysSinceVerified ?? 0;
  const bestFor = Array.isArray(entry.bestFor) ? entry.bestFor[0] : entry.bestFor;

  return `<article class="entry-card">
    <div class="card-top">
      <div class="card-badges">
        <span class="category-badge" style="background:${color}">${entry.category}</span>
        ${entry.pricing?.freeTier ? '<span class="badge badge-green">Free tier</span>' : ''}
      </div>
      <span class="staleness-dot ${level}" title="${getStalenessLabel(level)} — ${days}d ago"></span>
    </div>
    <div class="card-name">${escapeHtml(entry.name)}</div>
    <div class="card-description">${escapeHtml(entry.description)}</div>
    <div class="card-meta">
      <div class="card-score-row">
        ${renderScoreDots(entry.qualityScore)}
        <span class="score-num">${entry.qualityScore}/10</span>
      </div>
    </div>
    ${bestFor ? `<div class="card-bestfor"><strong>Best for:</strong> ${escapeHtml(bestFor)}</div>` : ''}
    <div class="card-footer">
      <button class="btn btn-sm btn-outline btn-full view-details-btn" data-slug="${entry.slug}">View Details</button>
    </div>
  </article>`;
}

// ─── Search ────────────────────────────────────────────────────────────────────

let searchDebounceTimer = null;

function onSearchInput(query) {
  const clearBtn = document.getElementById('search-clear');
  if (clearBtn) clearBtn.hidden = !query.trim();

  state.searchQuery = query.trim();
  updateHash();

  clearTimeout(searchDebounceTimer);
  if (!state.searchQuery) {
    filterAndRender();
    return;
  }

  searchDebounceTimer = setTimeout(() => performSearch(state.searchQuery), 300);
}

async function performSearch(query) {
  const grid = document.getElementById('entries-grid');
  if (grid) grid.innerHTML = '<div class="loading-state">Searching…</div>';

  try {
    const data = await apiFetch(`/api/entries?search=${encodeURIComponent(query)}`);
    state.filtered = data;

    const countEl = document.getElementById('results-count');
    if (countEl) {
      countEl.textContent = `${data.length} result${data.length !== 1 ? 's' : ''} for "${query}"`;
    }

    if (data.length === 0) {
      if (grid) grid.innerHTML = `<div class="empty-state">
        <span class="empty-state-icon">🔍</span>
        <div class="empty-state-title">No results for "${escapeHtml(query)}"</div>
        <div class="empty-state-subtitle">Try different keywords or browse by category.</div>
      </div>`;
      return;
    }

    renderGrid(data);
  } catch (e) {
    if (grid) grid.innerHTML = `<div class="empty-state">
      <span class="empty-state-icon">⚠</span>
      <div class="empty-state-title">Search failed</div>
      <div class="empty-state-subtitle">${escapeHtml(e.message)}</div>
    </div>`;
  }
}

// ─── Detail Modal ──────────────────────────────────────────────────────────────

async function openModal(slug) {
  const overlay = document.getElementById('detail-modal');
  const content = document.getElementById('modal-content');
  if (!overlay || !content) return;

  content.innerHTML = '<div class="loading-state">Loading…</div>';
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';

  try {
    const { entry, staleness, lintResult } = await apiFetch(`/api/entries/${slug}`);
    content.innerHTML = renderModalContent(entry, staleness, lintResult);

    content.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.dataset.code || btn.closest('.code-block')?.querySelector('pre')?.textContent || '';
        navigator.clipboard.writeText(code).then(() => {
          const orig = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = orig; }, 1500);
        }).catch(() => showToast('Copy failed — clipboard not available', 'error'));
      });
    });

    content.querySelectorAll('.relationship-link').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        openModal(link.dataset.slug);
      });
    });

    const verifyBtn = content.querySelector('.verify-entry-btn');
    if (verifyBtn) {
      verifyBtn.addEventListener('click', () => verifyEntry(slug, verifyBtn));
    }

    const quickStartBtn = content.querySelector('.copy-quickstart-btn');
    if (quickStartBtn) {
      quickStartBtn.addEventListener('click', () => copyQuickStart(entry));
    }
  } catch (e) {
    content.innerHTML = `<div class="empty-state">
      <span class="empty-state-icon">⚠</span>
      <div class="empty-state-title">Failed to load entry</div>
      <div class="empty-state-subtitle">${escapeHtml(e.message)}</div>
    </div>`;
  }
}

function closeModal() {
  const overlay = document.getElementById('detail-modal');
  if (overlay) overlay.hidden = true;
  document.body.style.overflow = '';
}

function renderModalContent(entry, staleness, lintResult) {
  const color = getCategoryColor(entry.category);
  const level = staleness?.level || 'fresh';
  const days = staleness?.daysSinceVerified ?? 0;

  const useCasesHtml = entry.useCases.map(uc => `
    <div class="use-case-item">
      <span class="use-case-pill ${uc.fit}">${uc.fit}</span>
      <span class="use-case-task">${escapeHtml(uc.task)}</span>
    </div>`).join('');

  const codeExamplesHtml = entry.codeExamples.map(ex => `
    <div style="margin-bottom:14px">
      <div class="code-block">
        <div class="code-block-header">
          <span class="code-block-title">${escapeHtml(ex.title)} <span style="color:#475569;text-transform:none;letter-spacing:0">(${escapeHtml(ex.language)})</span></span>
          <button class="copy-btn">Copy</button>
        </div>
        <pre>${escapeHtml(ex.code)}</pre>
      </div>
      ${ex.notes ? `<p style="font-size:12.5px;color:var(--color-text-muted);margin-top:6px">${escapeHtml(ex.notes)}</p>` : ''}
    </div>`).join('');

  const gotchasHtml = `<div class="gotcha-list">${
    entry.gotchas.map(g => `<div class="gotcha-card">${escapeHtml(g)}</div>`).join('')
  }</div>`;

  const altSlugs = (entry.alternatives || []).map(s =>
    `<a class="relationship-link" data-slug="${s}" href="#">${s}</a>`).join('');
  const compSlugs = (entry.complementary || []).map(s =>
    `<a class="relationship-link" data-slug="${s}" href="#">${s}</a>`).join('');

  const lintWarnings = lintResult && !lintResult.passed
    ? `<div style="margin-top:8px;padding:8px 12px;background:#FEF9C3;border-radius:6px;font-size:12.5px;color:#78350F">
        <strong>Lint issues:</strong> ${lintResult.issues.length} — ${lintResult.issues.slice(0, 2).map(i => i.message).join('; ')}${lintResult.issues.length > 2 ? '…' : ''}
      </div>`
    : '';

  return `
  <div class="modal-header">
    <div class="modal-header-top">
      <h1 class="modal-title">${escapeHtml(entry.name)}</h1>
      <button class="btn btn-sm btn-ghost verify-entry-btn" data-slug="${entry.slug}">Mark Verified</button>
    </div>
    <div class="modal-meta-row">
      <span class="category-badge" style="background:${color}">${entry.category}</span>
      ${entry.subcategory ? `<span class="badge badge-gray">${escapeHtml(entry.subcategory)}</span>` : ''}
      <span class="badge ${getStalenessBadge(level)}">${getStalenessEmoji(level)} ${getStalenessLabel(level)} (${days}d)</span>
      ${renderScoreDots(entry.qualityScore)}
      <span style="font-size:13px;font-weight:700;color:var(--color-text-muted)">${entry.qualityScore}/10</span>
    </div>
    <p class="modal-description">${escapeHtml(entry.description)}</p>
    ${lintWarnings}
  </div>

  <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap">
    <a href="${escapeHtml(entry.website)}" target="_blank" rel="noopener" class="btn btn-sm btn-outline">Website ↗</a>
    ${entry.pricing?.pricingUrl ? `<a href="${escapeHtml(entry.pricing.pricingUrl)}" target="_blank" rel="noopener" class="btn btn-sm btn-ghost">Pricing ↗</a>` : ''}
    ${entry.reliability?.statusPageUrl ? `<a href="${escapeHtml(entry.reliability.statusPageUrl)}" target="_blank" rel="noopener" class="btn btn-sm btn-ghost">Status ↗</a>` : ''}
    <button class="btn btn-sm btn-ghost copy-quickstart-btn">Copy Quick Start</button>
  </div>

  <div class="modal-section">
    <div class="modal-section-title">Use Cases</div>
    <div class="use-case-list">${useCasesHtml}</div>
  </div>

  <div class="modal-section">
    <div class="modal-section-title">Quick Start</div>
    <div class="code-block" style="margin-bottom:10px">
      <div class="code-block-header">
        <span class="code-block-title">Install</span>
        <button class="copy-btn">Copy</button>
      </div>
      <pre>${escapeHtml(entry.sdk.installCommand)}</pre>
    </div>
    <div class="code-block" style="margin-bottom:10px">
      <div class="code-block-header">
        <span class="code-block-title">Import</span>
        <button class="copy-btn">Copy</button>
      </div>
      <pre>${escapeHtml(entry.sdk.importStatement)}</pre>
    </div>
    ${entry.auth?.envVarName ? `<div class="code-block">
      <div class="code-block-header">
        <span class="code-block-title">Auth — ${escapeHtml(entry.auth.method)}</span>
        <button class="copy-btn">Copy</button>
      </div>
      <pre>${escapeHtml(entry.auth.codeSnippet || `${entry.auth.envVarName}=your_key_here`)}</pre>
    </div>` : ''}
  </div>

  <div class="modal-section">
    <div class="modal-section-title">Code Examples</div>
    ${codeExamplesHtml}
  </div>

  <div class="modal-section">
    <div class="modal-section-title">Pricing</div>
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-label">Model</div><div class="detail-value">${escapeHtml(entry.pricing.model)}</div></div>
      <div class="detail-item"><div class="detail-label">Free Tier</div><div class="detail-value">${entry.pricing.freeTier ? 'Yes' : 'No'}</div></div>
      ${entry.pricing.startingPrice ? `<div class="detail-item"><div class="detail-label">Starting Price</div><div class="detail-value">${escapeHtml(entry.pricing.startingPrice)}</div></div>` : ''}
      ${entry.pricing.costPer ? `<div class="detail-item"><div class="detail-label">Cost Per</div><div class="detail-value">${escapeHtml(entry.pricing.costPer)}</div></div>` : ''}
    </div>
  </div>

  <div class="modal-section">
    <div class="modal-section-title">Rate Limits</div>
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-label">Tier</div><div class="detail-value">${escapeHtml(entry.rateLimits.tier)}</div></div>
      <div class="detail-item"><div class="detail-label">Limit</div><div class="detail-value">${escapeHtml(entry.rateLimits.limit)}</div></div>
      ${entry.rateLimits.notes ? `<div class="detail-item" style="grid-column:1/-1"><div class="detail-label">Notes</div><div class="detail-value">${escapeHtml(entry.rateLimits.notes)}</div></div>` : ''}
      ${entry.rateLimits.retryStrategy ? `<div class="detail-item" style="grid-column:1/-1"><div class="detail-label">Retry Strategy</div><div class="detail-value">${escapeHtml(entry.rateLimits.retryStrategy)}</div></div>` : ''}
    </div>
  </div>

  <div class="modal-section">
    <div class="modal-section-title">Technical</div>
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-label">Primary Language</div><div class="detail-value">${escapeHtml(entry.sdk.primaryLanguage)}</div></div>
      ${entry.sdk.otherLanguages?.length ? `<div class="detail-item"><div class="detail-label">Other SDKs</div><div class="detail-value">${entry.sdk.otherLanguages.join(', ')}</div></div>` : ''}
      ${entry.reliability?.uptimeGuarantee ? `<div class="detail-item"><div class="detail-label">Uptime SLA</div><div class="detail-value">${escapeHtml(entry.reliability.uptimeGuarantee)}</div></div>` : ''}
      ${entry.reliability?.notes ? `<div class="detail-item" style="grid-column:1/-1"><div class="detail-label">Reliability Notes</div><div class="detail-value">${escapeHtml(entry.reliability.notes)}</div></div>` : ''}
    </div>
  </div>

  <div class="modal-section">
    <div class="modal-section-title">Gotchas</div>
    ${gotchasHtml}
  </div>

  ${altSlugs || compSlugs ? `<div class="modal-section">
    <div class="modal-section-title">Relationships</div>
    ${altSlugs ? `<div style="margin-bottom:10px"><div style="font-size:12px;font-weight:600;color:var(--color-text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Alternatives</div><div class="relationship-links">${altSlugs}</div></div>` : ''}
    ${compSlugs ? `<div><div style="font-size:12px;font-weight:600;color:var(--color-text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Complementary</div><div class="relationship-links">${compSlugs}</div></div>` : ''}
  </div>` : ''}

  <div class="modal-section">
    <div class="modal-section-title">Quality</div>
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-label">Score</div><div class="detail-value">${entry.qualityScore}/10</div></div>
      <div class="detail-item" style="grid-column:1/-1"><div class="detail-label">Justification</div><div class="detail-value">${escapeHtml(entry.qualityJustification)}</div></div>
    </div>
  </div>

  <div class="modal-section">
    <div class="modal-section-title">Metadata</div>
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-label">Slug</div><div class="detail-value text-mono">${escapeHtml(entry.slug)}</div></div>
      <div class="detail-item"><div class="detail-label">Last Verified</div><div class="detail-value">${escapeHtml(entry.lastVerified)}</div></div>
      <div class="detail-item"><div class="detail-label">Entry Version</div><div class="detail-value">${escapeHtml(String(entry.entryVersion))}</div></div>
      <div class="detail-item"><div class="detail-label">Added By</div><div class="detail-value">${escapeHtml(entry.addedBy)}</div></div>
    </div>
  </div>`;
}

function copyQuickStart(entry) {
  const firstExample = entry.codeExamples?.[0];
  const parts = [
    `# Install`,
    entry.sdk.installCommand,
    ``,
    `# Environment`,
    entry.auth?.envVarName ? `${entry.auth.envVarName}=your_key_here` : '',
    ``,
    `# Example: ${firstExample?.title || 'Usage'}`,
    firstExample?.code || '',
  ].filter(line => line !== null && line !== undefined);

  navigator.clipboard.writeText(parts.join('\n')).then(() => {
    showToast('Quick Start copied to clipboard!');
  }).catch(() => showToast('Copy failed — clipboard not available', 'error'));
}

async function verifyEntry(slug, btn) {
  btn.disabled = true;
  btn.textContent = 'Verifying…';
  try {
    const data = await apiPost(`/api/entries/${slug}/verify`);
    showToast(`Marked as verified (${data.lastVerified}). ${data.note}`, 'info');
    btn.textContent = 'Verified ✓';
  } catch (e) {
    showToast(`Failed: ${e.message}`, 'error');
    btn.disabled = false;
    btn.textContent = 'Mark Verified';
  }
}

// ─── Report View ───────────────────────────────────────────────────────────────

async function loadReportView() {
  if (state.viewsLoaded.has('report')) return;
  state.viewsLoaded.add('report');

  const container = document.getElementById('report-content');
  if (!container) return;

  try {
    const { report } = await apiFetch('/api/refresh-report');
    container.innerHTML = renderReport(report);

    container.querySelectorAll('.verify-row-btn').forEach(btn => {
      btn.addEventListener('click', () => verifyEntryRow(btn.dataset.slug, btn));
    });
  } catch (e) {
    container.innerHTML = `<div class="empty-state">
      <span class="empty-state-icon">⚠</span>
      <div class="empty-state-title">Failed to load report</div>
      <div class="empty-state-subtitle">${escapeHtml(e.message)}</div>
    </div>`;
  }
}

function renderReport(report) {
  const order = ['critical', 'stale', 'aging', 'fresh'];
  let html = '';

  for (const level of order) {
    const group = report[level];
    if (!group || group.length === 0) continue;

    html += `<div class="staleness-group">
      <div class="staleness-group-header ${level}">
        ${getStalenessEmoji(level)} ${capitalize(level)}
        <span class="staleness-group-count">${group.length} entries</span>
      </div>`;

    for (const item of group) {
      html += `<div class="entry-row">
        <span class="entry-row-name">${escapeHtml(item.name)}</span>
        <span class="entry-row-slug">${escapeHtml(item.slug)}</span>
        <span class="entry-row-days">${item.daysSinceVerified}d ago</span>
        <div class="entry-row-actions">
          <span class="badge ${getStalenessBadge(level)}">${getStalenessLabel(level)}</span>
          <button class="btn btn-sm btn-ghost verify-row-btn" data-slug="${item.slug}">Verify</button>
        </div>
      </div>`;
    }

    html += '</div>';
  }

  if (!html) {
    html = `<div class="empty-state">
      <span class="empty-state-icon">✅</span>
      <div class="empty-state-title">All entries are fresh!</div>
      <div class="empty-state-subtitle">Nothing needs verification right now.</div>
    </div>`;
  }

  return html;
}

async function verifyEntryRow(slug, btn) {
  btn.disabled = true;
  btn.textContent = '…';
  try {
    await apiPost(`/api/entries/${slug}/verify`);
    showToast(`${slug} marked as verified`, 'success');
    btn.textContent = 'Done ✓';
    const row = btn.closest('.entry-row');
    if (row) {
      row.style.opacity = '0.4';
      row.style.transition = 'opacity 0.3s ease';
    }
  } catch (e) {
    showToast(`Failed: ${e.message}`, 'error');
    btn.disabled = false;
    btn.textContent = 'Verify';
  }
}

// ─── Lint View ─────────────────────────────────────────────────────────────────

async function loadLintView() {
  if (state.viewsLoaded.has('lint')) return;
  state.viewsLoaded.add('lint');

  const container = document.getElementById('lint-content');
  if (!container) return;

  try {
    const data = await apiFetch('/api/lint');
    container.innerHTML = renderLint(data);
  } catch (e) {
    container.innerHTML = `<div class="empty-state">
      <span class="empty-state-icon">⚠</span>
      <div class="empty-state-title">Failed to load lint results</div>
      <div class="empty-state-subtitle">${escapeHtml(e.message)}</div>
    </div>`;
  }
}

function renderLint(data) {
  const failing = data.results.filter(r => !r.passed);
  const passing = data.results.filter(r => r.passed);

  let html = `<div class="lint-summary-bar">
    <div class="lint-summary-item"><span style="color:var(--color-success)">✓</span> ${data.passing} passing</div>
    <div class="lint-summary-item"><span style="color:var(--color-danger)">✗</span> ${data.failing} failing</div>
    <div class="lint-summary-item">Total: ${data.total}</div>
  </div>`;

  if (failing.length > 0) {
    html += `<h3 style="font-size:14px;font-weight:700;margin-bottom:10px;color:var(--color-danger)">Failing (${failing.length})</h3>`;
    for (const r of failing) {
      html += renderLintEntry(r);
    }
    html += '<div style="height:20px"></div>';
  }

  if (passing.length > 0) {
    html += `<h3 style="font-size:14px;font-weight:700;margin-bottom:10px;color:var(--color-success)">Passing (${passing.length})</h3>`;
    for (const r of passing) {
      html += renderLintEntry(r);
    }
  }

  return html;
}

function renderLintEntry(result) {
  const icon = result.passed ? '✓' : '✗';
  const color = result.passed ? 'var(--color-success)' : 'var(--color-danger)';

  const issuesHtml = result.issues.length > 0
    ? `<div class="lint-issues-list">${result.issues.map(i => {
        const sev = i.severity || 'warning';
        const ico = sev === 'error' ? '✗' : sev === 'warning' ? '⚠' : 'ℹ';
        return `<div class="lint-issue ${sev}">
          <span class="lint-issue-icon">${ico}</span>
          <span>${escapeHtml(i.message)}</span>
        </div>`;
      }).join('')}</div>`
    : '';

  return `<div class="lint-entry">
    <div class="lint-entry-header">
      <span style="color:${color};font-size:15px;font-weight:700">${icon}</span>
      <span class="lint-entry-name">${escapeHtml(result.name || result.slug)}</span>
      <span style="font-family:var(--font-mono);font-size:12px;color:var(--color-text-muted)">${escapeHtml(result.slug)}</span>
      ${result.issues.length > 0 ? `<span class="lint-entry-issues-count">${result.issues.length} issue${result.issues.length !== 1 ? 's' : ''}</span>` : ''}
    </div>
    ${issuesHtml}
  </div>`;
}

// ─── Search Test View ──────────────────────────────────────────────────────────

async function runSearchTest(query) {
  const container = document.getElementById('test-results');
  if (!container || !query.trim()) return;

  container.innerHTML = '<div class="loading-state">Running search…</div>';

  try {
    const data = await apiFetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
    container.innerHTML = renderSearchResults(data);
  } catch (e) {
    container.innerHTML = `<div class="empty-state">
      <span class="empty-state-icon">⚠</span>
      <div class="empty-state-title">Search failed</div>
      <div class="empty-state-subtitle">${escapeHtml(e.message)}</div>
    </div>`;
  }
}

function renderSearchResults(data) {
  if (data.count === 0) {
    return `<div class="empty-state">
      <span class="empty-state-icon">🔍</span>
      <div class="empty-state-title">No results for "${escapeHtml(data.query)}"</div>
    </div>`;
  }

  return data.results.map((r, i) => renderTestResultCard(r, i + 1)).join('');
}

function renderTestResultCard(r, rank) {
  const breakdown = r.scoreBreakdown || {};
  const factors = Object.entries(breakdown);

  const scoreClass = scoreBarClass(r.score);
  const confClass = scoreBarClass(r.confidence / 100);

  const breakdownRows = factors.map(([name, value]) => {
    const numVal = typeof value === 'number' ? value : 0;
    const pct = Math.round(numVal * 100);
    return `<div class="td factor-name">${escapeHtml(name)}</div>
      <div class="td factor-value">${numVal.toFixed(3)}</div>
      <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${pct}%"></div></div>`;
  }).join('');

  const breakdownHtml = factors.length > 0 ? `
    <div class="score-breakdown-table" style="margin-top:12px">
      <div class="th">Factor</div>
      <div class="th" style="text-align:right">Value</div>
      <div class="th">Bar</div>
      ${breakdownRows}
    </div>` : '';

  const bestFor = Array.isArray(r.bestFor) ? r.bestFor.slice(0, 2).join(', ') : (r.bestFor || '');

  return `<div class="test-result-card">
    <div class="test-result-header">
      <span class="test-result-rank">${rank}</span>
      <span class="test-result-name">${escapeHtml(r.name)}</span>
      <span class="category-badge" style="background:${getCategoryColor(r.category)}">${r.category}</span>
      <span class="test-result-confidence">Confidence: ${r.confidence}%</span>
    </div>
    <div class="score-bar-row">
      <span class="score-bar-label">Score</span>
      <div class="score-bar-track">
        <div class="score-bar-fill ${scoreClass}" style="width:${Math.round(r.score * 100)}%"></div>
      </div>
      <span class="score-bar-value">${r.score.toFixed(3)}</span>
    </div>
    <div class="score-bar-row">
      <span class="score-bar-label">Confidence</span>
      <div class="score-bar-track">
        <div class="score-bar-fill ${confClass}" style="width:${r.confidence}%"></div>
      </div>
      <span class="score-bar-value">${r.confidence}%</span>
    </div>
    ${bestFor ? `<div style="font-size:12.5px;color:var(--color-text-muted);margin-bottom:4px"><strong style="color:var(--color-text)">Best for:</strong> ${escapeHtml(bestFor)}</div>` : ''}
    <div style="font-size:12.5px;color:var(--color-text-muted)">${escapeHtml(r.description)}</div>
    ${breakdownHtml}
  </div>`;
}

// ─── Navigation & View Switching ───────────────────────────────────────────────

function switchView(viewId) {
  state.activeView = viewId;

  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  const view = document.getElementById(`view-${viewId}`);
  if (view) view.classList.add('active');

  const navItem = document.querySelector(`.nav-item[data-view="${viewId}"]`);
  if (navItem) navItem.classList.add('active');

  if (viewId === 'report') loadReportView();
  if (viewId === 'lint') loadLintView();

  updateHash();
}

// ─── URL Hash ──────────────────────────────────────────────────────────────────

function updateHash() {
  const parts = [];
  if (state.activeView !== 'dashboard') parts.push(`view=${state.activeView}`);
  if (state.activeCategory !== 'all') parts.push(`category=${state.activeCategory}`);
  if (state.searchQuery) parts.push(`q=${encodeURIComponent(state.searchQuery)}`);
  const hash = parts.join('&');
  history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search);
}

function parseHash() {
  const hash = location.hash.slice(1);
  if (!hash) return;
  const params = new URLSearchParams(hash);
  const view = params.get('view');
  const category = params.get('category');
  const q = params.get('q');

  if (view) state.activeView = view;
  if (category) state.activeCategory = category;
  if (q) state.searchQuery = decodeURIComponent(q);
}

// ─── Utility ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── Initialization ────────────────────────────────────────────────────────────

async function loadStats() {
  try {
    state.stats = await apiFetch('/api/stats');
    renderStats();
  } catch (e) {
    console.error('Failed to load stats:', e);
  }
}

async function loadCategories() {
  try {
    state.categories = await apiFetch('/api/categories');
    renderCategoryList();
  } catch (e) {
    console.error('Failed to load categories:', e);
  }
}

async function loadEntries() {
  const grid = document.getElementById('entries-grid');
  try {
    const sortParts = state.sortValue.split('-');
    const sort = sortParts[0];
    const order = sortParts[1] || 'asc';
    state.entries = await apiFetch(`/api/entries?sort=${sort}&order=${order}`);
    filterAndRender();
  } catch (e) {
    if (grid) grid.innerHTML = `<div class="empty-state">
      <span class="empty-state-icon">⚠</span>
      <div class="empty-state-title">Failed to load entries</div>
      <div class="empty-state-subtitle">${escapeHtml(e.message)}</div>
    </div>`;
  }
}

function setupEventListeners() {
  // Navigation
  document.querySelectorAll('.nav-item[data-view]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      switchView(el.dataset.view);
    });
  });

  // Search input
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    if (state.searchQuery) {
      searchInput.value = state.searchQuery;
    }
    searchInput.addEventListener('input', e => onSearchInput(e.target.value));
  }

  // Search clear button
  const clearBtn = document.getElementById('search-clear');
  if (clearBtn) {
    if (state.searchQuery) clearBtn.hidden = false;
    clearBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      state.searchQuery = '';
      clearBtn.hidden = true;
      filterAndRender();
      updateHash();
    });
  }

  // Sort select
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.value = state.sortValue;
    sortSelect.addEventListener('change', e => {
      state.sortValue = e.target.value;
      if (!state.searchQuery) {
        state.filtered = sortEntries(state.filtered, state.sortValue);
        renderGrid(state.filtered);
      }
    });
  }

  // Modal close button
  const modalClose = document.getElementById('modal-close');
  if (modalClose) modalClose.addEventListener('click', closeModal);

  // Modal overlay click-outside
  const modalOverlay = document.getElementById('detail-modal');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', e => {
      if (e.target === modalOverlay) closeModal();
    });
  }

  // Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // Search test view
  const testBtn = document.getElementById('test-query-btn');
  const testInput = document.getElementById('test-query-input');
  if (testBtn && testInput) {
    testBtn.addEventListener('click', () => runSearchTest(testInput.value));
    testInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') runSearchTest(testInput.value);
    });
  }

  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.dataset.q;
      if (testInput) testInput.value = q;
      runSearchTest(q);
    });
  });
}

async function init() {
  parseHash();

  setupEventListeners();
  switchView(state.activeView);

  await Promise.all([
    loadStats(),
    loadCategories(),
    loadEntries(),
  ]);

  if (state.searchQuery) {
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = state.searchQuery;
    const clearBtn = document.getElementById('search-clear');
    if (clearBtn) clearBtn.hidden = false;
    performSearch(state.searchQuery);
  }
}

document.addEventListener('DOMContentLoaded', init);
