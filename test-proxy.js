const http = require("http");
const fs = require("fs");

const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
        fs.writeFileSync("/home/matias/devhub/captured_request.json", JSON.stringify({
            url: req.url,
            method: req.method,
            headers: req.headers,
            body: body
        }, null, 2));
        console.log("REQUEST CAPTURED!");
        res.writeHead(200);
        res.end(JSON.stringify({
            choices: [{ message: { role: "assistant", content: "OK" } }]
        }));
        process.exit(0);
    });
});

server.listen(8888, () => console.log("Proxy listening on 8888"));
