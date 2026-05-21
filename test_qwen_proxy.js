const http = require('http');
http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        console.log("== REQUEST ==");
        console.log(req.method + " " + req.url);
        console.log(req.headers);
        console.log("BODY:", body);
        res.writeHead(200);
        res.end('{}');
    });
}).listen(8888, () => console.log('Proxy on 8888'));
