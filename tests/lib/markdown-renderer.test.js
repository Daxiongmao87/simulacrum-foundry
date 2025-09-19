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
});
