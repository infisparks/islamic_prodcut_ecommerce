const fs = require('fs');
const content = fs.readFileSync('product.html', 'utf8');

console.log('product.html length:', content.length);

// Look for product IDs, language selection, buy now buttons
const idMatches = content.match(/productId\s*[:=]\s*['"\d]+/g) || [];
console.log('productId matches:', idMatches.slice(0, 10));

// Check if there are products listed or how language is chosen
const langMatches = content.match(/urdu|hindi|english|roman/gi) || [];
console.log('Language mentions count:', langMatches.length);

// Check buy button handlers
const buyMatches = content.match(/buyNow|checkout|addToCart|selectLanguage/gi) || [];
console.log('Action keywords count:', buyMatches.length);

// Find forms or buttons
const buttons = content.match(/<button[^>]*>(.*?)<\/button>/gi) || [];
console.log('Total buttons:', buttons.length);
for (let i = 0; i < Math.min(buttons.length, 15); i++) {
  console.log(`Button ${i}:`, buttons[i].substring(0, 100));
}

