let skillMdRaw = null;

async function fetchSkillMd() {
  if (skillMdRaw) return skillMdRaw;
  const resp = await fetch('SKILL.md');
  if (!resp.ok) throw new Error('Failed to load SKILL.md');
  skillMdRaw = await resp.text();
  return skillMdRaw;
}

export function renderMarkdown(md) {
  let html = md;
  html = html.replace(/```([\s\S]*?)```/g, function(m, code) {
    return '<pre><code>' + code.replace(/^\w*\n/, '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</code></pre>';
  });
  html = html.replace(/(\|.+\|\n)(\|[-| :]+\|\n)((?:\|.+\|\n?)+)/g, function(m, header, sep, body) {
    var t = '<table><thead><tr>';
    header.trim().split('|').filter(Boolean).forEach(function(c) { t += '<th>' + c.trim() + '</th>'; });
    t += '</tr></thead><tbody>';
    body.trim().split('\n').forEach(function(row) {
      t += '<tr>';
      row.split('|').filter(Boolean).forEach(function(c) { t += '<td>' + c.trim() + '</td>'; });
      t += '</tr>';
    });
    t += '</tbody></table>';
    return t;
  });
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^---+$/gm, '<hr>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  html = html.replace(/^(?!<[hupltao]|$)(.+)$/gm, '<p>$1</p>');
  html = html.replace(/\n{2,}/g, '\n');
  return html;
}

export async function viewSkill() {
  try {
    const md = await fetchSkillMd();
    document.getElementById('skill-modal-body').innerHTML = renderMarkdown(md);
    document.getElementById('skill-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
  } catch (e) {
    alert('Could not load SKILL.md: ' + e.message);
  }
}

export function closeSkillModal() {
  document.getElementById('skill-modal').classList.remove('open');
  document.body.style.overflow = '';
}

export async function copySkill(btn) {
  try {
    const md = await fetchSkillMd();
    await navigator.clipboard.writeText(md);
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(function() { btn.textContent = orig; btn.classList.remove('copied'); }, 1500);
  } catch (e) {
    alert('Copy failed: ' + e.message);
  }
}
