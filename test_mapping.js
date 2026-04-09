const fs = require("fs");
const creds = JSON.parse(fs.readFileSync(process.env.HOME + "/.qwen/oauth_creds.json", "utf-8"));

async function test(model) {
    const ua = `QwenCode/0.14.0 (node/${process.version}; ${process.platform}; ${process.arch})`;
    console.log(`Testing Portal with model: ${model}...`);
    const res = await fetch("https://portal.qwen.ai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${creds.access_token}`,
            "User-Agent": ua
        },
        body: JSON.stringify({
            model: model,
            messages: [{ role: "user", content: "hola" }]
        })
    });
    const data = await res.json();
    console.log(`Status: ${res.status}`);
    console.log(`Body: ${JSON.stringify(data).slice(0, 100)}...`);
}

async function run() {
    await test("qwen-plus");
    await test("qwen-max");
    await test("qwen-turbo");
}
run();
