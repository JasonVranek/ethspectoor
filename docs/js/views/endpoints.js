import { state } from '../state.js';
import { sortForks } from '../forks.js';
import { esc, safeId, specBadge, methodBadge, forkBadge, typeLink, githubBtn } from '../utils.js';
import { fuzzyScore, fuzzyHighlight } from '../search.js';
import { SPEC_COLORS, METHOD_BADGES } from '../constants.js';

export function setEpFilter(key, value) {
  state.epFilters[key] = value;
  if (key === 'spec') state.epFilters.group = '';
  window.route();
}

export function renderEndpointBrowser(container, params, selected) {
  if (params.spec !== undefined && !selected) {
    if (params.spec) state.epFilters.spec = params.spec;
    if (params.method) state.epFilters.method = params.method;
    if (params.domain) state.epFilters.domain = params.domain;
    if (params.group) state.epFilters.group = params.group;
  }
  const filterSpec = state.epFilters.spec;
  const filterMethod = state.epFilters.method;
  const filterDomain = state.epFilters.domain;
  const filterGroup = state.epFilters.group;

  // Facets
  const specs = {}, methods = {}, domains = {};
  state.allEndpoints.forEach(ep => {
    specs[ep._spec] = (specs[ep._spec]||0) + 1;
    if (ep.method) methods[ep.method] = (methods[ep.method]||0) + 1;
    if (ep.domain) domains[ep.domain] = (domains[ep.domain]||0) + 1;
  });

  // Compute path-prefix groups for the selected spec
  function epGroup(ep) {
    var p = ep.path || ep._key || '';
    // REST APIs: extract version segment (e.g. /eth/v1/... -> v1)
    var vm = p.match(/^\/[^/]+\/(v\d+)\//);
    if (vm) return vm[1];
    // JSON-RPC methods: extract namespace prefix (e.g. engine_foo -> engine)
    var nm = p.match(/^([a-z]+)_/);
    if (nm) return nm[1];
    return '';
  }

  // Only compute groups within current spec filter
  const groups = {};
  if (filterSpec) {
    state.allEndpoints.forEach(function(ep) {
      if (ep._spec !== filterSpec) return;
      var g = epGroup(ep);
      if (g) groups[g] = (groups[g] || 0) + 1;
    });
  }

  let filtered = state.allEndpoints.filter(ep => {
    if (filterSpec && ep._spec !== filterSpec) return false;
    if (filterMethod && ep.method !== filterMethod) return false;
    if (filterDomain && ep.domain !== filterDomain) return false;
    if (filterGroup && epGroup(ep) !== filterGroup) return false;
    if (state.searchQuery) {
      const pathMatch = fuzzyScore(ep.path, state.searchQuery);
      const sumMatch = ep.summary ? fuzzyScore(ep.summary, state.searchQuery) : null;
      const opMatch = ep.operation_id ? fuzzyScore(ep.operation_id, state.searchQuery) : null;
      if (pathMatch === null && sumMatch === null && opMatch === null) return false;
    }
    return true;
  });

  if (state.searchQuery) {
    filtered.sort((a, b) => {
      const sa = Math.max(fuzzyScore(a.path, state.searchQuery) || -999, fuzzyScore(a.summary||'', state.searchQuery) || -999);
      const sb = Math.max(fuzzyScore(b.path, state.searchQuery) || -999, fuzzyScore(b.summary||'', state.searchQuery) || -999);
      return sb - sa;
    });
  } else {
    filtered.sort((a,b) => a.path.localeCompare(b.path));
  }

  // Sidebar
  let sideHtml = '<div class="sidebar-section"><h3>Specs</h3>';
  sideHtml += epFilterBtn('', 'All specs', state.allEndpoints.length, filterSpec === '', 'spec');
  for (const [s,c] of Object.entries(specs).sort((a,b)=>b[1]-a[1])) {
    sideHtml += epFilterBtn(s, s, c, filterSpec === s, 'spec');
  }
  sideHtml += '</div>';

  if (Object.keys(groups).length > 1) {
    sideHtml += '<div class="sidebar-section"><h3>Group</h3>';
    sideHtml += epFilterBtn('', 'All', '', filterGroup === '', 'group');
    for (const [g,cnt] of Object.entries(groups).sort((a,b)=>a[0].localeCompare(b[0]))) {
      sideHtml += epFilterBtn(g, g, cnt, filterGroup === g, 'group');
    }
    sideHtml += '</div>';
  }

  // Build list with active state
  const selName = selected ? selected.name : null;
  const selSpec = selected ? selected.spec : null;
  let listHtml = '<div class="list-header"><span>' + filtered.length + ' endpoints</span></div>';
  const renderCount = Math.min(filtered.length, 300);
  for (let i = 0; i < renderCount; i++) {
    const ep = filtered[i];
    const isActive = (ep._key === selName && ep._spec === selSpec);
    listHtml += '<div class="list-item' + (isActive ? ' active' : '') + '" onclick="navigate(\'#/endpoint/' +
      encodeURIComponent(ep._spec) + '/' + encodeURIComponent(ep._key) + '\')" style="gap:6px">' +
      methodBadge(ep.method) +
      '<span class="item-name" style="flex:none;max-width:250px">' + (state.searchQuery ? fuzzyHighlight(ep.path, state.searchQuery) : esc(ep.path)) + '</span>' +
      '<span style="font-size:11px;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">' + esc(ep.summary || '') + '</span>' +
      specBadge(ep._spec) +
      '</div>';
  }

  // Build detail panel
  let detailHtml;
  if (selected) {
    detailHtml = renderEndpointDetailContent(selected.spec, selected.name);
  } else {
    detailHtml = '<div class="empty-state"><div class="icon">🔌</div><div>Select an endpoint to view details</div></div>';
  }

  container.innerHTML =
    '<div class="panel-sidebar">' + sideHtml + '</div>' +
    '<div class="panel-list">' + listHtml + '</div>' +
    '<div class="panel-detail">' + detailHtml + '</div>';

  if (selected) {
    const activeRow = container.querySelector('.list-item.active');
    if (activeRow) activeRow.scrollIntoView({ block: 'nearest' });
  }
}

export function epFilterBtn(value, label, count, active, filterType) {
  return '<button class="filter-btn' + (active ? ' active' : '') + '" onclick="setEpFilter(\'' + filterType + '\', \'' + esc(value) + '\')">' +
    '<span>' + esc(label) + '</span>' +
    (count ? '<span class="count">' + count + '</span>' : '') +
    '</button>';
}

// --- VIEW 5: ENDPOINT DETAIL ---

const curlPathDefaults = {
  'block_id': 'head',
  'state_id': 'head',
  'slot': '1',
  'epoch': '1',
  'pubkey': '0x93247f2209abcacf57b75a51dafae777f9dd38bc7053d1af526f220a7489a6d3a2753e5f3e8b1cfe39b56f43611df74a',
  'parent_hash': '0xcf8e0d4e9587369b2301d0790347320302cc0943d5a1884560367e8208d920f2',
  'peer_id': '16Uiu2HAmEmBCWbHcqLJkYbS7MsrMNhpvMXsNGYJCkCRnBGPk9dQp',
  'validator_id': '0',
  'committee_index': '0',
  'sync_committee_index': '0',
  'blob_id': '0',
  'block_root': '0xcf8e0d4e9587369b2301d0790347320302cc0943d5a1884560367e8208d920f2',
};

const specPorts = {
  'beacon-apis': 5052,
  'builder-specs': 18550,
  'relay-specs': 18550,
  'remote-signing-api': 9000,
};

export function buildCurlFromInputs(ep, spec, mode) {
  const port = specPorts[spec] || 5052;
  const base = 'http://localhost:' + port;
  const parts = ['curl'];

  if (ep.method !== 'GET') parts.push('-X ' + ep.method);

  let path = ep.path;
  const inputs = mode ? document.querySelectorAll('.curl-input') : [];
  const pathVals = {};
  const queryVals = {};
  inputs.forEach(function(inp) {
    if (inp.dataset.in === 'path') pathVals[inp.dataset.param] = inp.value;
    else if (inp.dataset.in === 'query' && inp.value) queryVals[inp.dataset.param] = inp.value;
  });

  path = path.replace(/\{([^}]+)\}/g, (match, name) => {
    return pathVals[name] || curlPathDefaults[name] || '<' + name + '>';
  });

  let url = base + path;

  // Query string
  const qs = Object.entries(queryVals).map(([k,v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
  if (qs) url += '?' + qs;

  parts.push("'" + url + "'");

  // Headers
  if (ep.method === 'POST' || ep.method === 'PUT') {
    parts.push("-H 'Content-Type: application/json'");
  }
  const cn = ep.content_negotiation;
  if (cn && cn.ssz_support) {
    parts.push("-H 'Accept: application/json'");
  }

  // Body
  if (ep.request_body) {
    parts.push("-d '{...}'");
  }

  let cmd = parts.join(' \\\n  ');

  if (cn && cn.ssz_support) {
    cmd += '\n\n# For SSZ: -H \'Accept: application/octet-stream\'';
  }

  return cmd;
}

var _pendingCurlEp = null;

export function rebuildCurl() {
  if (!_pendingCurlEp) return;
  var cmd = buildCurlFromInputs(_pendingCurlEp, _pendingCurlEp.spec, 'live');
  var output = document.getElementById('curl-output');
  if (output) output.textContent = cmd;
}

// Event delegation: any input inside the curl section triggers a rebuild
document.addEventListener('input', function(e) {
  if (e.target.classList.contains('curl-input')) {
    rebuildCurl();
  }
});

export function renderEndpointDetailContent(spec, key) {
  const specData = state.catalog.specs[spec];
  if (!specData || !specData.endpoints || !specData.endpoints[key]) {
    return '<div class="empty-state"><div class="icon">❓</div><div>Endpoint not found: ' + esc(key) + '</div></div>';
  }
  const ep = specData.endpoints[key];

  let html = '<div class="detail-content">';

  // Method + Path
  html += '<div class="method-path">';
  html += '<span class="method-badge ' + (METHOD_BADGES[ep.method]||'') + '">' + esc(ep.method) + '</span>';
  html += '<span class="path">' + esc(ep.path) + '</span>';
  html += '</div>';

  // Badges
  html += '<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">';
  html += specBadge(spec);
  if (ep.domain) html += '<span class="badge-spec">' + esc(ep.domain) + '</span>';
  if (ep.operation_id) html += '<span class="badge-spec">' + esc(ep.operation_id) + '</span>';
  if (ep.tags) ep.tags.forEach(t => { html += '<span class="badge-fork">' + esc(t) + '</span>'; });
  html += '</div>';

  html += '<div style="margin-bottom:16px;display:flex;gap:8px">' + githubBtn(ep.github_url) + '</div>';

  // Interactive curl builder
  if (ep.path && ep.path.startsWith('/')) {
    const allParams = ep.parameters || [];
    const pathParams = allParams.filter(p => p.in === 'path');
    const queryParams = allParams.filter(p => p.in === 'query');

    html += '<div class="detail-section" id="curl-section"><h3>Try It <button onclick="copyCurl(this)" style="float:right;background:var(--surface-2);border:1px solid var(--border);border-radius:4px;color:var(--text-muted);font-size:11px;padding:2px 8px;cursor:pointer;font-family:var(--font-sans)">Copy</button></h3>';

    if (pathParams.length > 0 || queryParams.length > 0) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px">';
      pathParams.forEach(function(p) {
        var def = curlPathDefaults[p.name] || '';
        html += '<label style="font-size:11px;color:var(--text-muted);display:flex;flex-direction:column;gap:2px">';
        html += '<span>' + esc(p.name) + ' <span style="color:var(--orange)">path</span></span>';
        html += '<input type="text" class="curl-input" data-param="' + esc(p.name) + '" data-in="path" value="' + esc(def) + '" style="padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--font-mono);font-size:12px;width:180px">';
        html += '</label>';
      });
      queryParams.forEach(function(p) {
        html += '<label style="font-size:11px;color:var(--text-muted);display:flex;flex-direction:column;gap:2px">';
        html += '<span>' + esc(p.name) + (p.type === 'array' ? ' <span style="color:var(--text-dim)">csv</span>' : '') + '</span>';
        html += '<input type="text" class="curl-input" data-param="' + esc(p.name) + '" data-in="query" placeholder="' + esc((p.description || '').slice(0, 50)) + '" style="padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--font-mono);font-size:12px;width:180px">';
        html += '</label>';
      });
      html += '</div>';
    }

    var initCmd = buildCurlFromInputs(ep, spec, null);
    html += '<pre class="code-block" id="curl-output">' + esc(initCmd) + '</pre>';
    html += '</div>';

    // Store current endpoint data for live updates (set after innerHTML)
    _pendingCurlEp = { method: ep.method, path: ep.path, spec: spec, content_negotiation: ep.content_negotiation || null, request_body: !!(ep.request_body && (ep.method === 'POST' || ep.method === 'PUT')) };
  }

  // Summary / Description
  if (ep.summary) {
    html += '<div class="detail-section"><h3>Summary</h3><div class="prose">' + esc(ep.summary) + '</div></div>';
  }
  if (ep.description && ep.description !== ep.summary) {
    html += '<div class="detail-section"><h3>Description</h3><div class="prose">' + esc(ep.description) + '</div></div>';
  }

  // Parameters
  if (ep.parameters && ep.parameters.length) {
    html += '<div class="detail-section"><h3>Parameters (' + ep.parameters.length + ')</h3>';
    html += '<table class="data-table"><thead><tr><th>Name</th><th>In</th><th>Type</th><th>Required</th><th>Description</th></tr></thead><tbody>';
    ep.parameters.forEach(p => {
      html += '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.in || '') + '</td><td>' +
        esc(p.schema && p.schema.type ? p.schema.type : (p.type || '')) + '</td><td>' +
        (p.required ? '✓' : '') + '</td><td style="font-family:var(--font-sans);font-size:12px;color:var(--text-muted)">' +
        esc(p.description || '') + '</td></tr>';
    });
    html += '</tbody></table></div>';
  }

  // Request body
  if (ep.request_body) {
    html += '<div class="detail-section"><h3>Request Body</h3>';
    html += '<div class="code-block">' + esc(JSON.stringify(ep.request_body, null, 2)) + '</div>';
    html += '</div>';
  }

  // Responses
  if (ep.responses) {
    html += '<div class="detail-section"><h3>Responses</h3>';
    for (const [code, resp] of Object.entries(ep.responses)) {
      html += '<div style="margin-bottom:8px"><span class="badge ' +
        (code.startsWith('2') ? 'badge-get' : code.startsWith('4') ? 'badge-delete' : 'badge-put') +
        '">' + esc(code) + '</span> ';
      if (typeof resp === 'string') {
        html += '<span style="color:var(--text-muted);font-size:12px">' + esc(resp) + '</span>';
      } else {
        html += '<span style="color:var(--text-muted);font-size:12px">' + esc(resp.description || '') + '</span>';
        if (resp.content || resp.schema) {
          html += '<div class="code-block" style="margin-top:4px">' + esc(JSON.stringify(resp.content || resp.schema, null, 2)) + '</div>';
        }
      }
      html += '</div>';
    }
    html += '</div>';
  }

  // Result (JSON-RPC)
  if (ep.result) {
    html += '<div class="detail-section"><h3>Result</h3>';
    html += '<div class="code-block">' + esc(JSON.stringify(ep.result, null, 2)) + '</div>';
    html += '</div>';
  }

  // Errors
  if (ep.errors && ep.errors.length) {
    html += '<div class="detail-section"><h3>Errors</h3>';
    html += '<table class="data-table"><thead><tr><th>Code</th><th>Message</th></tr></thead><tbody>';
    ep.errors.forEach(e => {
      html += '<tr><td>' + esc(String(e.code || '')) + '</td><td style="font-family:var(--font-sans)">' + esc(e.message || JSON.stringify(e)) + '</td></tr>';
    });
    html += '</tbody></table></div>';
  }

  // Fork versioning
  if (ep.fork_versioned || ep.fork_variants) {
    html += '<div class="detail-section"><h3>Fork Versioning</h3>';
    if (ep.fork_versioned) html += '<div style="font-size:12px;color:var(--text-muted)">Fork versioned: ' + esc(String(ep.fork_versioned)) + '</div>';
    if (ep.fork_variants) {
      html += '<div class="code-block" style="margin-top:4px">' + esc(JSON.stringify(ep.fork_variants, null, 2)) + '</div>';
    }
    html += '</div>';
  }

  // External docs
  if (ep.external_docs) {
    html += '<div class="detail-section"><h3>External Docs</h3>';
    if (typeof ep.external_docs === 'string') {
      html += '<a href="' + esc(ep.external_docs) + '" target="_blank">' + esc(ep.external_docs) + '</a>';
    } else {
      html += '<a href="' + esc(ep.external_docs.url || '') + '" target="_blank">' + esc(ep.external_docs.description || ep.external_docs.url || '') + '</a>';
    }
    html += '</div>';
  }

  html += '</div>';
  return html;
}

export function copyCurl(btn) {
  const pre = btn.closest('.detail-section').querySelector('pre');
  const text = pre.textContent;
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    btn.style.color = 'var(--green)';
    setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1500);
  });
}
