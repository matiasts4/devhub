const fs = require("fs");
const creds = JSON.parse(fs.readFileSync(process.env.HOME + "/.qwen/oauth_creds.json", "utf-8"));

async function test() {
    const ua = `QwenCode/0.14.0 (node/${process.version}; ${process.platform}; ${process.arch})`;
    console.log(`Testing with DashScope International and OAuth headers...`);
    const res = await fetch("https://coding-intl.dashscope.aliyuncs.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${creds.access_token}`,
            "User-Agent": ua,
            "X-DashScope-AuthType": "oauth",
            "X-DashScope-UserAgent": ua
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
