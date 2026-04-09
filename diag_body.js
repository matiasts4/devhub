const fs = require("fs");
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
    const options = args[1] || {};
    if (options.body) {
        fs.writeFileSync("/home/matias/devhub/diag_body.json", options.body);
    }
    return originalFetch(...args);
};
