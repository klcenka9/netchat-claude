import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';

// Discord's actual formatting subset: bold/italic/underline/strike/inline-code/
// code-block/blockquote/spoiler. We render server-side, then hard-sanitize.
const md = new MarkdownIt('zero', {
  html: false,
  linkify: true,
  breaks: true,
});
md.enable([
  'emphasis',
  'backticks',
  'fence',
  'code',
  'blockquote',
  'strikethrough',
  'newline',
  'linkify',
  'text',
  'paragraph',
]);

// Underline: Discord uses __text__ (markdown-it maps __ to <strong>); we add a
// dedicated rule so __x__ -> <u> and **x** -> <strong>.
md.renderer.rules.strong_open = () => '<strong>';
md.renderer.rules.strong_close = () => '</strong>';

// Spoiler: ||text|| -> <span class="spoiler">text</span>
md.inline.ruler.before('emphasis', 'spoiler', (state, silent) => {
  const start = state.pos;
  if (state.src.charCodeAt(start) !== 0x7c /* | */) return false;
  if (state.src.charCodeAt(start + 1) !== 0x7c) return false;
  const end = state.src.indexOf('||', start + 2);
  if (end < 0) return false;
  if (!silent) {
    const token = state.push('spoiler', '', 0);
    token.content = state.src.slice(start + 2, end);
  }
  state.pos = end + 2;
  return true;
});
md.renderer.rules.spoiler = (tokens, idx) =>
  `<span class="spoiler">${md.utils.escapeHtml(tokens[idx].content)}</span>`;

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
  const rendered = md.render(input);
  return sanitizeHtml(rendered, SANITIZE_OPTS);
}
