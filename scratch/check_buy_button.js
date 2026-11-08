const fs = require('fs');
const content = fs.readFileSync('product.html', 'utf8');

const matches = [];
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('buyPdpProductNow') || line.includes('addPdpProductToCart')) {
    matches.push(`${idx + 1}: ${line}`);
  }
});
console.log(matches.join('\n'));

