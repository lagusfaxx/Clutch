/**
 * Corre una vez al levantar el servidor, antes de atender requests.
 * Web, API, cola y bot viven en el mismo proceso Node (§5).
 *
 * Tiene que vivir en src/, al lado de app/: con carpeta src, Next ignora
 * un instrumentation.ts puesto en la raíz del repositorio y el worker nunca
 * arranca, sin ningún error visible.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // Antes que la cola y el bot, y sin depender de RUN_BACKGROUND: si el
  // panel no tiene dueño, no hay a quién pedirle que arregle lo demás.
  const { asegurarAdminInicial } = await import('@/server/services/admin-inicial')
  await asegurarAdminInicial().catch((e) => console.error('[admin] no se pudo asegurar la cuenta inicial:', e))

  if (process.env.RUN_BACKGROUND !== 'true') return

  const { startWorkers, stopWorkers } = await import('@/server/jobs/boss')
  const { startBot, stopBot } = await import('@/server/discord/bot')

  await startWorkers()
  await startBot()

  // Coolify manda SIGTERM en cada redeploy: hay que soltar la cola y el bot.
  let cerrando = false
  const cerrar = async (senal: string) => {
    if (cerrando) return
    cerrando = true
    console.log(`[proceso] ${senal}: cerrando cola y bot`)
    await Promise.allSettled([stopWorkers(), stopBot()])
    process.exit(0)
  }
  process.on('SIGTERM', () => void cerrar('SIGTERM'))
  process.on('SIGINT', () => void cerrar('SIGINT'))
}
