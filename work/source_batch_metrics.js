function shopBatch(source, stdout) {
  if (!['torecacamp','yuyutei'].includes(source)) return null;
  for (const line of String(stdout).trim().split(/\r?\n/).reverse()) {
    try {
      const row=JSON.parse(line)?.[source];
      if (!row) continue;
      const fetched=source==='torecacamp' ? row.detailFetched : row.fetched ?? row.searched;
      return {acquiredCount:Number.isFinite(fetched)?fetched:0,updatedCount:Number.isFinite(row.updated)?row.updated:null,
        newLinkedCount:Number.isFinite(row.linked)?row.linked:0,catalogCount:row.coverage??null};
    } catch { /* Collector diagnostics can precede the structured result. */ }
  }
  return null;
}
module.exports={shopBatch};
