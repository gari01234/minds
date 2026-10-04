#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};

fn tray_icon() -> Image<'static> {
    let size = 24_u32;
    let mut rgba = vec![0_u8; (size * size * 4) as usize];
    let center = (size as f32 - 1.0) / 2.0;
    for y in 0..size {
        for x in 0..size {
            let dx = x as f32 - center;
            let dy = y as f32 - center;
            let distance = (dx * dx + dy * dy).sqrt();
            let pixel = ((y * size + x) * 4) as usize;
            if distance <= 9.5 {
                let inner = distance <= 6.1;
                let value = if inner { 236 } else { 38 };
                rgba[pixel] = value;
                rgba[pixel + 1] = value;
                rgba[pixel + 2] = value;
                rgba[pixel + 3] = 255;
            }
        }
    }
    Image::new_owned(rgba, size, size)
}

fn show_presence(app: &tauri::AppHandle, focus: bool) {
    if let Some(window) = app.get_webview_window("presence") {
        let _ = window.unminimize();
        let _ = window.show();
        if focus {
            let _ = window.set_focus();
        }
        let _ = app.emit("presence:manual-open", ());
    }
}

fn hide_presence(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("presence") {
        let _ = app.emit("presence:manual-hide", ());
        let _ = window.hide();
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Mostrar Isabella", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            TrayIconBuilder::with_id("isabella-presence")
                .icon(tray_icon())
                .tooltip("Isabella")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_presence(app, true),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("presence") {
                            match window.is_visible() {
                                Ok(true) => hide_presence(app),
                                _ => show_presence(app, true),
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let app = window.app_handle();
                let _ = app.emit("presence:manual-hide", ());
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Isabella Presence");
}
