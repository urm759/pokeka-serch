const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function capture({cwd = path.join(__dirname, '..'), source = 'unknown'} = {}) {
  const directory = path.join(cwd, 'work/unpublished-recovery', `${process.env.GITHUB_RUN_ID || 'local'}-${Date.now()}`);
  fs.mkdirSync(directory, {recursive:true});
  const files = [];
  function copy(relative) {
    const bytes = fs.readFileSync(path.join(cwd, relative));
    const target = path.join(directory, relative);
    fs.mkdirSync(path.dirname(target), {recursive:true});
    fs.writeFileSync(target, bytes);
    let validJson = true;
    try { JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')); } catch { validJson = false; }
    files.push({file:relative, bytes:bytes.length, sha256:crypto.createHash('sha256').update(bytes).digest('hex'), validJson});
  }
  function scan(relative) {
    if (!fs.existsSync(path.join(cwd, relative))) return;
    for (const entry of fs.readdirSync(path.join(cwd, relative), {withFileTypes:true})) {
      const name = `${relative}/${entry.name}`;
      if (entry.isDirectory() && relative.startsWith('data') && name !== 'data/ui') scan(name);
      else if (entry.isFile() && entry.name.endsWith('.json')) copy(name);
    }
  }
  // Raw recovery deliberately does not depend on JSON parsing, summaries or Git.
  scan('data'); scan('work');
  const manifest = {version:1, source, savedAt:new Date().toISOString(), workflowRunId:process.env.GITHUB_RUN_ID || null,
    files, invalidJson:files.filter(row=>!row.validJson).map(row=>row.file), summaryGenerationRequired:true};
  fs.writeFileSync(path.join(directory, 'recovery-manifest.json'), JSON.stringify(manifest));
  for (const row of files) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, row.file))).digest('hex');
    if (hash !== row.sha256) throw new Error(`Recovery verification failed: ${row.file}`);
  }
  return {directory, files:files.length, invalidJson:manifest.invalidJson, verified:true};
}
if (require.main === module) {
  try {console.log(JSON.stringify(capture({source:process.argv[2]})));}
  catch (error) {console.error(error.message);process.exitCode=1;}
}
module.exports={capture};
