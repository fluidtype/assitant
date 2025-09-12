import { NotImplementedError } from '../errors/not-implemented.error.js';

export class TenantRepository {
  findById(_id: string) {
    throw new NotImplementedError();
  }
}
