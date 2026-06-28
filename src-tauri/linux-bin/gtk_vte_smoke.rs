use std::{
    cell::RefCell,
    ffi::OsString,
    path::{Path, PathBuf},
    rc::Rc,
};

use gtk::prelude::*;
use zoha_vte::{traits::TerminalExt, PtyFlags, Terminal};

const DEFAULT_SMOKE_WINDOW_TITLE: &str = "DevHub GTK/VTE Smoke Harness";
const DEFAULT_SHELL_COMMAND: &str = "exec \"${SHELL:-/bin/bash}\" -l";
const STRIPPED_SHELL_ENV_KEYS: [&str; 2] = ["npm_config_prefix", "NPM_CONFIG_PREFIX"];
const SMOKE_ZSH_LOGIN_COMMAND: &str = "exec zsh -i";
const HELP_TEXT: &str =
    "Usage: gtk_vte_smoke [--cwd <path>] [--command <shell-command>] [--title <window-title>]";

#[derive(Debug, Clone, PartialEq, Eq)]
struct SmokeConfig {
    cwd: Option<String>,
    command: Option<String>,
    title: String,
}

fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn build_smoke_shell_script(cwd: Option<String>, command: Option<String>) -> String {
    let mut segments = Vec::new();

    if let Some(cwd) = cwd.filter(|value| !value.trim().is_empty()) {
        segments.push(format!("cd {}", shell_single_quote(cwd.trim())));
    }

    if let Some(command) = command.filter(|value| !value.trim().is_empty()) {
        segments.push(format!("exec {}", command.trim()));
    } else {
        segments.push(DEFAULT_SHELL_COMMAND.to_string());
    }

    segments.join(" && ")
}

fn build_smoke_spawn_argv(config: &SmokeConfig) -> Vec<PathBuf> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
    let shell_program = Path::new(shell.as_str())
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();

    if shell_program == "zsh"
        && config
            .command
            .as_deref()
            .unwrap_or_default()
            .trim()
            .is_empty()
    {
        return vec![
            PathBuf::from(shell),
            PathBuf::from("-lic"),
            PathBuf::from(SMOKE_ZSH_LOGIN_COMMAND),
            PathBuf::from("devhub-shell"),
            PathBuf::from("--no-use"),
        ];
    }

    let script = build_smoke_shell_script(config.cwd.clone(), config.command.clone());

    vec![
        PathBuf::from(shell),
        PathBuf::from("-lc"),
        PathBuf::from(script),
    ]
}

fn should_strip_smoke_spawn_env_key(key: &str) -> bool {
    STRIPPED_SHELL_ENV_KEYS.contains(&key)
}

fn build_smoke_spawn_env_from_iter<I, K, V>(vars: I) -> Vec<PathBuf>
where
    I: IntoIterator<Item = (K, V)>,
    K: Into<OsString>,
    V: Into<OsString>,
{
    vars.into_iter()
        .filter_map(|(key, value)| {
            let key = key.into();
            if should_strip_smoke_spawn_env_key(key.to_string_lossy().as_ref()) {
                return None;
            }

            let mut entry = key;
            entry.push("=");
            entry.push(value.into());
            Some(PathBuf::from(entry))
        })
        .collect()
}

fn build_smoke_spawn_env() -> Vec<PathBuf> {
    build_smoke_spawn_env_from_iter(std::env::vars_os())
}

fn with_noop_child_setup<T, E>(
    mut run: impl FnMut(Option<&mut dyn FnMut()>) -> Result<T, E>,
) -> Result<T, E> {
    let mut noop_child_setup = || {};
    run(Some(&mut noop_child_setup))
}

fn parse_smoke_args<I>(args: I) -> Result<SmokeConfig, String>
where
    I: IntoIterator<Item = String>,
{
    let mut cwd = None;
    let mut command = None;
    let mut title = DEFAULT_SMOKE_WINDOW_TITLE.to_string();

    let mut iter = args.into_iter();
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--cwd" => {
                cwd = Some(
                    iter.next()
                        .ok_or_else(|| "missing value for --cwd".to_string())?,
                );
            }
            "--command" => {
                command = Some(
                    iter.next()
                        .ok_or_else(|| "missing value for --command".to_string())?,
                );
            }
            "--title" => {
                title = iter
                    .next()
                    .ok_or_else(|| "missing value for --title".to_string())?;
            }
            "--help" | "-h" => {
                println!("{HELP_TEXT}");
                std::process::exit(0);
            }
            other => {
                return Err(format!("unsupported arg: {other}"));
            }
        }
    }

    Ok(SmokeConfig {
        cwd,
        command,
        title,
    })
}

fn terminate_child(child_pid: Option<glib::Pid>) {
    if let Some(pid) = child_pid {
        unsafe {
            libc::kill(pid.0, libc::SIGTERM);
        }
    }
}

fn main() {
    let config = match parse_smoke_args(std::env::args().skip(1)) {
        Ok(config) => config,
        Err(error) => {
            eprintln!("{error}\n{HELP_TEXT}");
            std::process::exit(1);
        }
    };

    if let Err(error) = gtk::init() {
        eprintln!("gtk-init-failed: {error}");
        std::process::exit(1);
    }

    let window = gtk::Window::new(gtk::WindowType::Toplevel);
    window.set_title(&config.title);
    window.set_default_size(960, 640);

    let terminal = Terminal::new();
    terminal.set_input_enabled(true);
    #[allow(deprecated)] // set_rewrap_on_resize: kept for compatibility with zoha-vte 0.6 / vte <0.58
    terminal.set_rewrap_on_resize(true);

    let container = gtk::Box::new(gtk::Orientation::Vertical, 0);
    container.pack_start(&terminal, true, true, 0);
    window.add(&container);

    let argv = build_smoke_spawn_argv(&config);
    let argv_refs: Vec<&Path> = argv.iter().map(PathBuf::as_path).collect();
    let envv = build_smoke_spawn_env();
    let envv_refs: Vec<&Path> = envv.iter().map(PathBuf::as_path).collect();

    let child_pid = match with_noop_child_setup(|child_setup| {
        #[allow(deprecated)] // spawn_sync: standard API for zoha-vte 0.6 / vte 0.10
        terminal.spawn_sync(
            PtyFlags::DEFAULT,
            config
                .cwd
                .as_deref()
                .filter(|value| !value.trim().is_empty()),
            &argv_refs,
            &envv_refs,
            glib::SpawnFlags::SEARCH_PATH,
            child_setup,
            None::<&gtk::gio::Cancellable>,
        )
    }) {
        Ok(pid) => pid,
        Err(error) => {
            eprintln!("vte-spawn-failed: {error}");
            std::process::exit(1);
        }
    };

    terminal.watch_child(child_pid);
    terminal.grab_focus();

    let child_state = Rc::new(RefCell::new(Some(child_pid)));

    {
        let child_state = child_state.clone();
        terminal.connect_child_exited(move |_, status| {
            println!("gtk-vte-smoke child exited with status {status}");
            *child_state.borrow_mut() = None;
        });
    }

    {
        let child_state = child_state.clone();
        window.connect_delete_event(move |_, _| {
            terminate_child(child_state.borrow_mut().take());
            gtk::main_quit();
            glib::Propagation::Proceed
        });
    }

    window.show_all();
    gtk::main();
}

#[cfg(test)]
mod tests {
    use super::{
        build_smoke_shell_script, build_smoke_spawn_argv, build_smoke_spawn_env_from_iter,
        parse_smoke_args, with_noop_child_setup, SmokeConfig, DEFAULT_SMOKE_WINDOW_TITLE,
    };

    #[test]
    fn gtk_vte_smoke_defaults_to_login_shell_in_diagnostic_window() {
        let config = parse_smoke_args(Vec::<String>::new()).unwrap();

        assert_eq!(config.title, DEFAULT_SMOKE_WINDOW_TITLE);
        assert_eq!(
            build_smoke_shell_script(None, None),
            "exec \"${SHELL:-/bin/bash}\" -l"
        );
    }

    #[test]
    fn gtk_vte_smoke_accepts_explicit_cwd_command_and_title() {
        let config = parse_smoke_args(vec![
            "--cwd".to_string(),
            "/tmp/devhub smoke".to_string(),
            "--command".to_string(),
            "printf ready".to_string(),
            "--title".to_string(),
            "DevHub GTK/VTE Harness".to_string(),
        ])
        .unwrap();

        assert_eq!(config.title, "DevHub GTK/VTE Harness");
        assert_eq!(config.cwd.as_deref(), Some("/tmp/devhub smoke"));
        assert_eq!(config.command.as_deref(), Some("printf ready"));
        assert_eq!(
            build_smoke_shell_script(config.cwd.clone(), config.command.clone()),
            "cd '/tmp/devhub smoke' && exec printf ready"
        );
    }

    #[test]
    fn gtk_vte_smoke_spawn_argv_uses_zsh_no_use_mode_for_interactive_login_shell() {
        let original_shell = std::env::var_os("SHELL");
        std::env::set_var("SHELL", "/bin/zsh");

        let argv = build_smoke_spawn_argv(&SmokeConfig {
            cwd: Some("/workspace/devhub".to_string()),
            command: None,
            title: DEFAULT_SMOKE_WINDOW_TITLE.to_string(),
        });
        let argv = argv
            .iter()
            .map(|entry| entry.to_string_lossy().into_owned())
            .collect::<Vec<_>>();

        match original_shell {
            Some(value) => std::env::set_var("SHELL", value),
            None => std::env::remove_var("SHELL"),
        }

        assert_eq!(
            argv,
            vec![
                "/bin/zsh".to_string(),
                "-lic".to_string(),
                "exec zsh -i".to_string(),
                "devhub-shell".to_string(),
                "--no-use".to_string(),
            ]
        );
    }

    #[test]
    fn gtk_vte_smoke_spawn_wrapper_always_supplies_child_setup_callback() {
        let callback_present = with_noop_child_setup(|child_setup| {
            if let Some(callback) = child_setup {
                callback();
                Ok::<_, String>(true)
            } else {
                Ok::<_, String>(false)
            }
        })
        .unwrap();

        assert!(callback_present);
    }

    #[test]
    fn gtk_vte_smoke_strips_npm_prefix_env_variables() {
        let env_entries = build_smoke_spawn_env_from_iter([
            ("npm_config_prefix", "/home/user/.npm-global"),
            ("NPM_CONFIG_PREFIX", "/home/user/.npm-global-upper"),
            ("PATH", "/usr/bin"),
        ]);
        let env_entries = env_entries
            .iter()
            .map(|entry| entry.to_string_lossy().into_owned())
            .collect::<Vec<_>>();

        assert!(env_entries.iter().any(|entry| entry == "PATH=/usr/bin"));
        assert!(!env_entries
            .iter()
            .any(|entry| entry.starts_with("npm_config_prefix=")));
        assert!(!env_entries
            .iter()
            .any(|entry| entry.starts_with("NPM_CONFIG_PREFIX=")));
    }
}
