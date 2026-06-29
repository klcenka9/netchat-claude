import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';

// Discord's formatting subset: bold/italic/underline/strike/inline-code/
// code-block/blockquote/spoiler. Start from the default preset (so emphasis,
// strikethrough, code, fences and blockquotes work reliably) and disable the
// block constructs Discord doesn't have. Rendered server-side, then hard-sanitized.
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

// Strip Markdown features Discord doesn't support.
md.disable(['heading', 'lheading', 'hr', 'list', 'table', 'reference', 'image', 'link']);

// Underline: Discord uses __text__. markdown-it maps both ** and __ to <strong>;
// emit <u> when the token markup was '__'.
md.renderer.rules.strong_open = (tokens, idx) =>
  tokens[idx].markup === '__' ? '<u>' : '<strong>';
md.renderer.rules.strong_close = (tokens, idx) =>
  tokens[idx].markup === '__' ? '</u>' : '</strong>';

// Spoiler: ||text|| -> <span class="spoiler">text</span>. markdown-it's text rule
// swallows '|' before any inline rule sees it, so we bracket spoilers with
// private-use sentinels before render and swap them for spans after sanitize
// (the inner text is markdown-processed and sanitized normally in between).
const SPOILER_OPEN = String.fromCharCode(0xe000);
const SPOILER_CLOSE = String.fromCharCode(0xe001);

const SANITIZE_OPTS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'em', 'u', 's', 'del', 'code', 'pre', 'blockquote', 'span', 'a',
  ],
  allowedAttributes: {
    span: ['class'],
    a: ['href', 'target', 'rel'],
  },
  allowedClasses: { span: ['spoiler'] },
  allowedSchemes: ['http', 'https'],
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' },
    }),
  },
};

export function renderMarkdown(input: string): string {
  // Strip any stray sentinel chars a user might paste, then bracket spoilers.
  const cleaned = input.split(SPOILER_OPEN).join('').split(SPOILER_CLOSE).join('');
  const pre = cleaned.replace(/\|\|([\s\S]+?)\|\|/g, (_m, inner) => `${SPOILER_OPEN}${inner}${SPOILER_CLOSE}`);
  const rendered = md.render(pre);
  const safe = sanitizeHtml(rendered, SANITIZE_OPTS);
  return safe
    .split(SPOILER_OPEN)
    .join('<span class="spoiler">')
    .split(SPOILER_CLOSE)
    .join('</span>');
}
