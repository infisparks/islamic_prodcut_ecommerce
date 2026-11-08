const fs = require('fs');
const content = fs.readFileSync('product.html', 'utf8');

const start = content.indexOf('const products = [');
if (start !== -1) {
  console.log(content.substring(start, start + 2500));
}

