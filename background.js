import { searchArticles, summarizeArticles, fetchAbstract, fetchRelated } from './lib/ncbi.js';
import { generateAiReport } from './lib/anthropic.js';
import { buildExtractiveReport } from './lib/extractive.js';

const MENU_ID = 'pube-search-selection';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Search PubMed for "%s"',
      contexts: ['selection'],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === MENU_ID && info.selectionText) {
    openSearchTab(info.selectionText);
  }
});

async function openSearchTab(query) {
  await chrome.storage.session.set({ pendingQuery: query });
  chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?tab=1') });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse, (err) => {
    console.error('[PubMed Article Explorer]', message?.type, err);
    sendResponse({ error: err?.message || String(err) });
  });
  return true; // keep the message channel open for the async response
});

async function handleMessage(message) {
  switch (message?.type) {
    case 'openSearchTab':
      await openSearchTab(message.query);
      return { ok: true };

    case 'search': {
      const { idlist, count } = await searchArticles(message.query, {
        retmax: message.retmax ?? 20,
        retstart: message.retstart ?? 0,
        sort: message.sort ?? 'relevance',
      });
      const results = await summarizeArticles(idlist);
      return { count, results };
    }

    case 'getAbstract': {
      const abstract = await fetchAbstract(message.pmid);
      return { abstract };
    }

    case 'getRelated': {
      const related = await fetchRelated(message.pmid, { limit: message.limit ?? 6 });
      return { related };
    }

    case 'getReport': {
      // AI calls only happen when the popup explicitly asks for one (useAi), so an
      // abstract is never sent to Anthropic just because the user expanded a card.
      if (message.useAi) {
        try {
          const report = await generateAiReport({ title: message.title, abstract: message.abstract });
          return { report };
        } catch (err) {
          // Fall back to the local extractive report rather than dead-ending the popup.
          const report = buildExtractiveReport(message.abstract);
          return { report, warning: err?.message || String(err) };
        }
      }
      return { report: buildExtractiveReport(message.abstract) };
    }

    default:
      throw new Error(`Unknown message type: ${message?.type}`);
  }
}
