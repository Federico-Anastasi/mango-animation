//! I pacchetti dello Store di Windows: Windows dice, dal nome di famiglia, in quale cartella sono installati.

use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use std::path::PathBuf;
use windows::core::{PCWSTR, PWSTR};
use windows::Win32::Foundation::{ERROR_INSUFFICIENT_BUFFER, ERROR_SUCCESS};
use windows::Win32::Storage::Packaging::Appx::{GetPackagePathByFullName, GetPackagesByPackageFamily};

/// Le cartelle d'installazione delle versioni del pacchetto presenti per l'utente di questo processo; nessuna se il pacchetto non c'è.
pub fn cartelle_del_pacchetto(famiglia: &str) -> Vec<PathBuf> {
    let famiglia: Vec<u16> = famiglia.encode_utf16().chain(Some(0)).collect();
    let (mut quanti, mut lunghezza) = (0u32, 0u32);
    let esito = unsafe { GetPackagesByPackageFamily(PCWSTR(famiglia.as_ptr()), &mut quanti, None, &mut lunghezza, PWSTR::null()) };
    if esito != ERROR_INSUFFICIENT_BUFFER || quanti == 0 {
        return Vec::new();
    }
    let mut nomi = vec![PWSTR::null(); quanti as usize];
    let mut buffer = vec![0u16; lunghezza as usize];
    let esito = unsafe { GetPackagesByPackageFamily(PCWSTR(famiglia.as_ptr()), &mut quanti, Some(nomi.as_mut_ptr()), &mut lunghezza, PWSTR(buffer.as_mut_ptr())) };
    if esito != ERROR_SUCCESS {
        return Vec::new();
    }
    nomi.iter().take(quanti as usize).filter_map(|nome| cartella_di(PCWSTR(nome.0))).collect()
}

fn cartella_di(nome_completo: PCWSTR) -> Option<PathBuf> {
    let mut lunghezza = 0u32;
    let esito = unsafe { GetPackagePathByFullName(nome_completo, &mut lunghezza, PWSTR::null()) };
    if esito != ERROR_INSUFFICIENT_BUFFER || lunghezza == 0 {
        return None;
    }
    let mut buffer = vec![0u16; lunghezza as usize];
    let esito = unsafe { GetPackagePathByFullName(nome_completo, &mut lunghezza, PWSTR(buffer.as_mut_ptr())) };
    (esito == ERROR_SUCCESS).then(|| PathBuf::from(OsString::from_wide(&buffer[..lunghezza.saturating_sub(1) as usize])))
}
