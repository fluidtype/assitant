import { NotImplementedError } from '../errors/not-implemented.error.js';

export class BookingRepository {
  create(_booking: unknown) {
    throw new NotImplementedError();
  }
}
