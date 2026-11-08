const fs = require('fs');
const content = fs.readFileSync('product.html', 'utf8');

// Find all function declarations in product.html
const fnMatches = content.match(/function\s+([a-zA-Z0-9_]+)\s*\(/g) || [];
console.log('Functions in product.html:', fnMatches.map(f => f.replace('function ', '').replace('(', '').trim()));

