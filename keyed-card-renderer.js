(function (root) {
  function disclosures(node) {
    const map=new Map();
    for(const el of node.querySelectorAll?.('details')||[]){
      const parts=[];
      for(let parent=el;parent&&parent!==node;parent=parent.parentElement){
        if(parent.tagName!=='DETAILS')continue;
        const summary=[...(parent.children||[])].find(c=>c.tagName==='SUMMARY');
        parts.unshift([parent.id||'',String(summary?.textContent||'').replace(/\s+/g,' ').trim()]);
      }
      const key=JSON.stringify(parts);
      // Identical unnamed siblings are ambiguous; never transfer by ordinal.
      map.set(key,map.has(key)?null:el);
    }
    return map;
  }
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
        let defaults=previous?.defaults;
        if(!reusable){
          const nextDetails=disclosures(node),oldDetails=previous?disclosures(previous.node):new Map();
          defaults=new Map([...nextDetails].map(([key,el])=>[key,el?el.open:null]));
          for(const [key,el]of nextDetails){
            const old=oldDetails.get(key);
            // An explicit application open/close request wins. Otherwise retain
            // the user's native disclosure state across a lazy-data repaint.
            if(el&&old&&(previous.defaults?.get(key)===defaults.get(key)||!previous.defaults?.has(key)&&defaults.get(key)===false))el.open=old.open;
          }
        }
        if (!reusable) changed.push(node);
        next.set(id, { html: row.html, node, defaults });
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
  const advisoryMarkup=new WeakMap();
  function replaceContent(target,html) {
    if(advisoryMarkup.get(target)===html)return false;
    const previous=disclosures(target);
    target.innerHTML=html;
    for(const [key,el]of disclosures(target)){const old=previous.get(key);if(el&&old)el.open=old.open;}
    advisoryMarkup.set(target,html);
    return true;
  }
  const api = { create,replaceContent };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KeyedCardRenderer = api;
})(typeof globalThis === 'object' ? globalThis : this);
