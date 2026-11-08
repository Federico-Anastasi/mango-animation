// Niente console: è un'app con finestra.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    mango_animation_lib::avvia()
}
