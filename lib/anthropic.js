// Optional AI-enhanced report. Only used when the user has pasted their own
// Anthropic API key into the options page — the key lives in chrome.storage.local
// and is sent straight to api.anthropic.com, never anywhere else.

const API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-opus-5';

const SYSTEM_PROMPT =
  'You write extremely short, plain-language research briefs for a browser extension popup. ' +
  'Given a scientific article title and abstract, respond with exactly three labeled lines, ' +
  'each one or two sentences, no markdown, no preamble:\n' +
  'BACKGROUND: <what question/problem the study addresses>\n' +
  'KEY FINDING: <the main result, in plain language>\n' +
  'RELEVANCE: <who this matters to, or a notable limitation>';

/** Calls the Messages API with the user's own key to produce a short structured report. */
export async function generateAiReport({ title, abstract }) {
  const { anthropicApiKey = '', anthropicModel = DEFAULT_MODEL } = await chrome.storage.local.get([
    'anthropicApiKey',
    'anthropicModel',
  ]);
  if (!anthropicApiKey) {
    throw new Error('No Anthropic API key configured');
  }

  const model = anthropicModel || DEFAULT_MODEL;
  const supportsEffort = model === 'claude-opus-5' || model === 'claude-sonnet-5';

  const body = {
    model,
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Title: ${title}\n\nAbstract:\n${abstract}`,
      },
    ],
  };
  if (supportsEffort) {
    body.output_config = { effort: 'low' };
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.error?.message || '';
    } catch {
      /* ignore body parse failure */
    }
    throw new Error(`Anthropic API error (${res.status})${detail ? `: ${detail}` : ''}`);
  }

  const data = await res.json();
  if (data.stop_reason === 'refusal') {
    throw new Error('The model declined to summarize this abstract.');
  }
  const text = (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
  return parseReport(text);
}

function parseReport(text) {
  const grab = (label) => {
    const re = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n[A-Z ]+:|$)`, 'i');
    const m = text.match(re);
    return m ? m[1].trim() : '';
  };
  const background = grab('BACKGROUND');
  const finding = grab('KEY FINDING');
  const relevance = grab('RELEVANCE');
  if (!background && !finding && !relevance) {
    return { background: text, finding: '', relevance: '', source: 'ai' };
  }
  return { background, finding, relevance, source: 'ai' };
}
