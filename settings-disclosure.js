(function (root) {
  'use strict';
  function correction(beforeTop, afterTop, scrollY, maxScroll) {
    if (![beforeTop, afterTop, scrollY, maxScroll].every(Number.isFinite)) return null;
    return Math.max(0, Math.min(maxScroll, scrollY + afterTop - beforeTop));
  }
  if (typeof module === 'object' && module.exports) module.exports = { correction };
  if (!root.document) return;
  const doc = root.document;
  let pending = null;
  function cancel() {
    if (!pending) return;
    doc.documentElement.style.overflowAnchor = pending.anchor;
    pending = null;
  }
  function remember(event) {
    if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    const summary = event.target.closest?.('summary');
    const details = summary?.parentElement;
    if (!details?.matches('details') || !details.closest('.search-settings')) return;
    cancel();
    pending = { details, summary, top: summary.getBoundingClientRect().top,
      anchor: doc.documentElement.style.overflowAnchor };
    // Disable browser anchoring only for the native disclosure layout change.
    doc.documentElement.style.overflowAnchor = 'none';
  }
  doc.addEventListener('click', remember, true);
  doc.addEventListener('keydown', remember, true);
  doc.addEventListener('toggle', (event) => {
    const current = pending;
    if (!current || event.target !== current.details) return;
    root.requestAnimationFrame(() => {
      if (pending !== current || !current.summary.isConnected) return;
      const next = correction(current.top, current.summary.getBoundingClientRect().top,
        root.scrollY, doc.documentElement.scrollHeight - root.innerHeight);
      if (next !== null && Math.abs(next - root.scrollY) > 1) {
        root.scrollTo({ top: next, behavior: 'instant' });
      }
      current.summary.dataset.disclosureShift = String(
        current.summary.getBoundingClientRect().top - current.top);
      cancel();
    });
  }, true);
  // Do not fight an intentional user scroll during the layout change.
  root.addEventListener('wheel', cancel, { passive: true });
  root.addEventListener('touchmove', cancel, { passive: true });
})(typeof window === 'object' ? window : globalThis);
