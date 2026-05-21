function testRewrite(input) {
    let urlStr = "";
    if (typeof input === "string") urlStr = input;
    else if (input instanceof URL) urlStr = input.href;
    else if (input && input.url) urlStr = input.url;

    if (urlStr.includes("dashscope.aliyuncs.com")) {
        urlStr = urlStr.replace("https://dashscope.aliyuncs.com/compatible-mode/v1", "https://portal.qwen.ai/v1");
        
        if (typeof input === "string") return urlStr;
        if (input instanceof URL) return new URL(urlStr);
        if (input && input.url) {
            // Using Request constructor
            return new Request(urlStr, input);
        }
    }
    return input;
}
console.log(testRewrite("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"));
console.log(testRewrite(new URL("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions")));
