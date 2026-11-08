const fs = require('fs');
const content = fs.readFileSync('product.html', 'utf8');

function printFn(fnName) {
  const start = content.indexOf(`function ${fnName}(`);
  if (start === -1) {
    console.log(`Function ${fnName} not found`);
    return;
  }
  console.log(`=== ${fnName} ===`);
  console.log(content.substring(start, start + 1200));
}

printFn('buyPdpProductNow');
printFn('switchProductLanguage');
printFn('selectPdpVariant');

