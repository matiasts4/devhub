use std::env;
use std::ffi::OsString;
use std::path::PathBuf;
use std::process::{Command, Stdio};

fn resolve_script(exe_dir: &PathBuf) -> Option<PathBuf> {
    [
        exe_dir.join("resources").join("devhub-server.cjs"),
        exe_dir
            .join("_up_")
            .join("resources")
            .join("devhub-server.cjs"),
        exe_dir.join("devhub-server.cjs"),
    ]
    .into_iter()
    .find(|path| path.exists())
}

fn resolve_node() -> OsString {
    if let Ok(node_bin) = env::var("DEVHUB_NODE_BIN") {
        let trimmed = node_bin.trim();
        if !trimmed.is_empty() {
            return OsString::from(trimmed);
        }
    }
    OsString::from("node")
}

fn main() {
    let exe = env::current_exe().expect("current exe");
    let exe_dir = exe.parent().expect("exe dir").to_path_buf();
    let script = resolve_script(&exe_dir).unwrap_or_else(|| {
        eprintln!(
            "[devhub-server] devhub-server.cjs not found near {}",
            exe_dir.display()
        );
        std::process::exit(1);
    });

    let status = Command::new(resolve_node())
        .arg(&script)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .unwrap_or_else(|error| {
            eprintln!("[devhub-server] Failed to launch Node sidecar: {error}");
            std::process::exit(1);
        });

    std::process::exit(status.code().unwrap_or(1));
}