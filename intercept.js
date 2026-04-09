const fs = require("fs");
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
    const url = args[0];
    const options = args[1] || {};
    const log = `\n--- FETCH ---\nURL: ${url}\nMethod: ${options.method || "GET"}\nHeaders: ${JSON.stringify(options.headers, null, 2)}\nBody: ${options.body}\n`;
    fs.appendFileSync("/home/matias/devhub/network.log", log);
    return originalFetch(...args);
};
