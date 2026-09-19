// Lets the user tap/highlight a keyword on any page and jump straight into a
// PubMed search for it, without opening the popup first.

let btn = null;

function removeButton() {
  if (btn) {
    btn.remove();
    btn = null;
  }
}

function showButtonNear(rect, text) {
  removeButton();
  btn = document.createElement('div');
  btn.id = 'pube-selection-btn';
  btn.textContent = `🔍 Search PubMed for "${truncate(text, 28)}"`;
  btn.style.top = `${window.scrollY + rect.bottom + 8}px`;
  btn.style.left = `${window.scrollX + Math.max(rect.left, 8)}px`;

  btn.addEventListener('mousedown', (e) => e.preventDefault()); // don't clear the selection
  btn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'openSearchTab', query: text });
    removeButton();
  });

  document.documentElement.appendChild(btn);
}

function truncate(str, max) {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

document.addEventListener('mouseup', (e) => {
  if (btn && btn.contains(e.target)) return;
  const selection = window.getSelection();
  const text = selection ? selection.toString().trim() : '';

  if (!text || text.length > 120) {
    removeButton();
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    removeButton();
    return;
  }
  showButtonNear(rect, text);
});

document.addEventListener('mousedown', (e) => {
  if (btn && !btn.contains(e.target)) removeButton();
});
document.addEventListener('scroll', removeButton, true);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') removeButton();
});
