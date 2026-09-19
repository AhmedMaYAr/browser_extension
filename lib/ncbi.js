// Thin client for the NCBI E-utilities (esearch / esummary / efetch / elink).
// Runs inside the background service worker, so it must not touch the DOM
// (no DOMParser) — abstract text is pulled out of the XML with regexes instead.

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const TOOL = 'pubmed-article-explorer';

let lastRequestAt = 0;

async function getSettings() {
  const { ncbiApiKey = '', ncbiEmail = '' } = await chrome.storage.local.get([
    'ncbiApiKey',
    'ncbiEmail',
  ]);
  return { ncbiApiKey, ncbiEmail };
}

// NCBI asks for <=3 req/sec without a key, <=10 req/sec with one.
// A single in-flight request at a time keeps this simple and well under the limit.
async function throttle() {
  const { ncbiApiKey } = await getSettings();
  const minGapMs = ncbiApiKey ? 110 : 350;
  const wait = lastRequestAt + minGapMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

async function eutilsFetch(path, params) {
  const { ncbiApiKey, ncbiEmail } = await getSettings();
  const url = new URL(`${EUTILS}/${path}`);
  url.searchParams.set('tool', TOOL);
  if (ncbiEmail) url.searchParams.set('email', ncbiEmail);
  if (ncbiApiKey) url.searchParams.set('api_key', ncbiApiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  await throttle();
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`NCBI request failed (${res.status}): ${path}`);
  }
  return res;
}

function decodeEntities(str) {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&');
}

function stripTags(str) {
  return str.replace(/<[^>]+>/g, '');
}

/** Search PubMed for a keyword/phrase. Returns the ordered list of PMIDs plus a total count. */
export async function searchArticles(term, { retmax = 20, sort = 'relevance', retstart = 0 } = {}) {
  const res = await eutilsFetch('esearch.fcgi', {
    db: 'pubmed',
    term,
    retmode: 'json',
    retmax: String(retmax),
    retstart: String(retstart),
    sort: sort === 'date' ? 'pub_date' : 'relevance',
  });
  const data = await res.json();
  const idlist = data?.esearchresult?.idlist ?? [];
  const count = Number(data?.esearchresult?.count ?? idlist.length);
  return { idlist, count };
}

/** Fetch title/authors/journal/date metadata for a batch of PMIDs in one call. */
export async function summarizeArticles(pmids) {
  if (pmids.length === 0) return [];
  const res = await eutilsFetch('esummary.fcgi', {
    db: 'pubmed',
    id: pmids.join(','),
    retmode: 'json',
  });
  const data = await res.json();
  const uids = data?.result?.uids ?? [];
  return uids.map((uid) => {
    const item = data.result[uid] ?? {};
    return {
      pmid: uid,
      title: item.title ? stripTags(item.title) : '(untitled)',
      authors: (item.authors ?? []).map((a) => a.name).filter(Boolean),
      journal: item.fulljournalname || item.source || '',
      pubdate: item.pubdate || item.sortpubdate || '',
      doi: (item.elocationid || '').replace(/^doi:\s*/i, ''),
    };
  });
}

/** Pull the abstract text out of PubMed's XML for a single article. */
export async function fetchAbstract(pmid) {
  const res = await eutilsFetch('efetch.fcgi', {
    db: 'pubmed',
    id: pmid,
    rettype: 'abstract',
    retmode: 'xml',
  });
  const xml = await res.text();

  const sectionRe = /<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g;
  const sections = [];
  let match;
  while ((match = sectionRe.exec(xml)) !== null) {
    const attrs = match[1];
    const text = decodeEntities(stripTags(match[2])).trim();
    const labelMatch = attrs.match(/Label="([^"]*)"/);
    sections.push(labelMatch && labelMatch[1] ? `${labelMatch[1]}: ${text}` : text);
  }
  if (sections.length === 0) return '';
  return sections.join('\n\n');
}

/** Articles PubMed itself considers most similar to a given PMID, most-similar first. */
export async function fetchRelated(pmid, { limit = 6 } = {}) {
  const res = await eutilsFetch('elink.fcgi', {
    dbfrom: 'pubmed',
    db: 'pubmed',
    id: pmid,
    cmd: 'neighbor_score',
    retmode: 'json',
  });
  const data = await res.json();
  const linksetdbs = data?.linksets?.[0]?.linksetdbs ?? [];
  const scored = linksetdbs.find((l) => l.linkname === 'pubmed_pubmed')?.links ?? [];
  const top = scored.filter((l) => String(l.id) !== String(pmid)).slice(0, limit);
  if (top.length === 0) return [];

  const summaries = await summarizeArticles(top.map((l) => l.id));
  const scoreById = new Map(top.map((l) => [String(l.id), Number(l.score)]));
  return summaries
    .map((s) => ({ ...s, score: scoreById.get(String(s.pmid)) ?? 0 }))
    .sort((a, b) => b.score - a.score);
}
