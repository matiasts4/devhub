const fs = require("fs");
const https = require("https");
const http = require("http");

function log(data) {
    fs.appendFileSync("/home/matias/devhub/network.log", `\n[${new Date().toISOString()}] ${data}\n`);
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
    const url = args[0]?.url || args[0];
    const options = args[1] || {};
    log(`--- FETCH ---\nURL: ${url}\nMETHOD: ${options.method || "GET"}\nHEADERS: ${JSON.stringify(options.headers, null, 2)}\nBODY: ${options.body ? options.body.toString().slice(0, 100) + "..." : "EMPTY"}`);
    return originalFetch(...args);
};

const wrap = (mod, name) => {
    const original = mod[name];
    mod[name] = function(options, callback) {
        let url;
        if (typeof options === "string") {
            url = options;
        } else {
            const protocol = options.protocol || (mod === https ? "https:" : "http:");
            url = `${protocol}//${options.hostname || options.host || "localhost"}${options.path || "/"}`;
        }
        log(`--- ${name.toUpperCase()} ---\nURL: ${url}\nHEADERS: ${JSON.stringify(options.headers, null, 2)}`);
        return original.apply(this, arguments);
    };
};

wrap(https, "request");
wrap(http, "request");
wrap(https, "get");
wrap(http, "get");

log("--- Interceptor Diagnostic v2 Injected ---");
