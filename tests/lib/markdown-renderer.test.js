describe('MarkdownRenderer', () => {
  let MarkdownRenderer;
  let makeHtml;
  let originalShowdown;

  beforeEach(async () => {
    jest.resetModules();
    makeHtml = jest.fn((input) => `<p>${input}</p>`);
    originalShowdown = global.window?.showdown;
    global.window = global.window || {};
    global.window.showdown = {
      setOption: jest.fn(),
      Converter: jest.fn(() => ({ makeHtml }))
    };
    global.foundry = global.foundry || { utils: { mergeObject: (a, b) => ({ ...a, ...b }) } };

    const mod = await import('../../scripts/lib/markdown-renderer.js');
    MarkdownRenderer = mod.MarkdownRenderer;
  });

  afterEach(() => {
    if (originalShowdown === undefined) delete global.window.showdown;
    else global.window.showdown = originalShowdown;
  });

  it('converts markdown to HTML using showdown', async () => {
    const result = await MarkdownRenderer.render('**Bold** _italic_');
    expect(makeHtml).toHaveBeenCalledWith('**Bold** _italic_');
    expect(result).toBe('<p>**Bold** _italic_</p>');
  });

  it('returns original HTML when markdown conversion is unnecessary', async () => {
    const html = '<p>Already HTML</p>';
    const result = await MarkdownRenderer.render(html);
    expect(result).toBe(html);
    expect(makeHtml).not.toHaveBeenCalled();
  });

  it('falls back to plain text when conversion throws', async () => {
    makeHtml.mockImplementation(() => { throw new Error('boom'); });
    const result = await MarkdownRenderer.render('**broken**');
    expect(result).toBe('**broken**');
  });

  it('returns empty string for empty input', async () => {
    const result = await MarkdownRenderer.render('   ');
    expect(result).toBe('');
  });

  it('returns original text when disable option is true', async () => {
    const result = await MarkdownRenderer.render('**bold**', { disable: true });
    expect(result).toBe('**bold**');
    expect(makeHtml).not.toHaveBeenCalled();
  });

  it('escapes HTML when allowHtml is false and input is HTML', async () => {
    const result = await MarkdownRenderer.render('<script>alert(1)</script>', { allowHtml: false });
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
  });

  it('returns plain text if not markdown', async () => {
    const result = await MarkdownRenderer.render('Just plain text');
    expect(result).toBe('Just plain text');
  });

  describe('looksLikeHtml', () => {
    it('should detect HTML tags', () => {
      expect(MarkdownRenderer.looksLikeHtml('<div>test</div>')).toBe(true);
      expect(MarkdownRenderer.looksLikeHtml('no html here')).toBe(false);
    });
  });

  describe('looksLikeMarkdown', () => {
    it('should detect markdown patterns', () => {
      expect(MarkdownRenderer.looksLikeMarkdown('**bold**')).toBe(true);
      expect(MarkdownRenderer.looksLikeMarkdown('_italic_')).toBe(true);
      expect(MarkdownRenderer.looksLikeMarkdown('# Header')).toBe(true);
      expect(MarkdownRenderer.looksLikeMarkdown('plain text')).toBe(false);
    });
  });
});

