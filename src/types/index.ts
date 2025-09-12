export type TenantId = string;
export type Phone = string;
export interface WAEvent {
  id: string;
  from: Phone;
  text?: string;
}
