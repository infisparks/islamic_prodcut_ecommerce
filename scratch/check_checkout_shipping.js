const fs = require('fs');
const content = fs.readFileSync('checkout.html', 'utf8');

const matches = [];
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('onlineShipping') || line.includes('isPrepaidFreeShipping') || line.includes('598')) {
    matches.push(`${idx + 1}: ${line}`);
  }
});
console.log(matches.join('\n'));

