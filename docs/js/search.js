import { state } from './state.js';
import { esc } from './utils.js';

// Subsequence fuzzy scoring with memoization.
// Returns a numeric score (higher = better match) or null (no match).
export function fuzzyScore(target, query) {
  if (!query) return 0;
  const tLow = target.toLowerCase();
  const qLow = query.toLowerCase();
  if (tLow.includes(qLow)) {
    const pos = tLow.indexOf(qLow);
    return 10000 - pos * 10 - tLow.length;
  }
  const memo = {};
  function solve(ti, qi, consecutive) {
    if (qi === qLow.length) return 0;
    if (ti >= tLow.length) return null;
    const key = ti + ',' + qi + ',' + consecutive;
    if (key in memo) return memo[key];
    let best = null;
    for (let i = ti; i < tLow.length; i++) {
      if (tLow[i] !== qLow[qi]) continue;
      let s = 1;
      const isConsec = (i === ti && consecutive > 0);
      const newConsec = isConsec ? consecutive + 1 : (qi === 0 ? 1 : 0);
      if (isConsec) s += newConsec * 6;
      if (i === 0 || tLow[i - 1] === '_' || tLow[i - 1] === '-' ||
          (target[i] >= 'A' && target[i] <= 'Z' && target[i-1] >= 'a' && target[i-1] <= 'z'))
        s += 5;
      s += Math.max(0, 10 - i);
      const rest = solve(i + 1, qi + 1, newConsec);
      if (rest === null) continue;
      const total = s + rest - (i - ti) * 0.5;
      if (best === null || total > best) best = total;
    }
    memo[key] = best;
    return best;
  }
  const base = solve(0, 0, 0);
  if (base === null) return null;
  return base - tLow.length * 0.6;
}

// Wrap matched chars in <mark> for visual feedback
export function fuzzyHighlight(text, query) {
  if (!query) return esc(text);
  const lower = text.toLowerCase();
  const qLow = query.toLowerCase();
  let qi = 0, out = '';
  for (let i = 0; i < text.length; i++) {
    if (qi < qLow.length && lower[i] === qLow[qi]) {
      out += '<mark style="background:rgba(88,166,255,0.25);color:inherit;padding:0;border-radius:1px">' + esc(text[i]) + '</mark>';
      qi++;
    } else {
      out += esc(text[i]);
    }
  }
  return out;
}

export function filterDiffItems(query) {
  document.querySelectorAll('.diff-group').forEach(group => {
    const items = group.querySelectorAll('.diff-item');
    let anyVisible = false;
    items.forEach(item => {
      const preview = item.nextElementSibling;
      const name = item.textContent.trim().replace(/^[+~]\s*/, '');
      const match = !query || fuzzyScore(name, query) !== null;
      item.style.display = match ? '' : 'none';
      if (preview && preview.classList.contains('diff-item-preview')) {
        if (!match) preview.style.display = 'none';
      }
      if (match) anyVisible = true;
    });
    group.style.display = anyVisible ? '' : 'none';
  });
}

