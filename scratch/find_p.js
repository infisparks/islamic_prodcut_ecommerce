const fs = require('fs');

const content = fs.readFileSync('product.html', 'utf8');

// Find occurrences of `const p =` or `let p =` in the main script block
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('buyPdpProductNow') || line.includes('confirmLanguageAndProceed') || line.includes('addPdpProductToCart')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});

