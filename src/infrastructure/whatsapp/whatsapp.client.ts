import axios from 'axios';

import { config } from '@config/env.config';

const instance = axios.create({
  baseURL: `https://graph.facebook.com/v19.0/${config.WHATSAPP_PHONE_NUMBER_ID}`,
  headers: {
    Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

export async function sendWhatsAppMessage(payload: object): Promise<any> {
  return instance.post('/messages', payload);
}

export { instance as whatsappAxios };
