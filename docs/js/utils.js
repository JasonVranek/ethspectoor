import { KIND_BADGES, SPEC_COLORS, METHOD_BADGES } from './constants.js';
import { state } from './state.js';

export function safeId(name) { return name.replace(/[^a-zA-Z0-9]/g, '_'); }

export function codePreview(code, extraStyle) {
  return '<pre class="code-block" style="max-height:400px;font-size:11px' + (extraStyle || '') + '">' + highlightPython(code) + '</pre>';
}

export function esc(s) {
  if (!s) return '';
  // Works in both browser and non-browser environments
  if (typeof document !== 'undefined') {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function kindBadge(kind) {
  const cls = KIND_BADGES[kind] || 'badge-class';
  return '<span class="badge ' + cls + '">' + esc(kind) + '</span>';
}

export function specBadge(spec) {
  const cls = SPEC_COLORS[spec] || '';
  return '<span class="badge-spec ' + cls + '">' + esc(spec) + '</span>';
}

export function methodBadge(method) {
  const cls = METHOD_BADGES[method] || 'badge-get';
  return '<span class="badge ' + cls + '">' + esc(method) + '</span>';
}

export function forkBadge(fork, cls) {
  return '<span class="badge-fork ' + (cls||'') + '">' + esc(fork) + '</span>';
}

export function resolveTypeSpec(typeName) {
  const catalog = state.catalog;
  const item = catalog && catalog.items && catalog.items[typeName];
  return item ? item.spec : null;
}

export function typeLink(typeName, contextSpec) {
  if (!typeName) return '';
  const clean = typeName.replace(/^(List|Optional|Sequence|Vector|ByteList|ByteVector|Bitlist|Bitvector)\[/, '').replace(/\]$/, '').replace(/,.*/, '').trim();
  const spec = resolveTypeSpec(clean);
  if (spec) {
    return '<a class="type-link" href="#/type/' + encodeURIComponent(clean) + '">' + esc(typeName) + '</a>';
  }
  return '<span style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted)">' + esc(typeName) + '</span>';
}

export function githubBtn(url, id) {
  if (!url) return '';
  return '<a class="btn" ' + (id ? 'id="' + id + '" ' : '') + 'href="' + esc(url) + '" target="_blank" rel="noopener">↗ View Source</a>';
}

// Python syntax highlighting with type linkification
export function highlightPython(code) {
  if (!code) return '';
  const KW = /\b(class|def|return|if|else|elif|for|while|in|not|and|or|is|assert|raise|import|from|as|with|yield|pass|break|continue|try|except|finally|True|False|None|lambda)\b/g;
  const BUILTIN = /\b(uint64|uint8|uint16|uint32|uint128|uint256|Bytes|Bytes1|Bytes4|Bytes8|Bytes20|Bytes32|Bytes48|Bytes96|Bytes256|byte|bool|int|str|list|dict|tuple|set|List|Vector|Bitlist|Bitvector|ByteList|ByteVector|Container|StableContainer|Profile|Union|GeneralizedIndex|Optional|range|len|max|min|sum|enumerate|zip|map|filter|sorted|reversed|abs|round|divmod|pow|hex|bin|oct|chr|ord|repr|hash|id|isinstance|hasattr|getattr|setattr|delattr|vars|locals|globals|type|property|classmethod|staticmethod|super|print|input|open|all|any|callable|compile|eval|exec|format|help|dir|slice|iter|next|memoryview|bytearray|bytes|frozenset|object|complex|float)\b/g;
  const catalog = state.catalog;

  // Triple-quoted string handling (works across lines)
  let inDocstring = false;
  let docstringQuote = '';

  return code.split('\n').map(line => {
    let escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // If we're inside a triple-quoted string, check if it ends on this line
    if (inDocstring) {
      const endIdx = escaped.indexOf(docstringQuote);
      if (endIdx !== -1) {
        const before = escaped.slice(0, endIdx);
        const quote = escaped.slice(endIdx, endIdx + 3);
        const after = escaped.slice(endIdx + 3);
        inDocstring = false;
        return '<span class="syn-string">' + before + quote + '</span>' + processLine(after, true);
      }
      return '<span class="syn-string">' + escaped + '</span>';
    }

    // Check if this line starts a triple-quoted string
    const tripleDouble = escaped.indexOf('\"\"\"');
    const tripleSingle = escaped.indexOf("'''");
    let tripleIdx = -1, tripleQuote = '';
    if (tripleDouble !== -1 && (tripleSingle === -1 || tripleDouble < tripleSingle)) {
      tripleIdx = tripleDouble;
      tripleQuote = '\"\"\"';
    } else if (tripleSingle !== -1) {
      tripleIdx = tripleSingle;
      tripleQuote = "'''";
    }

    if (tripleIdx !== -1) {
      const afterQuote = escaped.slice(tripleIdx + 3);
      const endIdx = afterQuote.indexOf(tripleQuote);
      if (endIdx !== -1) {
        // Triple-quoted string starts and ends on the same line
        const before = escaped.slice(0, tripleIdx);
        const content = afterQuote.slice(0, endIdx);
        const closeQuote = tripleQuote;
        const rest = afterQuote.slice(endIdx + 3);
        return processLine(before, true) +
          '<span class="syn-string">' + tripleQuote + content + closeQuote + '</span>' +
          processLine(rest, true);
      } else {
        // Triple-quoted string starts but doesn't end
        inDocstring = true;
        docstringQuote = tripleQuote;
        const before = escaped.slice(0, tripleIdx);
        return processLine(before, true) + '<span class="syn-string">' + tripleQuote + afterQuote + '</span>';
      }
    }

    return processLine(escaped, false);

    function processLine(text, skipComment) {
      let codePart, commentPart;
      if (!skipComment) {
        let inStr = null, commentIdx = -1;
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          if (inStr) { if (ch === '\\') { i++; continue; } if (ch === inStr) inStr = null; }
          else { if (ch === '"' || ch === "'") inStr = ch; else if (ch === '#') { commentIdx = i; break; } }
        }
        if (commentIdx >= 0) {
          codePart = text.slice(0, commentIdx);
          const rawComment = text.slice(commentIdx);
          commentPart = '<span class="syn-comment">' +
            rawComment
              .replace(/(\[New in [^\]]+\])/g, '<span class="syn-new-marker">$1</span>')
              .replace(/(\[Modified in [^\]]+\])/g, '<span class="syn-mod-marker">$1</span>') +
            '</span>';
        } else {
          codePart = text;
          commentPart = '';
        }
      } else {
        codePart = text;
        commentPart = '';
      }

      function linkifyCode(seg) {
        let result = seg.replace(KW, '<span class="syn-keyword">$1</span>');
        result = result.replace(BUILTIN, '<span class="syn-builtin">$1</span>');
        if (catalog) {
          const parts = result.split(/(<span[^>]*>.*?<\/span>|<a[^>]*>.*?<\/a>)/g);
          result = parts.map(part => {
            if (part.startsWith('<span') || part.startsWith('<a')) return part;
            return part.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g, (match) => {
              const it = catalog.items[match];
              if (it) {
                const kind = it.kind;
                const cls = (kind === 'class' || kind === 'dataclass') ? 'syn-type' : 'syn-func';
                return '<a class="type-link ' + cls + '" href="#/type/' + encodeURIComponent(match) + '">' + match + '</a>';
              }
              const s = resolveTypeSpec(match);
              if (s) return '<a class="type-link syn-type" href="#/type/' + encodeURIComponent(match) + '">' + match + '</a>';
              return match;
            });
          }).join('');
        }
        return result;
      }

      const strRe = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
      let processed = '', lastIdx = 0, m;
      while ((m = strRe.exec(codePart)) !== null) {
        processed += linkifyCode(codePart.slice(lastIdx, m.index));
        processed += '<span class="syn-string">' + m[0] + '</span>';
        lastIdx = m.index + m[0].length;
      }
      processed += linkifyCode(codePart.slice(lastIdx));
      processed = processed.replace(/^(\s*)(@\w+)/, '$1<span class="syn-decorator">$2</span>');
      return processed + commentPart;
    }
  }).join('\n');
}
