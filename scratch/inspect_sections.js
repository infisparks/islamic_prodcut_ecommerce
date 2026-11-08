const fs = require('fs');
const content = fs.readFileSync('product.html', 'utf8');

// Find headings or main sections
const headings = content.match(/<h[1-4][^>]*>(.*?)<\/h[1-4]>/gi) || [];
console.log('Headings:', headings.slice(0, 20));

// Find links with href
const links = content.match(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi) || [];
console.log('Links with checkout or buy:', links.filter(l => l.includes('checkout') || l.includes('buy') || l.includes('cart')));

// Check script section
const scriptStart = content.indexOf('<script');
console.log('First script tag at:', scriptStart);

