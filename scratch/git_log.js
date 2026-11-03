const { execSync } = require('child_process');
const log = execSync('git log -n 5 --oneline admin.html').toString();
console.log(log);

