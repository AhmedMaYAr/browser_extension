import { buildExtractiveReport } from './lib/extractive.js';

const PAGE_SIZE = 10;

const els = {
  form: document.getElementById('searchForm'),
  input: document.getElementById('searchInput'),
  sort: document.getElementById('sortSelect'),
  status: document.getElementById('status'),
  results: document.getElementById('results'),
  pager: document.getElementById('pager'),
  pageInfo: document.getElementById('pageInfo'),
  prevPage: document.getElementById('prevPage'),
  nextPage: document.getElementById('nextPage'),
  openOptions: document.getElementById('openOptions'),
  template: document.getElementById('resultTemplate'),
};

const state = {
  query: '',
  sort: 'relevance',
  page: 0,
  totalCount: 0,
};

function isTabMode() {
  return new URLSearchParams(location.search).get('tab') === '1';
}
if (isTabMode()) document.body.classList.add('tab-mode');

function send(message) {
  return chrome.runtime.sendMessage(message).then((res) => {
    if (res?.error) throw new Error(res.error);
    return res;
  });
}

function setStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.classList.toggle('error', isError);
}

els.openOptions.addEventListener('click', () => chrome.runtime.openOptionsPage());

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const query = els.input.value.trim();
  if (!query) return;
  state.query = query;
  state.page = 0;
  runSearch();
});

els.sort.addEventListener('change', () => {
  state.sort = els.sort.value;
  if (state.query) {
    state.page = 0;
    runSearch();
  }
});

els.prevPage.addEventListener('click', () => {
  if (state.page > 0) {
    state.page -= 1;
    runSearch();
  }
});
els.nextPage.addEventListener('click', () => {
  if ((state.page + 1) * PAGE_SIZE < state.totalCount) {
    state.page += 1;
    runSearch();
  }
});

async function runSearch() {
  setStatus('Searching PubMed…');
  els.results.innerHTML = '';
  els.pager.hidden = true;
  try {
    const res = await send({
      type: 'search',
      query: state.query,
      sort: state.sort,
      retmax: PAGE_SIZE,
      retstart: state.page * PAGE_SIZE,
    });
    state.totalCount = res.count;
    renderResults(res.results, res.count);
  } catch (err) {
    setStatus(`Search failed: ${err.message}`, true);
  }
}

function renderResults(results, count) {
  if (results.length === 0) {
    setStatus('');
    els.results.innerHTML = `<div class="empty-state">No PubMed results for "${escapeHtml(state.query)}".</div>`;
    return;
  }

  setStatus(`${count.toLocaleString()} result${count === 1 ? '' : 's'} found`);

  const frag = document.createDocumentFragment();
  for (const article of results) {
    frag.appendChild(buildCard(article));
  }
  els.results.appendChild(frag);

  els.pager.hidden = count <= PAGE_SIZE;
  const from = state.page * PAGE_SIZE + 1;
  const to = Math.min(from + PAGE_SIZE - 1, count);
  els.pageInfo.textContent = `${from}–${to} of ${count.toLocaleString()}`;
  els.prevPage.disabled = state.page === 0;
  els.nextPage.disabled = to >= count;
}

function buildCard(article) {
  const node = els.template.content.cloneNode(true);
  const card = node.querySelector('.card');
  const title = node.querySelector('.card-title');
  const meta = node.querySelector('.card-meta');
  const expandBtn = node.querySelector('.expand-btn');
  const body = node.querySelector('.card-body');
  const link = node.querySelector('.pubmed-link');

  title.textContent = article.title;
  const authorStr = formatAuthors(article.authors);
  meta.textContent = [authorStr, article.journal, article.pubdate].filter(Boolean).join(' · ');
  link.href = `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`;

  let loaded = false;
  expandBtn.addEventListener('click', () => {
    const expanded = expandBtn.getAttribute('aria-expanded') === 'true';
    expandBtn.setAttribute('aria-expanded', String(!expanded));
    expandBtn.textContent = expanded ? 'Details ▾' : 'Hide ▴';
    body.hidden = expanded;
    if (!expanded && !loaded) {
      loaded = true;
      loadDetails(card, article);
    }
  });

  card.dataset.pmid = article.pmid;
  return node;
}

function formatAuthors(authors) {
  if (!authors || authors.length === 0) return '';
  if (authors.length <= 3) return authors.join(', ');
  return `${authors.slice(0, 3).join(', ')}, et al.`;
}

async function loadDetails(card, article) {
  const abstractEl = card.querySelector('.abstract-text');
  const reportContentEl = card.querySelector('.report-content');
  const aiBtn = card.querySelector('.ai-report-btn');
  const relatedList = card.querySelector('.related-list');

  const { anthropicApiKey } = await chrome.storage.local.get('anthropicApiKey');

  let abstract = '';
  try {
    const res = await send({ type: 'getAbstract', pmid: article.pmid });
    abstract = res.abstract;
    abstractEl.textContent = abstract || 'No abstract available for this article.';
    abstractEl.classList.remove('loading');
  } catch (err) {
    abstractEl.textContent = `Couldn't load abstract: ${err.message}`;
    abstractEl.classList.remove('loading');
  }

  if (abstract) {
    renderReport(reportContentEl, { report: buildExtractiveReport(abstract) });
    if (anthropicApiKey) {
      aiBtn.hidden = false;
      aiBtn.addEventListener('click', async () => {
        aiBtn.disabled = true;
        aiBtn.textContent = 'Generating…';
        renderReport(reportContentEl, await safeAiReport(article, abstract));
        aiBtn.disabled = false;
        aiBtn.textContent = '✨ Regenerate AI report';
      });
    }
  } else {
    reportContentEl.textContent = 'No abstract to summarize.';
  }

  try {
    const { related } = await send({ type: 'getRelated', pmid: article.pmid });
    renderRelated(relatedList, related);
  } catch (err) {
    relatedList.innerHTML = `<li>Couldn't load related articles: ${escapeHtml(err.message)}</li>`;
  }
}

async function safeAiReport(article, abstract) {
  try {
    return await send({ type: 'getReport', useAi: true, pmid: article.pmid, title: article.title, abstract });
  } catch (err) {
    return { report: buildExtractiveReport(abstract), warning: err.message };
  }
}

function renderReport(container, { report, warning }) {
  container.innerHTML = '';
  if (warning) {
    const w = document.createElement('div');
    w.className = 'report-warning';
    w.textContent = `⚠ ${warning} — showing quick summary instead.`;
    container.appendChild(w);
  }
  if (!report) {
    container.appendChild(document.createTextNode('Not enough text to summarize.'));
    return;
  }

  const lines =
    report.source === 'ai'
      ? [
          ['Background', report.background],
          ['Key finding', report.finding],
          ['Relevance', report.relevance],
        ]
      : [
          ['Background', report.background],
          ['Key finding', report.finding],
          ['Conclusion', report.conclusion],
        ];

  for (const [label, text] of lines) {
    if (!text) continue;
    const p = document.createElement('p');
    p.className = 'report-line';
    p.innerHTML = `<strong>${label}:</strong> ${escapeHtml(text)}`;
    container.appendChild(p);
  }

  const src = document.createElement('div');
  src.className = 'report-source';
  src.textContent =
    report.source === 'ai' ? 'Generated by Claude from the abstract.' : 'Quick summary extracted from the abstract.';
  container.appendChild(src);
}

function renderRelated(listEl, related) {
  listEl.classList.remove('loading-list');
  listEl.innerHTML = '';
  if (!related || related.length === 0) {
    listEl.innerHTML = '<li>No closely related articles found.</li>';
    return;
  }
  for (const item of related) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `https://pubmed.ncbi.nlm.nih.gov/${item.pmid}/`;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = item.title;
    li.appendChild(a);
    const meta = document.createElement('div');
    meta.className = 'related-meta';
    meta.textContent = [item.journal, item.pubdate].filter(Boolean).join(' · ');
    li.appendChild(meta);
    listEl.appendChild(li);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// If we were opened from the context menu / text-selection button, run that search immediately.
(async function init() {
  const { pendingQuery } = await chrome.storage.session.get('pendingQuery');
  if (pendingQuery) {
    await chrome.storage.session.remove('pendingQuery');
    els.input.value = pendingQuery;
    state.query = pendingQuery;
    runSearch();
  }
})();
