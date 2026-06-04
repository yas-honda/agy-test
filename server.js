// Custom Local HTTP Server for Aegis Vanguard
// Detects local IP and prints QR Code for mobile cross-play

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const qrcode = require('qrcode-terminal');

const PORT = 3000;

// Get local IPv4 address
function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                return alias.address;
            }
        }
    }
    return '127.0.0.1';
}

const server = http.createServer((req, res) => {
    // Basic static file serving
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.wav': 'audio/wav',
        '.mp3': 'audio/mpeg',
        '.ico': 'image/x-icon'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    // Remove query params if any
    const cleanPath = filePath.split('?')[0];

    fs.readFile(cleanPath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    const localIp = getLocalIp();
    const localUrl = `http://localhost:${PORT}`;
    const networkUrl = `http://${localIp}:${PORT}`;
    
    console.log('\n==================================================');
    console.log('   AEGIS VANGUARD - SERVER RUNNING');
    console.log('==================================================\n');
    console.log(`Local Access:   ${localUrl}`);
    console.log(`Network Access: ${networkUrl}`);
    console.log('\nScan the QR code below on your mobile device (on same Wi-Fi) to play:');
    
    // Generate QR Code inside terminal
    qrcode.generate(networkUrl, { small: true });
    
    console.log('\nPress Ctrl+C to terminate the server.\n');
});
