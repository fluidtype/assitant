import { NotImplementedError } from '../../core/errors/not-implemented.error.js';

export class WhatsAppService {
  sendMessage(_to: string, _message: string) {
    throw new NotImplementedError();
  }
}
