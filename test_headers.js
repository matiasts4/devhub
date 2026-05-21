const fs = require("fs");
const creds = JSON.parse(fs.readFileSync(process.env.HOME + "/.qwen/oauth_creds.json", "utf-8"));

async function test(url, headers) {
    console.log(`Testing ${url} with headers: ${Object.keys(headers).join(", ")}...`);
    try {
        const res = await fetch(`${url}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...headers
            },
            body: JSON.stringify({
                model: "qwen3.6-plus",
                messages: [{ role: "user", content: "hola" }]
            })
        });
        const data = await res.json();
        console.log(`Response status: ${res.status}`);
        console.log(`Body: ${JSON.stringify(data).slice(0, 200)}...`);
    } catch (e) {
        console.error(`Error: ${e.message}`);
    }
}

async function run() {
    console.log("TESTING DASH SCOPE WITH PORTAL TOKEN");
    await test("https://coding-intl.dashscope.aliyuncs.com/v1", {
        "Authorization": `Bearer ${creds.access_token}`,
        "X-DashScope-AuthType": "oauth"
    });
    await test("https://dashscope.aliyuncs.com/compatible-mode/v1", {
        "Authorization": `Bearer ${creds.access_token}`,
        "X-DashScope-AuthType": "oauth"
    });
    await test("https://dashscope.aliyuncs.com/compatible-mode/v1", {
        "X-DashScope-OpenId-Token": creds.access_token,
        "X-DashScope-AuthType": "oauth"
    });
}

run();
