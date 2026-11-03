const fs = require('fs');
const content = fs.readFileSync('admin.html', 'utf8');
const search = "document.getElementById('modal-order-body').innerHTML";
const idx = content.indexOf(search);
console.log('Found at:', idx);
if (idx !== -1) {
    console.log(content.substring(idx, idx + 1200));
}

