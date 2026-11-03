const { execSync } = require('child_process');
const oldContent = execSync('git show 306b8ff:admin.html', { maxBuffer: 10 * 1024 * 1024 }).toString();

const idx = oldContent.indexOf('${customerName}');
if (idx !== -1) {
    console.log('Customer cell in 306b8ff:');
    console.log(oldContent.substring(idx - 300, idx + 500));
}

// Let's check 5cee6c7 as well
const olderContent = execSync('git show 5cee6c7:admin.html', { maxBuffer: 10 * 1024 * 1024 }).toString();
const idx2 = olderContent.indexOf('${customerName}');
if (idx2 !== -1) {
    console.log('Customer cell in 5cee6c7:');
    console.log(olderContent.substring(idx2 - 300, idx2 + 500));
}

