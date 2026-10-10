(function(root, factory) {
  const model = factory();
  if (typeof module === 'object') module.exports = model;
  else root.PsaPlanModel = model;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  const definitions = [['standard','スタンダード'],['priority','プライオリティ'],['express','エクスプレス']];
  function positive(value) { return value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0; }
  function problem(plan) {
    if (!plan || !positive(plan.price) || !positive(plan.businessDays) || !positive(plan.calendarDays) || !positive(plan.declaredValueMax)) return 'PSA料金・納期が欠損しているため判断保留';
    if (plan.validationStatus === 'held' || plan.available === false) return plan.validationReason || 'PSA料金・納期の矛盾を確認中';
    if (Number(plan.calendarDays) < Number(plan.businessDays)) return 'PSA営業日と暦日が矛盾しているため判断保留';
    return null;
  }
  function parse(html) {
    const text = String(html).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ')
      .replace(/<[^>]*>/g,' ').replace(/&yen;|&#165;|&#x0*a5;/gi,'￥').replace(/&nbsp;|&#160;/gi,' ')
      .normalize('NFKC').replace(/\s+/g,' ');
    return definitions.map(([id,name]) => {
      const candidates = [...text.matchAll(new RegExp(name,'g'))].flatMap(m => {
        if (id==='express' && /スーパー[・･\s-]*$/.test(text.slice(Math.max(0,m.index-15),m.index))) return [];
        const block = text.slice(m.index+name.length, m.index + 700).split(/(?:スーパー・)?エクスプレス|プライオリティ|スタンダード/)[0] || '';
        const read = regex => { const s=block.match(regex)?.[1]; return s ? Number(s.replace(/,/g,'')) : null; };
        const row = {id,name,price:read(/[¥￥]\s*([\d,]+)\s*\/\s*枚/),businessDays:read(/予定納期\s*[:：]\s*([\d,]+)\s*営業日/),calendarDays:read(/日数換算\s*[:：]\s*約\s*([\d,]+)\s*日/),declaredValueMax:read(/申告価格\s*[:：]\s*[¥￥]\s*([\d,]+)\s*以下/),available:true};
        return problem(row) ? [] : [row];
      });
      const unique = new Map(candidates.map(p => [JSON.stringify([p.price,p.businessDays,p.calendarDays,p.declaredValueMax]),p]));
      return {id,name,plan:unique.size===1 ? [...unique.values()][0] : null,reason:unique.size>1 ? '同一プランの料金・納期が対立' : '公式料金表のプラン項目を解析できない'};
    });
  }
  return {definitions,problem,parse};
});
