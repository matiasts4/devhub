const fs = require("fs");
const creds = JSON.parse(fs.readFileSync(process.env.HOME + "/.qwen/oauth_creds.json", "utf-8"));

async function test(url, model) {
    console.log(`Testing ${url} with model ${model}...`);
    try {
        const res = await fetch(`${url}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${creds.access_token}`
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: "hola" }]
            })
        });
        const data = await res.json();
        console.log(`Status: ${res.status}`);
        console.log(`Body: ${JSON.stringify(data).slice(0, 100)}...`);
    } catch (e) {
        console.error(`Error: ${e.message}`);
    }
}

async function run() {
    await test("https://dashscope.aliyuncs.com/api/v1", "qwen3.6-plus");
    await test("https://dashscope.aliyuncs.com/api/v1", "coder-model");
    await test("https://dashscope-intl.aliyuncs.com/api/v1", "qwen3.6-plus");
}

run();
