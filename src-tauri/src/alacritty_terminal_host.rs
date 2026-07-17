//! Alacritty-texture renderer host (new additive "otro tipo de vista").
//! Headless high-fidelity terminal engine for pizarra (texture/canvas view).
//! Does not replace existing vte-experimental / canvas / xterm modes.
//!
//! See docs/IMPLEMENT_ALACRITTY_TEXTURE_RENDERER_PLAN.md for full plan.

// Scaffold API — wired from JS later; keep the probe without call-site noise.
#![allow(dead_code)]

#[cfg(target_os = "linux")]
pub mod linux {
    // TODO Phase 1: bring in alacritty_terminal + portable_pty
    // struct AlacrittyTerminalHost { term: alacritty_terminal::Term, pty: ... }
    // impl ... { pub fn open(...) , resize, write, render_to_rgba() -> Option<(u32,u32,Vec<u8>)> , ... }
}

pub fn alacritty_texture_mode_supported() -> bool {
    // For now, Linux only like native VTE.
    cfg!(target_os = "linux")
}
