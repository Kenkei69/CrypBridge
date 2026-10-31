import { buildApp } from './app.js';
import { getConfig } from './config/env.js';

async function main() {
  const config = getConfig();

  console.log(`[BOOT] Initializing x402 Guardian API in ${config.APP_ENV} mode...`);
  console.log(`[BOOT] Simulation mode: ${config.SIMULATION_MODE}`);
  console.log(`[BOOT] Database target: ${config.DATABASE_URL.replace(/:\/\/.*@/, '://[REDACTED]@')}`);

  const app = await buildApp(config);

  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    console.log(`[SERVER] API listening on http://${config.HOST}:${config.PORT}`);
    console.log(`[SERVER] Health check ready at http://${config.HOST}:${config.PORT}/live`);
  } catch (err) {
    app.log.fatal(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[FATAL] Failed to start server:', err);
  process.exit(1);
});
