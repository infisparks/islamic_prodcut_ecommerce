const fs = require('fs');
const path = require('path');

const adminPath = path.join(__dirname, '..', 'admin.html');
let html = fs.readFileSync(adminPath, 'utf8');

// Replace order detail modal body styling
html = html.replace(/<div class="bg-gray-50 p-3 rounded-lg border border-\[#E5E7EB\] space-y-1">/g, '<div class="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/90 space-y-1.5 shadow-2xs">');
html = html.replace(/<div class="bg-indigo-50\/50 p-3\.5 rounded-lg border border-indigo-100 space-y-1\.5">/g, '<div class="bg-indigo-50/40 p-4 rounded-xl border border-indigo-100/90 space-y-2 shadow-2xs">');
html = html.replace(/<div class="bg-gray-50 p-3\.5 rounded-lg border border-\[#E5E7EB\] space-y-2">/g, '<div class="bg-slate-50/80 p-4 rounded-xl border border-slate-200/90 space-y-2.5 shadow-2xs">');
html = html.replace(/<div class="bg-white rounded-xl max-w-2xl w-full max-h-\[90vh\] flex flex-col border border-\[#E5E7EB\] shadow-xl overflow-hidden"/g, '<div class="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col border border-slate-200 shadow-2xl overflow-hidden"');

// Replace cancel modal styling
html = html.replace(/<div class="bg-white rounded-xl max-w-sm w-full p-6 border border-\[#E5E7EB\] shadow-xl"/g, '<div class="bg-white rounded-2xl max-w-sm w-full p-6 border border-slate-200 shadow-2xl"');

fs.writeFileSync(adminPath, html, 'utf8');
console.log('Successfully updated modal styles');

