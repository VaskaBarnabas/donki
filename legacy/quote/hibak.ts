// Az ajánlatmotor JSON-RPC hibakódjai (szabványos + üzleti).

export const HIBAKOD = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  UNAUTHORIZED: -32001,
  DISCOUNT_APPROVAL_REQUIRED: -32010,
  QUOTE_EXPIRED: -32011,
  INVALID_STATE: -32012,
  PRODUCT_INACTIVE: -32013,
} as const

export class RpcHiba extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown
  ) {
    super(message)
  }
}
