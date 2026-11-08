const fs = require('fs');

const content = fs.readFileSync('product.html', 'utf8');

// Extract all scripts and check syntax
const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let count = 0;
while ((match = scriptRegex.exec(content)) !== null) {
  count++;
  const code = match[1];
  if (!code.trim()) continue;
  try {
    new Function(code);
    console.log(`Script block #${count}: syntax OK`);
  } catch (err) {
    console.error(`Script block #${count} syntax error:`, err.message);
  }
}

