import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown formatting', () => {
  it('renders bold', () => {
    expect(renderMarkdown('**hi**')).toContain('<strong>hi</strong>');
  });
  it('renders italic', () => {
    expect(renderMarkdown('*hi*')).toContain('<em>hi</em>');
  });
  it('renders underline for __text__ (not bold)', () => {
    const out = renderMarkdown('__hi__');
    expect(out).toContain('<u>hi</u>');
    expect(out).not.toContain('<strong>hi</strong>');
  });
  it('renders strikethrough for ~~text~~', () => {
    expect(renderMarkdown('~~hi~~')).toContain('<s>hi</s>');
  });
  it('renders inline code', () => {
    expect(renderMarkdown('`x`')).toContain('<code>x</code>');
  });
  it('renders fenced code block', () => {
    expect(renderMarkdown('```\ncode\n```')).toContain('<pre>');
  });
  it('renders blockquote', () => {
    expect(renderMarkdown('> quoted')).toContain('<blockquote>');
  });
  it('renders spoiler ||x|| as a spoiler span', () => {
    const out = renderMarkdown('||secret||');
    expect(out).toContain('<span class="spoiler">secret</span>');
  });
});

describe('renderMarkdown sanitization', () => {
  it('neutralizes <script> tags (escaped to inert text, no live tag)', () => {
    const out = renderMarkdown('hello <script>alert(1)</script>');
    // html:false escapes the raw markup so it can never execute.
    expect(out).not.toContain('<script');
    expect(out).toContain('&lt;script&gt;');
  });
  it('does not emit live raw HTML the user typed (html:false)', () => {
    const out = renderMarkdown('<b>x</b><img src=x onerror=alert(1)>');
    // No live element/attribute survives; the markup is escaped to entities.
    expect(out).not.toContain('<img');
    expect(out).not.toMatch(/<b>/);
    expect(out).toContain('&lt;img');
  });
  it('strips disallowed tags like headings', () => {
    const out = renderMarkdown('# Heading');
    expect(out).not.toContain('<h1');
    // The literal text survives, just not as a heading element.
    expect(out).toContain('Heading');
  });
  it('strips event handler attributes', () => {
    const out = renderMarkdown('text');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('onclick');
  });
  it('removes injected spoiler sentinels from user input', () => {
    const sentinel = String.fromCharCode(0xe000);
    const out = renderMarkdown(`a${sentinel}b`);
    expect(out).not.toContain(sentinel);
  });
});
