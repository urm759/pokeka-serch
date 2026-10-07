(function (root) {
  function encode(value) {
    const schemas = [], schemaIds = new Map(), counts = new Map();
    const count = v => {
      if (typeof v === 'string') counts.set(v, (counts.get(v) || 0) + 1);
      else if (v && typeof v === 'object') Object.values(v).forEach(count);
    };
    count(value);
    const strings = [...counts].filter(([s, n]) => s.length > 5 && n > 1).map(([s]) => s);
    const stringIds = new Map(strings.map((s, i) => [s, i]));
    const visit = v => {
      if (typeof v === 'string') return stringIds.has(v) ? [-2, stringIds.get(v)] : v;
      if (Array.isArray(v)) return [-1, ...v.map(visit)];
      if (!v || typeof v !== 'object') return v;
      const keys = Object.keys(v), key = JSON.stringify(keys);
      if (!schemaIds.has(key)) { schemaIds.set(key, schemas.length); schemas.push(keys); }
      return [schemaIds.get(key), ...keys.map(k => visit(v[k]))];
    };
    const data = visit(value);
    return { codec: 'ui-schema-v1', schemas, strings, data };
  }
  function reader(payload) {
    const visit = v => {
      if (!Array.isArray(v)) return v;
      if (v[0] === -2) return payload.strings[v[1]];
      if (v[0] === -1) return v.slice(1).map(visit);
      const keys = payload.schemas[v[0]];
      if (!keys || keys.length !== v.length - 1) throw new Error('Invalid UI data schema');
      const result = {};
      for (let i = 0; i < keys.length; i++) {
        if (keys[i] === '__proto__') Object.defineProperty(result, keys[i], { value: visit(v[i + 1]), enumerable: true });
        else result[keys[i]] = visit(v[i + 1]);
      }
      return result;
    };
    return visit;
  }
  function decode(payload) {
    return payload?.codec === 'ui-schema-v1' ? reader(payload)(payload.data) : payload;
  }
  async function decodeAsync(payload) {
    if (payload?.codec !== 'ui-schema-v1') return payload;
    const visit = reader(payload);
    async function object(v, depth = 0) {
      if (!Array.isArray(v) || v[0] === -2 || depth > 1) return visit(v);
      const array = v[0] === -1;
      const keys = array ? Array.from({length:v.length-1},(_,i)=>i) : payload.schemas[v[0]], result = array ? [] : {};
      let yieldedAt = Date.now();
      for (let i = 0; i < keys.length; i++) {
        const child = v[i + 1];
        const value = depth === 0 ? await object(child, depth + 1) : visit(child);
        Object.defineProperty(result, keys[i], { value, enumerable: true, writable: true, configurable: true });
        if (Date.now() - yieldedAt >= 8) {
          await new Promise(resolve => setTimeout(resolve, 0)); yieldedAt = Date.now();
        }
      }
      return result;
    }
    return object(payload.data);
  }
  const api = { encode, decode, decodeAsync };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.UiDataCodec = api;
})(typeof window !== 'undefined' ? window : globalThis);
