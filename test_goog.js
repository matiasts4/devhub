const fs = require("fs");
const creds = JSON.parse(fs.readFileSync(process.env.HOME + "/.qwen/oauth_creds.json", "utf-8"));

async function test() {
    const ua = `QwenCode/0.14.0 (node/${process.version}; ${process.platform}; ${process.arch})`;
    const clientHeader = `gl-node/${process.version.slice(1)} gccl/0.14.0`;
    console.log(`Testing with Portal and Google metrics headers...`);
    const res = await fetch("https://portal.qwen.ai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${creds.access_token}`,
            "User-Agent": ua,
            "x-goog-api-client": clientHeader
        },
        body: JSON.stringify({
            model: "qwen3.6-plus",
            messages: [{ role: "user", content: "hola" }]
        })
    });
    const data = await res.json();
    console.log(`Status: ${res.status}`);
    console.log(`Body: ${JSON.stringify(data)}`);
}
test();
