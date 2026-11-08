const fs = require('fs');
const content = fs.readFileSync('product.html', 'utf8');

const matches = [];
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('modal') || line.includes('Modal')) {
    matches.push(`${idx + 1}: ${line.trim()}`);
  }
});
console.log(matches.slice(0, 15).join('\n'));

