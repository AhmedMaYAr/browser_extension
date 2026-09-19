// Zero-dependency fallback report, used when no Anthropic API key is configured.
// Picks a handful of representative sentences instead of calling any external service.

const RESULT_WORDS = /\b(result|results|found|show|shows|showed|demonstrate|demonstrates|demonstrated|associat|increas|decreas|improv|reduc|effect|signific)/i;
const CONCLUSION_WORDS = /\b(conclu|suggest|overall|in summary|these findings|our findings)/i;

function splitSentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Builds a short, structured "report" out of an abstract using simple heuristics — no API calls. */
export function buildExtractiveReport(abstract) {
  if (!abstract) return null;
  const sentences = splitSentences(abstract);
  if (sentences.length === 0) return null;

  const background = sentences[0];
  const finding =
    sentences.slice(1).find((s) => RESULT_WORDS.test(s)) ||
    sentences[Math.min(1, sentences.length - 1)];
  const conclusion =
    [...sentences].reverse().find((s) => CONCLUSION_WORDS.test(s)) ||
    sentences[sentences.length - 1];

  return {
    background,
    finding: finding !== background ? finding : null,
    conclusion: conclusion !== background && conclusion !== finding ? conclusion : null,
    source: 'extractive',
  };
}
