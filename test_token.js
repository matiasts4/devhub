const fs = require("fs");
const creds = JSON.parse(fs.readFileSync(process.env.HOME + "/.qwen/oauth_creds.json", "utf-8"));

async function test(url, model) {
    console.log(`Testing ${url} with model ${model}...`);
    try {
        const res = await fetch(`${url}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${creds.access_token}`,
                "User-Agent": "QwenCode/0.14.0"
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: "hola" }]
            })
        });
        const data = await res.json();
        console.log(`Response status: ${res.status}`);
        console.log(`Body: ${JSON.stringify(data)}`);
    } catch (e) {
        console.error(`Error: ${e.message}`);
    }
}

async function run() {
    await test("https://portal.qwen.ai/v1", "qwen3.6-plus");
    await test("https://portal.qwen.ai/v1", "qwen-max");
    await test("https://coding-intl.dashscope.aliyuncs.com/v1", "qwen3.6-plus");
}

run();
