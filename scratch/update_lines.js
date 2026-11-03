const fs = require('fs');
const path = require('path');

const adminPath = path.join(__dirname, '..', 'admin.html');
let html = fs.readFileSync(adminPath, 'utf8');

// 1. Update tbody to have divide-slate-200 and border
html = html.replace('class="divide-y divide-slate-100"', 'class="divide-y divide-slate-200 border-b border-slate-200"');

// 2. Add border-b border-slate-200 to each tr in renderOrdersTable
html = html.replace(
  '<tr class="hover:bg-slate-50/80 transition-colors',
  '<tr class="border-b border-slate-200 hover:bg-slate-50/80 transition-colors'
);

fs.writeFileSync(adminPath, html, 'utf8');
console.log('Successfully updated table row lines in admin.html');

