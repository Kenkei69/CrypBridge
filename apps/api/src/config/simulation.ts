/** Hosting in production requires explicit opt-in; real payments remain unsupported. */
export function simulationAllowed(appEnv = process.env.APP_ENV || 'development'): boolean {
  if (process.env.SIMULATION_MODE === 'false' || process.env.SIMULATION_MODE === '0') return false;
  const production = appEnv === 'production' || process.env.NODE_ENV === 'production';
  return !production || (process.env.ALLOW_HOSTED_SIMULATION === 'true' && process.env.SIMULATION_MODE === 'true');
}
