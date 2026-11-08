//! La finestra dell'app come immagine PNG, per la segnalazione.

use anyhow::{ensure, Result};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
    DIB_RGB_COLORS,
};
use windows::Win32::Storage::Xps::{PrintWindow, PRINT_WINDOW_FLAGS};
use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;

/// Chiede alla finestra di disegnarsi tutta, anche il contenuto che WebView2 compone a parte: una copia dello schermo prenderebbe anche ciò che la copre.
const PW_RENDERFULLCONTENT: u32 = 2;

pub fn png_della_finestra(finestra: &tauri::WebviewWindow) -> Result<Vec<u8>> {
    png_di(HWND(finestra.hwnd()?.0))
}

fn png_di(hwnd: HWND) -> Result<Vec<u8>> {
    let mut rettangolo = RECT::default();
    unsafe { GetWindowRect(hwnd, &mut rettangolo)? };
    let (larghezza, altezza) = (rettangolo.right - rettangolo.left, rettangolo.bottom - rettangolo.top);
    ensure!(larghezza > 0 && altezza > 0, "finestra di {larghezza}x{altezza}");
    let mut bgra = vec![0u8; (larghezza * altezza * 4) as usize];
    unsafe {
        let schermo = GetDC(HWND::default());
        let dc = CreateCompatibleDC(schermo);
        let bitmap = CreateCompatibleBitmap(schermo, larghezza, altezza);
        let vecchio = SelectObject(dc, bitmap);
        let disegnata = PrintWindow(hwnd, dc, PRINT_WINDOW_FLAGS(PW_RENDERFULLCONTENT)).as_bool();
        let mut info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: larghezza,
                biHeight: -altezza,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let righe = GetDIBits(dc, bitmap, 0, altezza as u32, Some(bgra.as_mut_ptr().cast()), &mut info, DIB_RGB_COLORS);
        SelectObject(dc, vecchio);
        let _ = DeleteObject(bitmap);
        let _ = DeleteDC(dc);
        ReleaseDC(HWND::default(), schermo);
        ensure!(disegnata && righe == altezza, "PrintWindow {disegnata}, righe {righe} di {altezza}");
    }
    png_da_bgra(larghezza as u32, altezza as u32, &bgra)
}

/// Pixel BGRA (righe dall'alto) in un PNG a colori senza trasparenza.
fn png_da_bgra(larghezza: u32, altezza: u32, bgra: &[u8]) -> Result<Vec<u8>> {
    ensure!(bgra.len() == larghezza as usize * altezza as usize * 4, "{} byte per {larghezza}x{altezza} pixel", bgra.len());
    let rgb: Vec<u8> = bgra.chunks_exact(4).flat_map(|p| [p[2], p[1], p[0]]).collect();
    let mut png = Vec::new();
    let mut codificatore = png::Encoder::new(&mut png, larghezza, altezza);
    codificatore.set_color(png::ColorType::Rgb);
    codificatore.set_depth(png::BitDepth::Eight);
    codificatore.write_header()?.write_image_data(&rgb)?;
    Ok(png)
}

#[cfg(test)]
mod prove {
    use super::*;
    use windows::core::w;
    use windows::Win32::UI::WindowsAndMessaging::FindWindowW;

    #[test]
    fn i_pixel_di_windows_diventano_un_png_con_i_colori_giusti() {
        // Due pixel in una riga: rosso e blu, come li dà GDI (blu, verde, rosso, vuoto).
        let png = png_da_bgra(2, 1, &[0, 0, 255, 0, 255, 0, 0, 0]).unwrap();
        let mut lettore = png::Decoder::new(std::io::Cursor::new(png)).read_info().unwrap();
        let mut dati = vec![0; lettore.output_buffer_size().unwrap()];
        let info = lettore.next_frame(&mut dati).unwrap();
        assert_eq!((info.width, info.height, info.color_type), (2, 1, png::ColorType::Rgb));
        assert_eq!(&dati[..6], &[255, 0, 0, 0, 0, 255]);
    }

    #[test]
    fn dei_pixel_che_non_bastano_per_la_misura_dichiarata_sono_un_errore() {
        assert!(png_da_bgra(2, 2, &[0; 8]).is_err());
    }

    /// Il giro con GDI su una finestra vera (la barra delle applicazioni del computer che la lancia): `cargo test una_finestra_vera -- --ignored`.
    #[test]
    #[ignore]
    fn una_finestra_vera_diventa_un_png() {
        let png = png_di(unsafe { FindWindowW(w!("Shell_TrayWnd"), None) }.unwrap()).unwrap();
        let lettore = png::Decoder::new(std::io::Cursor::new(png)).read_info().unwrap();
        assert!(lettore.info().width > 100 && lettore.info().height > 10);
    }
}
