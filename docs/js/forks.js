import { ALL_FORK_ORDER, HIDDEN_FORKS } from './constants.js';
import { state } from './state.js';

// Sort fork names by canonical order (no filtering) -- for internal carry-forward
export function sortForksRaw(forkNames) {
  return [...forkNames].sort((a, b) => {
    const ai = ALL_FORK_ORDER.indexOf(a);
    const bi = ALL_FORK_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return 1;
    return ai - bi;
  });
}

// Sort fork names by canonical order, filter hidden -- for display
export function sortForks(forkNames) {
  return sortForksRaw(forkNames).filter(f => !HIDDEN_FORKS.has(f));
}

// Resolve code for a specific fork, walking backward for carry-forward
export function getCodeForFork(item, fork) {
  // PR fork resolution: if fork looks like 'pr-NNNN', check overlays
  if (typeof fork === 'string' && fork.startsWith('pr-')) {
    const prNum = fork.slice(3);
    const overlays = (state.catalog && state.catalog.pr_overlays) || {};
    for (const spec in overlays) {
      const ov = overlays[spec][prNum];
      if (ov && ov.items_changed && ov.items_changed[item.name] && ov.items_changed[item.name].code) {
        return ov.items_changed[item.name].code;
      }
    }
    return '';
  }
  // Walk backward from this fork to find the last fork with code (carry-forward)
  // Use sortForksRaw so we can reach code in hidden forks (e.g. spurious_dragon)
  const forks = sortForksRaw(Object.keys(item.forks));
  const idx = forks.indexOf(fork);
  for (let i = idx; i >= 0; i--) {
    if (item.forks[forks[i]] && item.forks[forks[i]].code) return item.forks[forks[i]].code;
  }
  return '';
}
