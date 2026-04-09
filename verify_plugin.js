const fs = require("fs");
const creds = JSON.parse(fs.readFileSync(process.env.HOME + "/.qwen/oauth_creds.json", "utf-8"));

async function test() {
    const ua = "QwenCode/0.14.0 (node/v24.14.0; linux; x64)";
    const url = "https://portal.qwen.ai/v1/chat/completions";
    
    console.log(`Verifying with PRODUCTION parameters...`);
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${creds.access_token}`,
            "User-Agent": ua,
            "X-DashScope-AuthType": "oauth"
        },
        body: JSON.stringify({
            model: "coder-model",
            messages: [{ role: "user", content: "Responde solo con la palabra: FUNCIONA" }],
            stream: false
        })
    });
    
    const text = await res.text();
    console.log(`Status: ${res.status}`);
    try {
        const data = JSON.parse(text);
        console.log(`Response: ${JSON.stringify(data)}`);
    } catch (e) {
        console.log(`Raw Response: ${text}`);
    }
}
test();
