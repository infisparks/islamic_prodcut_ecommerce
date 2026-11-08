const fs = require('fs');
const content = fs.readFileSync('product.html', 'utf8');

const start = content.indexOf('switchProductLanguage');
console.log(content.substring(start - 400, start + 600));

