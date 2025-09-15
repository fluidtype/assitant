import axios, { type AxiosInstance } from 'axios';

import { config } from '@config/env.config';

let instance: AxiosInstance | null = null;

function createInstance(): AxiosInstance {
  const { WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET } = config;
  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN || !WHATSAPP_APP_SECRET) {
    throw new Error('WhatsApp environment configuration is incomplete');
  }
  return axios.create({
    baseURL: `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}`,
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    timeout: 10000,
    validateStatus: (s) => s < 500,
  });
}

function getAxios(): AxiosInstance {
  if (!instance) {
    instance = createInstance();
  }
  return instance;
}

export async function sendWhatsAppMessage(payload: object): Promise<any> {
  return getAxios().post('/messages', payload);
}

export { getAxios as getWhatsAppAxios };
