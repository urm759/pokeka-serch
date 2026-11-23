(function (root) {
  // A repeated encoded array is stored once. An entry refers only to earlier
  // entries, so decoding cannot cycle and always restores separate objects.
  function storeRepeats(data) {
    const counts = new Map(), keys = new Map(), ids = new Map(), repeats = [];
    const count = v => {
      if (!Array.isArray(v)) return;
      const key = JSON.stringify(v);
      keys.set(v, key); counts.set(key, (counts.get(key) || 0) + 1);
      v.forEach(count);
    };
    count(data);
    const REFERENCE_BYTES = 10;
    const pack = v => {
      if (!Array.isArray(v)) return v;
      const key = keys.get(v);
      if (ids.has(key)) return [-3, ids.get(key)];
      const packed = v.map(pack), uses = counts.get(key);
      if (uses < 2 || (uses - 1) * key.length <= uses * REFERENCE_BYTES) return packed;
      ids.set(key, repeats.length); repeats.push(packed);
      return [-3, ids.get(key)];
    };
    return { data: pack(data), repeats };
  }
  // A daily series [[YYYY-MM-DD, number], ...] in date order is stored as its
  // start day and (value, days) runs; (null, days) marks missing days. Decoding
  // rebuilds the same pairs, so every consumer still sees the original rows.
  const DAY_MS = 86400000;
  const dayAt = (start, offset) => new Date(Date.parse(start + 'T00:00:00Z') + offset * DAY_MS).toISOString().slice(0, 10);
  function dateSeries(v) {
    if (!Array.isArray(v) || v.length < 2) return null;
    let previous = -1;
    const start = v[0]?.[0], days = [];
    for (const item of v) {
      if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item[0])) return null;
      if (typeof item[1] !== 'number' || !Number.isFinite(item[1])) return null;
      const time = Date.parse(item[0] + 'T00:00:00Z');
      if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== item[0]) return null;
      const day = Math.round((time - Date.parse(start + 'T00:00:00Z')) / DAY_MS);
      if (day <= previous) return null;
      days.push([day, item[1]]); previous = day;
    }
    const runs = [];
    let next = 0;
    for (const [day, value] of days) {
      if (day > next) runs.push(null, day - next);
      const last = runs.length - 2;
      if (day === next && last >= 0 && runs[last] !== null && runs[last] === value) runs[last + 1]++;
      else runs.push(value, 1);
      next = day + 1;
    }
    return { start, runs };
  }
  function encode(value, {version=1, repeats=false, dateRuns=false} = {}) {
    if(![1,2].includes(version))throw new Error('Unsupported UI data codec version');
    if(repeats&&version!==2)throw new Error('Repeated rows require UI data codec version 2');
    if(dateRuns&&version!==2)throw new Error('Date runs require UI data codec version 2');
    let usedDateRuns = false;
    const schemas = [], schemaIds = new Map(), counts = new Map();
    const count = v => {
      if (typeof v === 'string') counts.set(v, (counts.get(v) || 0) + 1);
      else if (v && typeof v === 'object') Object.values(v).forEach(count);
    };
    count(value);
    const strings = [...counts].filter(([s, n]) => s.length > 5 && n > 1).map(([s]) => s);
    const stringIds = new Map(strings.map((s, i) => [s, i]));
    const visit = v => {
      if (typeof v === 'string') return stringIds.has(v)
        ? version===2 ? '~'+stringIds.get(v).toString(36) : [-2, stringIds.get(v)]
        : version===2 && v.startsWith('~') ? '~'+v : v;
      if (Array.isArray(v)) {
        const series = dateRuns ? dateSeries(v) : null;
        if (series) { usedDateRuns = true; return [-4, visit(series.start), ...series.runs]; }
        return [-1, ...v.map(visit)];
      }
      if (!v || typeof v !== 'object') return v;
      const keys = Object.keys(v), key = JSON.stringify(keys);
      if (!schemaIds.has(key)) { schemaIds.set(key, schemas.length); schemas.push(keys); }
      return [schemaIds.get(key), ...keys.map(k => visit(v[k]))];
    };
    const data = visit(value);
    const payload = { codec: 'ui-schema-v'+version, schemas, strings, data };
    // An older decoder rejects references and runs instead of showing partial history.
    if (usedDateRuns) payload.dateRuns = true;
    return repeats ? Object.assign(payload, storeRepeats(data)) : payload;
  }
  function reader(payload) {
    const stringAt=id=>{
      if(!Number.isInteger(id)||id<0||typeof payload.strings?.[id]!=='string')throw new Error('Invalid UI string reference');
      return payload.strings[id];
    };
    const visit = (v, limit = payload.repeats?.length ?? 0) => {
      if (!Array.isArray(v)) {
        if(payload.codec==='ui-schema-v2'&&typeof v==='string'&&v.startsWith('~')){
          if(v.startsWith('~~'))return v.slice(1);
          if(!/^~[0-9a-z]+$/.test(v))throw new Error('Invalid UI compact string reference');
          return stringAt(parseInt(v.slice(1),36));
        }
        return v;
      }
      if (v[0] === -2) return stringAt(v[1]);
      if (v[0] === -3) {
        const id = v[1];
        if (v.length !== 2 || !Number.isInteger(id) || id < 0 || id >= limit) throw new Error('Invalid UI repeat reference');
        return visit(payload.repeats[id], id);
      }
      if (v[0] === -4) {
        const start = visit(v[1], limit), rows = [];
        if (typeof start !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(start) || dayAt(start, 0) !== start || v.length < 4 || v.length % 2) throw new Error('Invalid UI date run');
        let day = 0;
        for (let i = 2; i < v.length; i += 2) {
          const value = v[i], days = v[i + 1];
          if (!Number.isInteger(days) || days < 1 || (value !== null && (typeof value !== 'number' || !Number.isFinite(value)))) throw new Error('Invalid UI date run');
          if (value !== null) for (let n = 0; n < days; n++) rows.push([dayAt(start, day + n), value]);
          day += days;
        }
        if (!rows.length || rows[0][0] !== start) throw new Error('Invalid UI date run');
        return rows;
      }
      if (v[0] === -1) return v.slice(1).map(item => visit(item, limit));
      const keys = payload.schemas[v[0]];
      if (!keys || keys.length !== v.length - 1) throw new Error('Invalid UI data schema');
      const result = {};
      for (let i = 0; i < keys.length; i++) {
        if (keys[i] === '__proto__') Object.defineProperty(result, keys[i], { value: visit(v[i + 1], limit), enumerable: true });
        else result[keys[i]] = visit(v[i + 1], limit);
      }
      return result;
    };
    return visit;
  }
  function decode(payload) {
    return ['ui-schema-v1','ui-schema-v2'].includes(payload?.codec) ? reader(payload)(payload.data) : payload;
  }
  async function decodeAsync(payload) {
    if (!['ui-schema-v1','ui-schema-v2'].includes(payload?.codec)) return payload;
    const visit = reader(payload);
    async function object(v, depth = 0) {
      if (!Array.isArray(v) || v[0] === -2 || v[0] === -3 || v[0] === -4 || depth > 1) return visit(v);
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
