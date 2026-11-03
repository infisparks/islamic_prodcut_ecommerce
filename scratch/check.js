const fs = require('fs');
const content = fs.readFileSync('admin.html', 'utf8');
const lines = content.split('\n');
console.log('Total lines:', lines.length);

const sections = [
  'id="login-section"',
  'id="dashboard-section"',
  'id="orders-table-body"',
  'function renderOrdersTable',
  'function renderAdminItemsCell',
  'function openOrderDetail',
  'function openWhatsAppModal',
  'function openChangeProductModal',
  'function openDelhiveryDispatchModal',
  'function loadOrdersAndStats'
];

for (const sec of sections) {
  const lineIdx = lines.findIndex(l => l.includes(sec));
  console.log(`${sec} at line ${lineIdx + 1}`);
}

