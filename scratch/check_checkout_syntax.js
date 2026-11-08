const fs = require('fs');

const content = fs.readFileSync('checkout.html', 'utf8');

const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let count = 0;
while ((match = scriptRegex.exec(content)) !== null) {
  count++;
  const code = match[1];
  if (!code.trim()) continue;
  try {
    new Function(code);
    console.log(`checkout.html Script block #${count}: syntax OK`);
  } catch (err) {
    console.error(`checkout.html Script block #${count} syntax error:`, err.message);
  }
}

