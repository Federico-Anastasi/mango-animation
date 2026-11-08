// Su quale indirizzo il telefono trova questo computer, in casa (e fuori casa, quello di Tailscale). Si usa l'indirizzo numerico e non il nome
// `<computer>.local`: sull'iPhone il nome funziona solo se Windows risponde alle richieste mDNS,
// e non è garantito (Comandi Rapidi ha dato anche «server non trovato» con i nomi `.local`).
import { networkInterfaces, type NetworkInterfaceInfo } from "node:os"

const VIRTUALI = /vethernet|wsl|virtualbox|vmware|docker|hyper-v|loopback|vpn|tailscale|zerotier|bluetooth|tap-|tun/i

function priorita(indirizzo: string): number {
  if (indirizzo.startsWith("192.168.")) return 0
  if (indirizzo.startsWith("10.")) return 1
  const seconda = Number(indirizzo.split(".")[1])
  if (indirizzo.startsWith("172.") && seconda >= 16 && seconda <= 31) return 2
  return -1
}

/** Gli indirizzi privati del computer, dal più probabile («Wi-Fi» di casa) al meno. */
export function indirizziLocali(
  interfacce: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): string[] {
  return Object.entries(interfacce)
    .filter(([nome]) => !VIRTUALI.test(nome))
    .flatMap(([, voci]) => voci ?? [])
    .filter((v) => v.family === "IPv4" && !v.internal)
    .map((v) => v.address)
    .filter((a) => priorita(a) >= 0)
    .sort((a, b) => priorita(a) - priorita(b))
}

/** Gli indirizzi che Tailscale dà a questo computer: IPv4 in 100.64.0.0/10, qualunque nome abbia l'interfaccia. */
export function indirizziTailscale(interfacce: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces()): string[] {
  return Object.values(interfacce)
    .flatMap((voci) => voci ?? [])
    .filter((v) => v.family === "IPv4" && !v.internal)
    .map((v) => v.address)
    .filter((a) => {
      const [primo, secondo] = a.split(".").map(Number)
      return primo === 100 && secondo! >= 64 && secondo! <= 127
    })
}

/** Un indirizzo IPv4 scritto in numeri (`192.168.1.20`), non un nome. */
export const indirizzoNumerico = (nome: string): boolean => /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(nome) && nome.split(".").every((n) => Number(n) <= 255)
