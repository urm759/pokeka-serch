(function (root) {
  function create(parse = (html, container) => {
    const template = container.ownerDocument.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  }) {
    let saved = new Map();
    return function commit(container, rows) {
      const next = new Map(), changed = [];
      const ids = new Set();
      for (const row of rows) {
        if (ids.has(String(row.id))) throw new Error('Duplicate rendered card ID');
        ids.add(String(row.id));
      }
      for (const row of rows) {
        const id = String(row.id), previous = saved.get(id);
        const reusable = previous && previous.html === row.html && previous.node.parentNode === container;
        const node = reusable ? previous.node : parse(row.html, container);
        if (!node) throw new Error('Empty card markup');
        if (!reusable) changed.push(node);
        next.set(id, { html: row.html, node });
      }
      const retained = new Set([...next.values()].map(row => row.node));
      for (const node of [...container.children]) if (!retained.has(node)) node.remove();
      let cursor = container.firstElementChild;
      for (const { node } of next.values()) {
        if (node === cursor) cursor = cursor.nextElementSibling;
        else container.insertBefore(node, cursor);
      }
      saved = next;
      return { changed, reused: rows.length - changed.length, total: rows.length };
    };
  }
  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KeyedCardRenderer = api;
})(typeof globalThis === 'object' ? globalThis : this);
