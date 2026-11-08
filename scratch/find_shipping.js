const fs = require('fs');

function searchInFile(filePath, regex) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (regex.test(line)) {
      console.log(`${filePath}:${idx + 1}: ${line.trim()}`);
    }
  });
}

console.log('--- Searching for shipping calculation ---');
searchInFile('backend/routes/orders.js', /shipping|codCharge|cod_charge|freeShipping/i);
searchInFile('backend/services/catalogService.js', /shipping|codCharge|cod_charge|freeShipping/i);
searchInFile('checkout.html', /shipping|codCharge|cod_charge/i);
searchInFile('product.html', /shipping|codCharge|free_delivery/i);

