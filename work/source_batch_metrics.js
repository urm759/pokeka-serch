function shopBatch(source, stdout) {
  if (source === 'shopBuyback') {
    const last = String(stdout || '').trimEnd().split(/\r?\n/).at(-1);
    let receipt;
    try { receipt = JSON.parse(last).shopBuyback; } catch { /* Interrupted collector. */ }
    const valid = receipt && ['success','partial','partial-with-failure','no-progress'].includes(receipt.completionStatus)
      && Number.isSafeInteger(receipt.acquiredCount) && receipt.acquiredCount >= 0
      && ['heldStores','newFailures','acquiredStores','recheck'].every(key=>Array.isArray(receipt[key]));
    return {acquiredCount:valid ? receipt.acquiredCount : 0, updatedCount:null,newLinkedCount:null,receipt:valid ? receipt : null};
  }
  if (!['torecacamp','yuyutei'].includes(source)) return null;
  for (const line of String(stdout).trim().split(/\r?\n/).reverse()) {
    try {
      const row=JSON.parse(line)?.[source];
      if (!row) continue;
      const fetched=source==='torecacamp' ? row.acquiredCount ?? row.detailFetched : row.fetched ?? row.searched;
      return {acquiredCount:Number.isFinite(fetched)?fetched:0,updatedCount:Number.isFinite(row.updated)?row.updated:null,
        newLinkedCount:Number.isFinite(row.linked)?row.linked:0,catalogCount:row.coverage??null};
    } catch { /* Collector diagnostics can precede the structured result. */ }
  }
  return null;
}
module.exports={shopBatch};
