export async function scanAccessibility(page, selector = 'body', options = {}) {
  const {
    maxControls = Number.POSITIVE_INFINITY,
    maxImages = Number.POSITIVE_INFINITY,
    maxIds = Number.POSITIVE_INFINITY,
  } = options;

  return page.locator(selector).evaluate(
    (root, { inspectedSelector, maxControls, maxImages, maxIds }) => {
      const violations = [];
      const visible = element => {
        const style = getComputedStyle(element);
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          element.getClientRects().length
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

      let scannedImages = 0;
      for (const image of root.querySelectorAll('img')) {
        if (scannedImages >= maxImages) break;
        scannedImages += 1;
        if (visible(image) && !image.hasAttribute('alt')) {
          violations.push({ rule: 'image-alt', element: image.outerHTML.slice(0, 300) });
        }
      }

      let scannedControls = 0;
      for (const control of root.querySelectorAll(
        'button, input, select, textarea, [role="button"]'
      )) {
        if (scannedControls >= maxControls) break;
        scannedControls += 1;
        if (visible(control) && !nameFor(control)) {
          violations.push({ rule: 'control-name', element: control.outerHTML.slice(0, 300) });
        }
      }

      const seenIds = new Set();
      let scannedIds = 0;
      for (const element of root.querySelectorAll('[id]')) {
        if (scannedIds >= maxIds) break;
        scannedIds += 1;
        if (seenIds.has(element.id)) {
          violations.push({ rule: 'duplicate-id', element: element.outerHTML.slice(0, 300) });
          continue;
        }
        seenIds.add(element.id);
      }

      return {
        schema_version: 1,
        selector: inspectedSelector,
        checked_at: new Date().toISOString(),
        limits: {
          max_controls: Number.isFinite(maxControls) ? maxControls : null,
          max_images: Number.isFinite(maxImages) ? maxImages : null,
          max_ids: Number.isFinite(maxIds) ? maxIds : null,
        },
        truncated:
          scannedControls >= maxControls || scannedImages >= maxImages || scannedIds >= maxIds,
        violation_count: violations.length,
        violations,
      };
    },
    { inspectedSelector: selector, maxControls, maxImages, maxIds }
  );
}
