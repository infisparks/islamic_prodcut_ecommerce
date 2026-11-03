const { execSync } = require('child_process');
const oldContent = execSync('git show HEAD:admin.html', { maxBuffer: 10 * 1024 * 1024 }).toString();

const idx = oldContent.indexOf('${customerName}');
if (idx !== -1) {
    console.log('Old customer markup:');
    console.log(oldContent.substring(idx - 200, idx + 400));
}

// Also let's check table borders / divide lines:
const tbodyIdx = oldContent.indexOf('<tbody id="orders-table-body"');
if (tbodyIdx !== -1) {
    console.log('Old tbody markup:');
    console.log(oldContent.substring(tbodyIdx, tbodyIdx + 300));
}

// Also check table tag
const tableIdx = oldContent.indexOf('<table');
if (tableIdx !== -1) {
    console.log('Old table markup:');
    console.log(oldContent.substring(tableIdx, tableIdx + 300));
}

