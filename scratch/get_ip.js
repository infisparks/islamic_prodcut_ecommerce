const os = require('os');
const ifaces = os.networkInterfaces();
console.log('Network links:');
for (const dev in ifaces) {
  ifaces[dev].forEach(details => {
    if (details.family === 'IPv4' && !details.internal) {
      console.log('http://' + details.address + ':3000');
    }
  });
}

