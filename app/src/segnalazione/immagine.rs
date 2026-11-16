//! L'immagine che chi segnala sceglie di allegare. La pagina la manda in base64; qui si riconosce dai primi byte (il tipo dichiarato dalla pagina non conta) e si accetta solo PNG, JPEG o WebP fino a 10 MB.

use crate::lingua::t;
use base64::Engine;

pub(super) const LIMITE: usize = 10 * 1024 * 1024;

/// Un'immagine riconosciuta: il nome fisso con cui si allega, il suo tipo e i suoi byte.
pub(super) struct Immagine {
    pub(super) nome: &'static str,
    pub(super) tipo: &'static str,
    pub(super) byte: Vec<u8>,
}

fn non_e_un_immagine() -> String {
    t("Il file scelto non è un'immagine PNG, JPEG o WebP.", "The chosen file is not a PNG, JPEG or WebP image.")
}

fn troppo_grande() -> String {
    t("L'immagine pesa più di 10 MB: scegline una più piccola.", "The image is larger than 10 MB: choose a smaller one.")
}

fn riconosci(byte: &[u8]) -> Option<(&'static str, &'static str)> {
    match byte {
        [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, ..] => Some(("uploaded-image.png", "image/png")),
        [0xFF, 0xD8, 0xFF, ..] => Some(("uploaded-image.jpg", "image/jpeg")),
        [b'R', b'I', b'F', b'F', _, _, _, _, b'W', b'E', b'B', b'P', ..] => Some(("uploaded-image.webp", "image/webp")),
        _ => None,
    }
}

/// Decodifica l'immagine arrivata dalla pagina e la controlla; rifiuta con una frase per chi segnala.
pub(super) fn leggi(base64: &str) -> Result<Immagine, String> {
    if base64.len() > LIMITE / 3 * 4 + 4 {
        return Err(troppo_grande());
    }
    let byte = base64::engine::general_purpose::STANDARD.decode(base64.trim()).map_err(|_| non_e_un_immagine())?;
    if byte.len() > LIMITE {
        return Err(troppo_grande());
    }
    let (nome, tipo) = riconosci(&byte).ok_or_else(non_e_un_immagine)?;
    Ok(Immagine { nome, tipo, byte })
}

#[cfg(test)]
pub(super) mod aiuti {
    use base64::Engine;

    pub const PNG: [u8; 12] = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13];

    pub fn in_base64(byte: &[u8]) -> String {
        base64::engine::general_purpose::STANDARD.encode(byte)
    }
}

#[cfg(test)]
mod prove {
    use super::aiuti::*;
    use super::*;
    use crate::lingua::{con, Lingua};

    fn webp() -> Vec<u8> {
        [b"RIFF".as_slice(), &[24, 0, 0, 0], b"WEBPVP8 ", &[0; 8]].concat()
    }

    #[test]
    fn png_jpeg_e_webp_si_riconoscono_dai_primi_byte_e_prendono_il_nome_giusto() {
        let png = leggi(&in_base64(&PNG)).unwrap();
        assert_eq!((png.nome, png.tipo, png.byte), ("uploaded-image.png", "image/png", PNG.to_vec()));
        let jpeg = leggi(&in_base64(&[0xFF, 0xD8, 0xFF, 0xE0, 0, 16])).unwrap();
        assert_eq!((jpeg.nome, jpeg.tipo), ("uploaded-image.jpg", "image/jpeg"));
        let w = leggi(&in_base64(&webp())).unwrap();
        assert_eq!((w.nome, w.tipo), ("uploaded-image.webp", "image/webp"));
    }

    #[test]
    fn ogni_altro_contenuto_si_rifiuta_anche_se_la_pagina_lo_chiama_immagine() {
        let gif = b"GIF89a\x01\x00\x01\x00";
        let svg = b"<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>";
        let riff_non_webp = [b"RIFF".as_slice(), &[24, 0, 0, 0], b"WAVEfmt "].concat();
        for (nome, byte) in [("gif", gif.to_vec()), ("svg", svg.to_vec()), ("testo", b"non sono un'immagine".to_vec()), ("riff", riff_non_webp), ("vuoto", vec![]), ("corto", vec![0x89, b'P'])] {
            let errore = leggi(&in_base64(&byte)).err().unwrap_or_else(|| panic!("{nome} è stato accettato"));
            assert_eq!(errore, "Il file scelto non è un'immagine PNG, JPEG o WebP.", "{nome}");
        }
        assert_eq!(leggi("questo non è base64!").err().unwrap(), "Il file scelto non è un'immagine PNG, JPEG o WebP.");
    }

    #[test]
    fn fino_a_10_mb_si_accetta_oltre_si_rifiuta_senza_decodificare() {
        let mut al_limite = PNG.to_vec();
        al_limite.resize(LIMITE, 0);
        assert_eq!(leggi(&in_base64(&al_limite)).unwrap().byte.len(), LIMITE);

        al_limite.push(0);
        assert_eq!(leggi(&in_base64(&al_limite)).err().unwrap(), "L'immagine pesa più di 10 MB: scegline una più piccola.");
        assert_eq!(leggi(&"A".repeat(LIMITE * 2)).err().unwrap(), "L'immagine pesa più di 10 MB: scegline una più piccola.");
    }

    #[test]
    fn le_frasi_sono_nelle_due_lingue() {
        con(Lingua::En, || {
            assert_eq!(leggi("###").err().unwrap(), "The chosen file is not a PNG, JPEG or WebP image.");
            assert_eq!(leggi(&"A".repeat(LIMITE * 2)).err().unwrap(), "The image is larger than 10 MB: choose a smaller one.");
        });
    }
}
