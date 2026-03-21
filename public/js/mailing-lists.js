$(document).ready(function () {
  const API = '/api/mailing-lists';
  let currentListId = null;
  let allSubscribers = [];
  let editingListId = null;
  let currentWelcomeEmail = null;
  let activeListId = null;

  // ── Load all mailing lists ────────────────────────────────────
  function loadLists() {
    $('#listsLoading').show();
    $('#listsEmpty, #listsContainer, #subscriberPanel').hide();

    // Fetch lists and active state in parallel
    $.when(
      $.getJSON(API),
      $.getJSON(API + '/active')
    ).done(function (listsRes, activeRes) {
      $('#listsLoading').hide();

      const data = listsRes[0];
      const activeData = activeRes[0];
      activeListId = (activeData.success && activeData.mailingList) ? activeData.mailingList._id : null;

      if (!data.success || !data.mailingLists.length) {
        $('#listsEmpty').show();
        return;
      }

      const container = $('#listsContainer').empty();
      data.mailingLists.forEach(function (list) {
        const isActive = activeListId === list._id;
        const activeBorder = isActive ? 'border-success border-2' : 'border-0';
        const activeBadge = isActive
          ? '<span class="badge bg-success ms-2"><i class="fas fa-check-circle me-1"></i>Active</span>'
          : '';
        const toggleIcon = isActive ? 'fa-toggle-on text-success' : 'fa-toggle-off text-muted';
        const toggleTitle = isActive ? 'Deactivate' : 'Activate';

        const card = `
          <div class="col-md-6 col-lg-4">
            <div class="card ${activeBorder} shadow-sm h-100 list-card" data-id="${list._id}" style="cursor:pointer">
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-start">
                  <div>
                    <h5 class="fw-bold mb-1">${escapeHtml(list.name)}${activeBadge}</h5>
                    <p class="text-muted small mb-2">${escapeHtml(list.description || '')}</p>
                  </div>
                  <div class="d-flex align-items-center">
                    <button class="btn btn-sm btn-light me-1 toggle-active" data-id="${list._id}" title="${toggleTitle}" onclick="event.stopPropagation()">
                      <i class="fas ${toggleIcon} fa-lg"></i>
                    </button>
                    <div class="dropdown">
                      <button class="btn btn-sm btn-light" data-bs-toggle="dropdown" onclick="event.stopPropagation()">
                        <i class="fas fa-ellipsis-v"></i>
                      </button>
                      <ul class="dropdown-menu dropdown-menu-end">
                        <li><a class="dropdown-item edit-list" href="#" data-id="${list._id}" data-name="${escapeAttr(list.name)}" data-desc="${escapeAttr(list.description || '')}"><i class="fas fa-edit me-2"></i>Edit</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item text-danger delete-list" href="#" data-id="${list._id}"><i class="fas fa-trash me-2"></i>Delete</a></li>
                      </ul>
                    </div>
                  </div>
                </div>
                <div class="d-flex align-items-center mt-2">
                  <span class="badge bg-primary me-2"><i class="fas fa-users me-1"></i>${list.subscriberCount || 0} subscribers</span>
                  <span class="text-muted small">${new Date(list.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>`;
        container.append(card);
      });
      container.show();
    }).fail(function () {
      $('#listsLoading').hide();
      alert('Failed to load mailing lists');
    });
  }

  // ── Load subscribers for a list ───────────────────────────────
  function loadSubscribers(listId) {
    currentListId = listId;
    $('#listsLoading, #listsEmpty, #listsContainer').hide();
    $('#subscriberPanel').show();
    $('#subscribersLoading').show();
    $('#subscribersEmpty, #subscribersTable').hide();

    $.getJSON(API + '/' + listId, function (data) {
      $('#subscribersLoading').hide();

      if (!data.success) {
        alert('Failed to load mailing list');
        backToLists();
        return;
      }

      const list = data.mailingList;
      allSubscribers = data.subscribers || [];

      $('#panelListName').text(list.name);
      $('#panelListDesc').text(list.description || '');
      $('#subscriberCount').text(allSubscribers.length);

      // Build form URL
      const baseUrl = window.location.origin;
      const formUrl = baseUrl + '/api/mailing-lists/subscribe/' + listId;
      $('#formUrlDisplay').text(formUrl);
      $('#formExampleCode').text(
        '<form action="' + formUrl + '" method="POST">\n' +
        '  <input type="email" name="email" placeholder="Your email" required />\n' +
        '  <input type="hidden" name="tag" value="my-form" />\n' +
        '  <input type="hidden" name="domain" id="domainField" />\n' +
        '  <button type="submit">Subscribe</button>\n' +
        '</form>\n' +
        '<script>document.getElementById("domainField").value = window.location.hostname;</script>'
      );

      // Ensure every subscriber has a domain field (handles older records)
      allSubscribers.forEach(function (s) {
        if (!s.domain) s.domain = '';
      });

      // Build tag filter
      const allTags = new Set();
      allSubscribers.forEach(function (s) {
        (s.tags || []).forEach(function (t) { allTags.add(t); });
      });
      const select = $('#tagFilter').empty().append('<option value="">All tags</option>');
      allTags.forEach(function (t) {
        select.append('<option value="' + escapeAttr(t) + '">' + escapeHtml(t) + '</option>');
      });

      // Build domain filter & summary
      const domainCounts = {};
      allSubscribers.forEach(function (s) {
        const d = s.domain || '(unknown)';
        domainCounts[d] = (domainCounts[d] || 0) + 1;
      });
      const domainSelect = $('#domainFilter').empty().append('<option value="">All domains</option>');
      Object.keys(domainCounts).sort().forEach(function (d) {
        domainSelect.append('<option value="' + escapeAttr(d) + '">' + escapeHtml(d) + ' (' + domainCounts[d] + ')</option>');
      });

      // Render domain summary cards
      const summaryBody = $('#domainSummaryBody').empty();
      const sortedDomains = Object.entries(domainCounts).sort(function (a, b) { return b[1] - a[1]; });
      sortedDomains.forEach(function (entry) {
        const pct = allSubscribers.length ? Math.round(entry[1] / allSubscribers.length * 100) : 0;
        summaryBody.append(
          '<div class="col-6 col-md-4 col-lg-3">' +
            '<div class="border rounded p-3 text-center domain-badge" data-domain="' + escapeAttr(entry[0]) + '" style="cursor:pointer; transition: all 0.2s">' +
              '<div class="fw-bold text-truncate" title="' + escapeAttr(entry[0]) + '">' + escapeHtml(entry[0]) + '</div>' +
              '<div class="mt-1"><span class="badge bg-primary fs-6">' + entry[1] + '</span></div>' +
              '<div class="text-muted small mt-1">' + pct + '% of total</div>' +
            '</div>' +
          '</div>'
        );
      });
      if (sortedDomains.length) $('#domainSummaryCard').show(); else $('#domainSummaryCard').hide();

      // Load welcome email status
      loadWelcomeEmailStatus(listId);

      applyFiltersAndSort();
    }).fail(function () {
      $('#subscribersLoading').hide();
      alert('Failed to load subscribers');
      backToLists();
    });
  }

  // ── Filtering & sorting ────────────────────────────────────────
  function applyFiltersAndSort() {
    let filtered = allSubscribers.slice();

    const tagVal = $('#tagFilter').val();
    if (tagVal) filtered = filtered.filter(function (s) { return (s.tags || []).includes(tagVal); });

    const domainVal = $('#domainFilter').val();
    if (domainVal) {
      filtered = filtered.filter(function (s) { return s.domain === domainVal; });
      // Show active filter indicator
      $('#domainFilterText').text('Showing ' + filtered.length + ' emails from ' + domainVal);
      $('#domainFilterAlert').show();
      $('#clearDomainFilter').show();
      // Highlight active domain badge
      $('.domain-badge').removeClass('bg-primary text-white').css('border-color', '');
      $('.domain-badge[data-domain="' + domainVal + '"]').addClass('bg-primary text-white').find('.fw-bold, .small').addClass('text-white');
    } else {
      $('#domainFilterAlert').hide();
      $('#clearDomainFilter').hide();
      $('.domain-badge').removeClass('bg-primary text-white').css('border-color', '');
      $('.domain-badge .fw-bold, .domain-badge .small').removeClass('text-white');
    }

    const sort = $('#sortBy').val() || 'date-desc';
    filtered.sort(function (a, b) {
      switch (sort) {
        case 'date-asc':   return new Date(a.subscribedAt) - new Date(b.subscribedAt);
        case 'date-desc':  return new Date(b.subscribedAt) - new Date(a.subscribedAt);
        case 'email-asc':  return a.email.localeCompare(b.email);
        case 'email-desc': return b.email.localeCompare(a.email);
        case 'domain-asc': return (a.domain || '').localeCompare(b.domain || '');
        case 'domain-desc':return (b.domain || '').localeCompare(a.domain || '');
        default: return 0;
      }
    });

    renderSubscribers(filtered);
  }

  function renderSubscribers(subscribers) {
    const body = $('#subscribersBody').empty();

    if (!subscribers.length) {
      $('#subscribersTable').hide();
      $('#subscribersEmpty').show();
      return;
    }

    $('#subscribersEmpty').hide();
    subscribers.forEach(function (sub) {
      const tags = (sub.tags || []).map(function (t) {
        return '<span class="badge bg-secondary me-1">' + escapeHtml(t) + '</span>';
      }).join('');

      body.append(`
        <tr>
          <td>${escapeHtml(sub.email)}</td>
          <td><span class="badge bg-info bg-opacity-75">${escapeHtml(sub.domain || '—')}</span></td>
          <td>${tags || '<span class="text-muted">—</span>'}</td>
          <td>${new Date(sub.subscribedAt).toLocaleDateString()}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-danger delete-subscriber" data-id="${sub._id}">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        </tr>`);
    });
    $('#subscribersTable').show();
  }

  // ── Navigation ────────────────────────────────────────────────
  function backToLists() {
    currentListId = null;
    allSubscribers = [];
    $('#subscriberPanel').hide();
    loadLists();
  }

  // ── Events ────────────────────────────────────────────────────

  // Click on a list card
  $(document).on('click', '.list-card', function () {
    loadSubscribers($(this).data('id'));
  });

  // Activate / Deactivate toggle
  $(document).on('click', '.toggle-active', function (e) {
    e.preventDefault();
    e.stopPropagation();
    const id = $(this).data('id');
    const isCurrentlyActive = activeListId === id;

    if (isCurrentlyActive) {
      // Deactivate
      $.ajax({
        url: API + '/deactivate',
        method: 'POST',
        success: function () { loadLists(); },
        error: function () { alert('Failed to deactivate mailing list'); }
      });
    } else {
      // Activate this one (only one at a time)
      $.ajax({
        url: API + '/activate/' + id,
        method: 'POST',
        success: function () { loadLists(); },
        error: function () { alert('Failed to activate mailing list'); }
      });
    }
  });

  // Back button
  $('#backToListsBtn').on('click', backToLists);

  // Create new list
  $('#createListBtn').on('click', function () {
    editingListId = null;
    $('#listModalTitle').text('Create Mailing List');
    $('#listName').val('');
    $('#listDescription').val('');
    new bootstrap.Modal($('#listModal')[0]).show();
  });

  // Edit list
  $(document).on('click', '.edit-list', function (e) {
    e.preventDefault();
    e.stopPropagation();
    editingListId = $(this).data('id');
    $('#listModalTitle').text('Edit Mailing List');
    $('#listName').val($(this).data('name'));
    $('#listDescription').val($(this).data('desc'));
    new bootstrap.Modal($('#listModal')[0]).show();
  });

  // Save list (create or update)
  $('#saveListBtn').on('click', function () {
    const name = $('#listName').val().trim();
    const description = $('#listDescription').val().trim();
    if (!name) { alert('Name is required'); return; }

    const btn = $(this).prop('disabled', true);

    if (editingListId) {
      $.ajax({
        url: API + '/' + editingListId,
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify({ name, description }),
        success: function () {
          bootstrap.Modal.getInstance($('#listModal')[0]).hide();
          btn.prop('disabled', false);
          if (currentListId === editingListId) {
            loadSubscribers(currentListId);
          } else {
            loadLists();
          }
        },
        error: function () { alert('Failed to update list'); btn.prop('disabled', false); }
      });
    } else {
      $.ajax({
        url: API,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ name, description }),
        success: function () {
          bootstrap.Modal.getInstance($('#listModal')[0]).hide();
          btn.prop('disabled', false);
          loadLists();
        },
        error: function () { alert('Failed to create list'); btn.prop('disabled', false); }
      });
    }
  });

  // Delete list
  $(document).on('click', '.delete-list', function (e) {
    e.preventDefault();
    e.stopPropagation();
    const id = $(this).data('id');
    if (!confirm('Delete this mailing list and all its subscribers?')) return;

    $.ajax({
      url: API + '/' + id,
      method: 'DELETE',
      success: function () { loadLists(); },
      error: function () { alert('Failed to delete list'); }
    });
  });

  // Delete subscriber
  $(document).on('click', '.delete-subscriber', function () {
    const subId = $(this).data('id');
    if (!confirm('Remove this subscriber?')) return;

    $.ajax({
      url: API + '/' + currentListId + '/subscribers/' + subId,
      method: 'DELETE',
      success: function () { loadSubscribers(currentListId); },
      error: function () { alert('Failed to remove subscriber'); }
    });
  });

  // Copy form URL
  $('#copyUrlBtn').on('click', function () {
    const url = $('#formUrlDisplay').text();
    navigator.clipboard.writeText(url).then(function () {
      const btn = $('#copyUrlBtn');
      btn.html('<i class="fas fa-check me-1"></i>Copied!');
      setTimeout(function () { btn.html('<i class="fas fa-link me-1"></i>Copy Form URL'); }, 2000);
    });
  });

  // Export CSV
  $('#exportCsvBtn').on('click', function () {
    if (!allSubscribers.length) return;
    let csv = 'Email,Domain,Tags,Subscribed Date\n';
    allSubscribers.forEach(function (s) {
      csv += '"' + s.email + '","' + (s.domain || '') + '","' + (s.tags || []).join('; ') + '","' + new Date(s.subscribedAt).toISOString() + '"\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = ($('#panelListName').text() || 'subscribers') + '.csv';
    a.click();
  });

  // Filters & sort
  $('#tagFilter, #domainFilter, #sortBy').on('change', function () {
    applyFiltersAndSort();
  });

  // Click domain badge to filter
  $(document).on('click', '.domain-badge', function () {
    const d = $(this).data('domain');
    $('#domainFilter').val(d).trigger('change');
  });

  // Clear domain filter (both buttons)
  $('#clearDomainFilter, #clearDomainFilterAlert').on('click', function () {
    $('#domainFilter').val('').trigger('change');
  });

  // Click domain column header to toggle sort
  $(document).on('click', '#sortDomainHeader', function () {
    const cur = $('#sortBy').val();
    $('#sortBy').val(cur === 'domain-asc' ? 'domain-desc' : 'domain-asc').trigger('change');
  });

  // ── Welcome Email ─────────────────────────────────────────────

  function loadWelcomeEmailStatus(listId) {
    $.getJSON(API + '/' + listId + '/welcome-email', function (data) {
      currentWelcomeEmail = data.welcomeEmail;
      if (data.success && data.welcomeEmail && data.welcomeEmail.subject) {
        const we = data.welcomeEmail;
        const statusParts = [];
        statusParts.push('<strong>' + escapeHtml(we.subject) + '</strong>');
        if (we.attachment && we.attachment.filename) {
          statusParts.push(' &middot; <i class="fas fa-paperclip"></i> ' + escapeHtml(we.attachment.filename));
        }
        statusParts.push(' &middot; ' + (we.enabled ? '<span class="badge bg-success">Active</span>' : '<span class="badge bg-secondary">Disabled</span>'));
        $('#welcomeEmailStatusText').html(statusParts.join(''));
        $('#welcomeEmailStatus').show();
        $('#welcomeEmailBtn').html('<i class="fas fa-paper-plane me-1"></i>Welcome Email <span class="badge bg-success ms-1">On</span>');
      } else {
        currentWelcomeEmail = null;
        $('#welcomeEmailStatus').hide();
        $('#welcomeEmailBtn').html('<i class="fas fa-paper-plane me-1"></i>Welcome Email');
      }
    }).fail(function () {
      currentWelcomeEmail = null;
      $('#welcomeEmailStatus').hide();
    });
  }

  function openWelcomeEmailModal() {
    if (!currentListId) return;
    // Populate form
    if (currentWelcomeEmail) {
      $('#welcomeSubject').val(currentWelcomeEmail.subject || '');
      $('#welcomeBody').val(currentWelcomeEmail.htmlBody || '');
      $('#welcomeEnabled').prop('checked', currentWelcomeEmail.enabled !== false);
      if (currentWelcomeEmail.attachment && currentWelcomeEmail.attachment.filename) {
        $('#currentAttachmentName').text(currentWelcomeEmail.attachment.filename);
        const sizeKB = currentWelcomeEmail.attachment.size ? Math.round(currentWelcomeEmail.attachment.size / 1024) + ' KB' : '';
        $('#currentAttachmentSize').text(sizeKB);
        $('#currentAttachment').show();
      } else {
        $('#currentAttachment').hide();
      }
    } else {
      $('#welcomeSubject').val('');
      $('#welcomeBody').val('');
      $('#welcomeEnabled').prop('checked', true);
      $('#currentAttachment').hide();
    }
    $('#welcomeAttachment').val('');
    updateWelcomePreview();
    new bootstrap.Modal($('#welcomeEmailModal')[0]).show();
  }

  function updateWelcomePreview() {
    const html = $('#welcomeBody').val();
    if (html && html.trim()) {
      // Create a safe preview using an iframe-like sandbox via srcdoc
      $('#welcomePreview').html('<iframe srcdoc="' + escapeAttr(html) + '" style="width:100%;min-height:200px;border:none;" sandbox=""></iframe>');
    } else {
      $('#welcomePreview').html('<span class="text-muted small">No preview yet</span>');
    }
  }

  // Open welcome email modal
  $('#welcomeEmailBtn, #editWelcomeEmailBtn').on('click', function () {
    openWelcomeEmailModal();
  });

  // Live preview
  $('#welcomeBody').on('input', function () {
    updateWelcomePreview();
  });

  // Save welcome email
  $('#saveWelcomeEmailBtn').on('click', function () {
    const subject = $('#welcomeSubject').val().trim();
    const htmlBody = $('#welcomeBody').val().trim();
    const enabled = $('#welcomeEnabled').is(':checked');

    if (!subject) { alert('Subject is required'); return; }
    if (!htmlBody) { alert('Email body is required'); return; }

    const btn = $(this).prop('disabled', true);
    const file = $('#welcomeAttachment')[0].files[0];

    // Step 1: Save subject + body
    $.ajax({
      url: API + '/' + currentListId + '/welcome-email',
      method: 'PUT',
      contentType: 'application/json',
      data: JSON.stringify({ subject, htmlBody, enabled }),
      success: function () {
        // Step 2: Upload attachment if a new file was selected
        if (file) {
          var formData = new FormData();
          formData.append('attachment', file);
          $.ajax({
            url: API + '/' + currentListId + '/welcome-email/attachment',
            method: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function () {
              btn.prop('disabled', false);
              bootstrap.Modal.getInstance($('#welcomeEmailModal')[0]).hide();
              loadWelcomeEmailStatus(currentListId);
            },
            error: function (xhr) {
              btn.prop('disabled', false);
              var msg = xhr.responseJSON ? xhr.responseJSON.error : 'Failed to upload attachment';
              alert('Email saved but attachment upload failed: ' + msg);
              bootstrap.Modal.getInstance($('#welcomeEmailModal')[0]).hide();
              loadWelcomeEmailStatus(currentListId);
            }
          });
        } else {
          btn.prop('disabled', false);
          bootstrap.Modal.getInstance($('#welcomeEmailModal')[0]).hide();
          loadWelcomeEmailStatus(currentListId);
        }
      },
      error: function (xhr) {
        btn.prop('disabled', false);
        var msg = xhr.responseJSON ? xhr.responseJSON.error : 'Failed to save welcome email';
        alert(msg);
      }
    });
  });

  // Remove attachment
  $('#removeAttachmentBtn').on('click', function () {
    if (!currentListId) return;
    if (!confirm('Remove the attachment from the welcome email?')) return;

    $.ajax({
      url: API + '/' + currentListId + '/welcome-email/attachment',
      method: 'DELETE',
      success: function () {
        $('#currentAttachment').hide();
        if (currentWelcomeEmail) currentWelcomeEmail.attachment = null;
      },
      error: function () { alert('Failed to remove attachment'); }
    });
  });

  // Delete entire welcome email
  $('#deleteWelcomeEmailBtn').on('click', function () {
    if (!currentListId) return;
    if (!confirm('Remove the welcome email configuration? New subscribers will no longer receive a welcome email.')) return;

    $.ajax({
      url: API + '/' + currentListId + '/welcome-email',
      method: 'DELETE',
      success: function () {
        currentWelcomeEmail = null;
        $('#welcomeEmailStatus').hide();
        $('#welcomeEmailBtn').html('<i class="fas fa-paper-plane me-1"></i>Welcome Email');
      },
      error: function () { alert('Failed to remove welcome email'); }
    });
  });

  // ── Helpers ───────────────────────────────────────────────────
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Init ──────────────────────────────────────────────────────
  loadLists();
});
