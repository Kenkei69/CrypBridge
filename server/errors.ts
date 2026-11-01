export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const conflict = (message: string) =>
  new AppError(409, "INVALID_SIMULATION_STAGE", message);
