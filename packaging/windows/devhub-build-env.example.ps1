# Optional: move heavy caches off C: when D: has more space.
# Copy to your profile or run before builds:  . D:\devhub\packaging\windows\devhub-build-env.example.ps1

# Build temps (Next/tar/npm) — reduces C:\Users\...\AppData\Local\Temp growth
$devhubTemp = 'D:\devhub-cache\temp'
New-Item -ItemType Directory -Force -Path $devhubTemp | Out-Null
$env:TEMP = $devhubTemp
$env:TMP = $devhubTemp

# Rust artifact cache (optional; target already lives under D:\devhub\src-tauri\target)
# $env:CARGO_HOME = 'D:\devhub-cache\cargo-home'
# $env:RUSTUP_HOME = 'D:\devhub-cache\rustup'

# Packaged/dev runtime data (installed app extract + DB) — default is C:\Users\<you>\.devhub
# $env:DEVHUB_HOME = 'D:\devhub-runtime'

Write-Host "[devhub] TEMP/TMP -> $devhubTemp"