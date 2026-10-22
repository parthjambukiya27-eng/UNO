const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');
const js = fs.readFileSync('public/js/app.js', 'utf8');

const idRegex = /getElementById\(['"]([^'"]+)['"]\)/g;
const uniqueIds = new Set();
let match;
while ((match = idRegex.exec(js)) !== null) {
  uniqueIds.add(match[1]);
}

console.log(`Total unique getElementById calls: ${uniqueIds.size}`);
const missing = [];
for (const id of uniqueIds) {
  const hasDouble = html.includes(`id="${id}"`);
  const hasSingle = html.includes(`id='${id}'`);
  if (!hasDouble && !hasSingle) {
    missing.push(id);
  }
}

if (missing.length === 0) {
  console.log('✅ ALL DOM IDs referenced in app.js exist in index.html!');
} else {
  console.log('⚠️ Missing DOM IDs found in index.html:');
  missing.forEach(id => console.log('  -', id));
}

// Check unsafe addEventListener calls without optional chaining
const unsafeRegex = /document\.getElementById\(['"]([^'"]+)['"]\)\.addEventListener/g;
const unsafeIds = [];
while ((match = unsafeRegex.exec(js)) !== null) {
  unsafeIds.push(match[1]);
}
console.log(`\nUnsafe .addEventListener (without ?.) count: ${unsafeIds.length}`);
const fatalIds = unsafeIds.filter(id => !html.includes(`id="${id}"`) && !html.includes(`id='${id}'`));
if (fatalIds.length > 0) {
  console.log('❌ FATAL: Elements missing in HTML that will crash with TypeError on page load:');
  fatalIds.forEach(id => console.log('  -', id));
} else {
  console.log('✅ All non-optional addEventListener targets exist in HTML!');
}

