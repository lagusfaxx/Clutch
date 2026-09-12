export function aSlug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export function slugUnico(base: string, tomados: Set<string>): string {
  const raiz = aSlug(base) || 'jugador'
  if (!tomados.has(raiz)) return raiz
  let n = 2
  while (tomados.has(`${raiz}-${n}`)) n += 1
  return `${raiz}-${n}`
}
