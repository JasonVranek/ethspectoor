import { highlightPython } from './utils.js';

// Line-level diff using LCS algorithm for side-by-side code comparison
export function computeLineDiff(oldLines, newLines) {
  const m = oldLines.length, n = newLines.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i-1].trim() === newLines[j-1].trim()) dp[i][j] = dp[i-1][j-1] + 1;
      else dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
    }
  }
  const matches = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (oldLines[i-1].trim() === newLines[j-1].trim()) {
      matches.unshift([i-1, j-1]); i--; j--;
    } else if (dp[i-1][j] >= dp[i][j-1]) { i--; }
    else { j--; }
  }
  const ops = [];
  let oi = 0, ni = 0;
  function processGap(oldEnd, newEnd) {
    const og = [], ng = [];
    while (oi < oldEnd) og.push(oi++);
    while (ni < newEnd) ng.push(ni++);
    const paired = Math.min(og.length, ng.length);
    for (let k = 0; k < paired; k++) ops.push({ type: 'change', oldIdx: og[k], newIdx: ng[k] });
    for (let k = paired; k < og.length; k++) ops.push({ type: 'remove', oldIdx: og[k] });
    for (let k = paired; k < ng.length; k++) ops.push({ type: 'add', newIdx: ng[k] });
  }
  for (const [mi, mj] of matches) {
    processGap(mi, mj);
    ops.push({ type: 'equal', oldIdx: mi, newIdx: mj });
    oi = mi + 1; ni = mj + 1;
  }
  processGap(m, n);
  return ops;
}

// Render side-by-side code with inline diff highlighting
export function renderDiffCodeBlocks(oldCode, newCode, oldLabel, newLabel) {
  const oldLines = oldCode.split('\n');
  const newLines = newCode.split('\n');
  const ops = computeLineDiff(oldLines, newLines);

  let leftHtml = '', rightHtml = '';
  ops.forEach(op => {
    if (op.type === 'equal') {
      const hl = highlightPython(oldLines[op.oldIdx]);
      leftHtml += '<span class="diff-line-unchanged">' + hl + '\n</span>';
      rightHtml += '<span class="diff-line-unchanged">' + highlightPython(newLines[op.newIdx]) + '\n</span>';
    } else if (op.type === 'remove') {
      leftHtml += '<span class="diff-line-removed">' + highlightPython(oldLines[op.oldIdx]) + '\n</span>';
      rightHtml += '<span class="diff-line-unchanged" style="opacity:0.3">\n</span>';
    } else if (op.type === 'add') {
      leftHtml += '<span class="diff-line-unchanged" style="opacity:0.3">\n</span>';
      rightHtml += '<span class="diff-line-added">' + highlightPython(newLines[op.newIdx]) + '\n</span>';
    } else if (op.type === 'change') {
      leftHtml += '<span class="diff-line-removed">' + highlightPython(oldLines[op.oldIdx]) + '\n</span>';
      rightHtml += '<span class="diff-line-added">' + highlightPython(newLines[op.newIdx]) + '\n</span>';
    }
  });

  let html = '<div style="display:flex;gap:8px;flex-wrap:wrap">';
  html += '<div style="flex:1;min-width:280px"><div style="font-size:10px;color:var(--text-dim);margin-bottom:4px">' + oldLabel + '</div>';
  html += '<pre class="code-block diff-code-block" style="max-height:400px;font-size:11px">' + leftHtml + '</pre></div>';
  html += '<div style="flex:1;min-width:280px"><div style="font-size:10px;color:var(--green);margin-bottom:4px">' + newLabel + '</div>';
  html += '<pre class="code-block diff-code-block" style="max-height:400px;font-size:11px">' + rightHtml + '</pre></div>';
  html += '</div>';
  return html;
}
