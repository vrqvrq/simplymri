// SimplyDiagnostic LIS - Modern Client-side JavaScript

document.addEventListener('DOMContentLoaded', function() {
  initNavHighlight();
  initDarkMode();
  initMobileMenu();
  initDashboardCharts();
  initAutocomplete();
  initBulkSelect();
  initToasts();
  initNotifications();
  initKeyboardShortcuts();
});

// ===== NAV HIGHLIGHT =====
function initNavHighlight() {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-link').forEach(function(link) {
    const href = link.getAttribute('href');
    if (path === href || (href !== '/dashboard' && path.startsWith(href))) {
      link.classList.add('active');
    }
  });
}

// ===== DARK MODE =====
function initDarkMode() {
  const saved = localStorage.getItem('theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  document.querySelectorAll('.theme-toggle').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      updateToggleText();
    });
  });

  updateToggleText();
}

function updateToggleText() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.querySelectorAll('.theme-toggle').forEach(function(btn) {
    btn.textContent = isDark ? 'Light Mode' : 'Dark Mode';
  });
}

// ===== MOBILE MENU =====
function initMobileMenu() {
  const btn = document.querySelector('.mobile-menu-btn');
  const sidebar = document.querySelector('.sidebar');
  if (!btn || !sidebar) return;

  btn.addEventListener('click', function() {
    sidebar.classList.toggle('open');
  });

  document.querySelector('.content').addEventListener('click', function() {
    sidebar.classList.remove('open');
  });
}

// ===== DASHBOARD CHARTS =====
function initDashboardCharts() {
  const chartsContainer = document.getElementById('charts-grid');
  if (!chartsContainer) return;

  fetch('/api/dashboard-stats')
    .then(r => r.json())
    .then(data => renderCharts(data))
    .catch(err => console.error('Chart data error:', err));
}

function renderCharts(data) {
  // Orders by status - Donut
  if (data.ordersByStatus.length > 0) {
    const ctx1 = document.getElementById('chart-orders-status');
    if (ctx1) {
      new Chart(ctx1, {
        type: 'doughnut',
        data: {
          labels: data.ordersByStatus.map(d => d.status),
          datasets: [{
            data: data.ordersByStatus.map(d => d.count),
            backgroundColor: ['#f59e0b', '#3b82f6', '#10b981', '#06b6d4', '#8b5cf6'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'bottom', labels: { padding: 16, font: { size: 12 } } } },
          cutout: '65%'
        }
      });
    }
  }

  // Orders per day - Line
  if (data.ordersPerDay.length > 0) {
    const ctx2 = document.getElementById('chart-orders-daily');
    if (ctx2) {
      new Chart(ctx2, {
        type: 'line',
        data: {
          labels: data.ordersPerDay.map(d => d.day.slice(5)),
          datasets: [{
            label: 'Orders',
            data: data.ordersPerDay.map(d => d.count),
            borderColor: '#4f46e5',
            backgroundColor: 'rgba(79,70,229,0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: '#4f46e5'
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
      });
    }
  }

  // Tests by category - Bar
  if (data.testsByCategory.length > 0) {
    const ctx3 = document.getElementById('chart-tests-category');
    if (ctx3) {
      new Chart(ctx3, {
        type: 'bar',
        data: {
          labels: data.testsByCategory.map(d => d.category),
          datasets: [{
            label: 'Tests',
            data: data.testsByCategory.map(d => d.count),
            backgroundColor: ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
            borderRadius: 6,
            borderSkipped: false
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
      });
    }
  }

  // Revenue - Line
  if (data.revenuePerDay.length > 0) {
    const ctx4 = document.getElementById('chart-revenue');
    if (ctx4) {
      new Chart(ctx4, {
        type: 'line',
        data: {
          labels: data.revenuePerDay.map(d => d.day.slice(5)),
          datasets: [{
            label: 'Revenue ($)',
            data: data.revenuePerDay.map(d => d.revenue),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16,185,129,0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: '#10b981'
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true } }
        }
      });
    }
  }

  // Top tests - Horizontal bar
  if (data.topTests.length > 0) {
    const ctx5 = document.getElementById('chart-top-tests');
    if (ctx5) {
      new Chart(ctx5, {
        type: 'bar',
        data: {
          labels: data.topTests.map(d => d.code),
          datasets: [{
            label: 'Ordered',
            data: data.topTests.map(d => d.count),
            backgroundColor: '#8b5cf6',
            borderRadius: 6,
            borderSkipped: false
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
      });
    }
  }

  // Abnormal results - Pie
  if (data.abnormalResults.length > 0) {
    const ctx6 = document.getElementById('chart-abnormal');
    if (ctx6) {
      const colors = { NORMAL: '#10b981', HIGH: '#ef4444', LOW: '#f59e0b' };
      new Chart(ctx6, {
        type: 'pie',
        data: {
          labels: data.abnormalResults.map(d => d.flag),
          datasets: [{
            data: data.abnormalResults.map(d => d.count),
            backgroundColor: data.abnormalResults.map(d => colors[d.flag] || '#94a3b8'),
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'bottom', labels: { padding: 16, font: { size: 12 } } } }
        }
      });
    }
  }
}

// ===== AUTOCOMPLETE =====
function initAutocomplete() {
  const input = document.getElementById('patient-search-auto');
  const results = document.getElementById('autocomplete-results');
  if (!input || !results) return;

  let timeout;
  input.addEventListener('input', function() {
    clearTimeout(timeout);
    const q = this.value.trim();
    if (q.length < 2) { results.classList.remove('active'); return; }

    timeout = setTimeout(function() {
      fetch('/api/patients/search?q=' + encodeURIComponent(q))
        .then(r => r.json())
        .then(function(patients) {
          if (patients.length === 0) {
            results.classList.remove('active');
            return;
          }
          results.innerHTML = patients.map(function(p) {
            return '<div class="autocomplete-item" data-id="' + p.id + '">'
              + p.first_name + ' ' + p.last_name
              + '<small>' + p.patient_id + '</small>'
              + '</div>';
          }).join('');
          results.classList.add('active');
        });
    }, 250);
  });

  results.addEventListener('click', function(e) {
    const item = e.target.closest('.autocomplete-item');
    if (item) {
      window.location.href = '/patients/' + item.dataset.id;
    }
  });

  document.addEventListener('click', function(e) {
    if (!e.target.closest('.autocomplete-wrapper')) {
      results.classList.remove('active');
    }
  });
}

// ===== BULK SELECT =====
function initBulkSelect() {
  const selectAll = document.getElementById('bulk-select-all');
  if (!selectAll) return;

  const checkboxes = document.querySelectorAll('.bulk-checkbox:not(#bulk-select-all)');
  const actionsBar = document.querySelector('.bulk-actions');
  const countEl = document.querySelector('.bulk-count');

  selectAll.addEventListener('change', function() {
    checkboxes.forEach(function(cb) { cb.checked = selectAll.checked; });
    updateBulkUI();
  });

  checkboxes.forEach(function(cb) {
    cb.addEventListener('change', updateBulkUI);
  });

  function updateBulkUI() {
    const checked = document.querySelectorAll('.bulk-checkbox:checked:not(#bulk-select-all)');
    if (actionsBar) {
      actionsBar.classList.toggle('visible', checked.length > 0);
    }
    if (countEl) {
      countEl.textContent = checked.length + ' selected';
    }
  }

  // Bulk action handlers
  document.querySelectorAll('[data-bulk-action]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const action = this.dataset.bulkAction;
      const ids = Array.from(document.querySelectorAll('.bulk-checkbox:checked:not(#bulk-select-all)')).map(function(cb) { return cb.value; });

      if (ids.length === 0) return;

      if (action === 'delete' && !confirm('Are you sure you want to delete ' + ids.length + ' item(s)?')) return;

      fetch('/api/bulk/' + action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ids })
      })
      .then(function(r) { return r.json(); })
      .then(function() { window.location.reload(); })
      .catch(function(err) { showToast('Action failed: ' + err.message, 'error'); });
    });
  });
}

// ===== TOASTS =====
function initToasts() {
  // Check URL params for messages
  const params = new URLSearchParams(window.location.search);
  if (params.get('success')) showToast(params.get('success'), 'success');
  if (params.get('error')) showToast(params.get('error'), 'error');
}

function showToast(message, type) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast toast-' + (type || 'success');
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(function() {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100px)';
    toast.style.transition = '0.3s ease-out';
    setTimeout(function() { toast.remove(); }, 300);
  }, 4000);
}

// ===== NOTIFICATIONS =====
function initNotifications() {
  var bell = document.getElementById('notification-bell');
  if (!bell) return;

  loadNotifications();
  // Poll every 30 seconds
  setInterval(loadNotifications, 30000);
}

function loadNotifications() {
  fetch('/api/notifications')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var countEl = document.getElementById('bell-count');
      var listEl = document.getElementById('notification-list');

      if (data.unread > 0) {
        countEl.textContent = data.unread;
        countEl.style.display = 'block';
      } else {
        countEl.style.display = 'none';
      }

      if (data.notifications.length === 0) {
        listEl.innerHTML = '<div class="text-center" style="padding:20px;color:var(--text-muted)">No notifications</div>';
        return;
      }

      listEl.innerHTML = data.notifications.map(function(n) {
        var cls = 'notification-item' + (n.read ? '' : ' unread') + (n.type === 'critical' ? ' critical' : '');
        return '<div class="' + cls + '" data-id="' + n.id + '" data-link="' + (n.link || '#') + '">'
          + '<div class="notif-title">' + n.title + '</div>'
          + '<div class="notif-message">' + (n.message || '') + '</div>'
          + '<div class="notif-time">' + n.created_at + '</div>'
          + '</div>';
      }).join('');

      listEl.querySelectorAll('.notification-item').forEach(function(item) {
        item.addEventListener('click', function() {
          fetch('/api/notifications/' + item.dataset.id + '/read', { method: 'POST' });
          if (item.dataset.link && item.dataset.link !== '#') {
            window.location.href = item.dataset.link;
          }
        });
      });
    })
    .catch(function() {});
}

function toggleNotifications() {
  var dropdown = document.getElementById('notification-dropdown');
  dropdown.classList.toggle('active');
}

function markAllRead() {
  fetch('/api/notifications/read-all', { method: 'POST' })
    .then(function() { loadNotifications(); });
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
  if (!e.target.closest('.notification-bell')) {
    var dropdown = document.getElementById('notification-dropdown');
    if (dropdown) dropdown.classList.remove('active');
  }
});

// ===== KEYBOARD SHORTCUTS =====
function initKeyboardShortcuts() {
  // Add shortcuts modal to page
  var modal = document.createElement('div');
  modal.className = 'shortcuts-modal';
  modal.id = 'shortcuts-modal';
  modal.innerHTML = '<div class="shortcuts-card">'
    + '<h3>Keyboard Shortcuts</h3>'
    + '<div class="shortcut-row"><span>Go to Dashboard</span><kbd>g</kbd> <kbd>d</kbd></div>'
    + '<div class="shortcut-row"><span>Go to Patients</span><kbd>g</kbd> <kbd>p</kbd></div>'
    + '<div class="shortcut-row"><span>Go to Lab Orders</span><kbd>g</kbd> <kbd>o</kbd></div>'
    + '<div class="shortcut-row"><span>Go to Worklist</span><kbd>g</kbd> <kbd>w</kbd></div>'
    + '<div class="shortcut-row"><span>Go to Samples</span><kbd>g</kbd> <kbd>s</kbd></div>'
    + '<div class="shortcut-row"><span>Go to Billing</span><kbd>g</kbd> <kbd>b</kbd></div>'
    + '<div class="shortcut-row"><span>New Order</span><kbd>n</kbd> <kbd>o</kbd></div>'
    + '<div class="shortcut-row"><span>New Patient</span><kbd>n</kbd> <kbd>p</kbd></div>'
    + '<div class="shortcut-row"><span>Toggle Dark Mode</span><kbd>t</kbd> <kbd>d</kbd></div>'
    + '<div class="shortcut-row"><span>Show Shortcuts</span><kbd>?</kbd></div>'
    + '<div style="margin-top:16px;text-align:right"><button class="btn btn-outline" onclick="document.getElementById(\'shortcuts-modal\').classList.remove(\'active\')">Close</button></div>'
    + '</div>';
  document.body.appendChild(modal);

  var keys = [];
  var keyTimer;

  document.addEventListener('keydown', function(e) {
    // Ignore when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    // Escape closes modals
    if (e.key === 'Escape') {
      document.getElementById('shortcuts-modal').classList.remove('active');
      var amendModal = document.getElementById('amend-modal');
      if (amendModal) amendModal.style.display = 'none';
      return;
    }

    keys.push(e.key);
    clearTimeout(keyTimer);
    keyTimer = setTimeout(function() { keys = []; }, 500);

    var combo = keys.join('');

    switch (combo) {
      case '?': document.getElementById('shortcuts-modal').classList.add('active'); break;
      case 'gd': window.location.href = '/dashboard'; break;
      case 'gp': window.location.href = '/patients'; break;
      case 'go': window.location.href = '/orders'; break;
      case 'gw': window.location.href = '/worklist'; break;
      case 'gs': window.location.href = '/samples'; break;
      case 'gb': window.location.href = '/billing'; break;
      case 'no': window.location.href = '/orders/new'; break;
      case 'np': window.location.href = '/patients/new'; break;
      case 'td':
        var current = document.documentElement.getAttribute('data-theme');
        var next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        updateToggleText();
        break;
    }

    if (combo.length >= 2) keys = [];
  });
}
