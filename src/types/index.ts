export type TenantId = string;
export type Phone = string;
export interface WAEvent {
  tenantId: TenantId;
  userPhone: Phone;
  message: string;
  messageId: string;
}
