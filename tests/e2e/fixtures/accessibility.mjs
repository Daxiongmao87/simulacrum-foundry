export async function scanAccessibility(page, selector = 'body') {
  return page.locator(selector).evaluate((root, inspectedSelector) => {
    const violations = [];
    const visible = element => {
      const style = getComputedStyle(element);
      return (
        style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length
      );
    };
    const nameFor = element =>
      element.getAttribute('aria-label') ||
      element.getAttribute('title') ||
      element.textContent?.trim() ||
      (element.id
        ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent
        : '') ||
      element.getAttribute('placeholder') ||
      '';

    for (const image of root.querySelectorAll('img')) {
      if (visible(image) && !image.hasAttribute('alt')) {
        violations.push({ rule: 'image-alt', element: image.outerHTML.slice(0, 300) });
      }
    }

    for (const control of root.querySelectorAll(
      'button, input, select, textarea, [role="button"]'
    )) {
      if (visible(control) && !nameFor(control)) {
        violations.push({ rule: 'control-name', element: control.outerHTML.slice(0, 300) });
      }
    }

    for (const duplicate of [...root.querySelectorAll('[id]')].filter((element, index, all) => {
      return all.findIndex(candidate => candidate.id === element.id) !== index;
    })) {
      violations.push({ rule: 'duplicate-id', element: duplicate.outerHTML.slice(0, 300) });
    }

    return {
      schema_version: 1,
      selector: inspectedSelector,
      checked_at: new Date().toISOString(),
      violation_count: violations.length,
      violations,
    };
  }, selector);
}
