// Canonical fork display order (CL and EL unified). Used for sorting fork tabs.
export const CL_FORK_ORDER = ['phase0','altair','bellatrix','capella','deneb','electra','fulu','gloas','heze'];
export const EL_FORK_ORDER = ['frontier','homestead','byzantium','constantinople','istanbul','berlin','london','paris','shanghai','cancun','prague','osaka','amsterdam'];
export const ALL_FORK_ORDER = [...CL_FORK_ORDER, ...EL_FORK_ORDER];

// Forks to hide from the UI (internal names, not real network forks)
export const HIDDEN_FORKS = new Set([
  'dao_fork','tangerine_whistle','spurious_dragon','muir_glacier',
  'arrow_glacier','gray_glacier','bpo1','bpo2','bpo3','bpo4','bpo5','unversioned'
]);

export const SPEC_COLORS = {
  'consensus-specs': 'spec-consensus-specs',
  'beacon-apis': 'spec-beacon-apis',
  'execution-specs': 'spec-execution-specs',
  'execution-apis': 'spec-execution-apis',
  'builder-specs': 'spec-builder-specs',
  'relay-specs': 'spec-relay-specs',
  'remote-signing-api': 'spec-remote-signing-api'
};

export const KIND_BADGES = {
  'class': 'badge-class',
  'def': 'badge-def',
  'function': 'badge-function',
  'dataclass': 'badge-dataclass',
  'enum': 'badge-enum',
  'constant': 'badge-constant',
  'alias': 'badge-alias'
};

export const METHOD_BADGES = {
  'GET': 'badge-get',
  'POST': 'badge-post',
  'PUT': 'badge-put',
  'DELETE': 'badge-delete'
};
