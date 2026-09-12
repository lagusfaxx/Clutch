/**
 * Corre una vez al levantar el servidor, antes de atender requests.
 * Web, API, cola y bot viven en el mismo proceso Node (§5).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.RUN_BACKGROUND !== 'true') return

  const { startWorkers, stopWorkers } = await import('./src/server/jobs/boss')
  const { startBot, stopBot } = await import('./src/server/discord/bot')

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
