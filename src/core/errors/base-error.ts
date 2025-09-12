export abstract class BaseError extends Error {
  constructor(public code: string, public status: number, message?: string) {
    super(message);
  }
}
