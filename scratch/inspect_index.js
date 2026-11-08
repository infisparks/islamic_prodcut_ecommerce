const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');

// Find headings or main sections
const headings = content.match(/<h[1-4][^>]*>(.*?)<\/h[1-4]>/gi) || [];
console.log('index.html Headings count:', headings.length);
console.log('First 15 headings:', headings.slice(0, 15));

// Check buttons with buy or checkout
const buttons = content.match(/<button[^>]*>(.*?)<\/button>/gi) || [];
console.log('Total buttons in index.html:', buttons.length);
const buyButtons = buttons.filter(b => /buy|order|cart|combo|kit/i.test(b));
console.log('Buy buttons sample in index.html:', buyButtons.slice(0, 10));

