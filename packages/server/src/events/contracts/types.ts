export interface EventEnvelope<T = unknown> {
  id: string;
  version: "0.9.6";
  type: string;
  timestamp: string;
  causation_id?: string;
  correlation_id?: string;
  metadata?: Record<string, unknown>;
  payload: T;
}

export interface NegotiationStartedPayload {
  negotiation_id: string;
  agent_id: string;
  resource?: string;
  purpose?: string[];
  initial_terms?: Record<string, unknown>;
}

export interface OfferMadePayload {
  negotiation_id: string;
  offer_id: string;
  from: string;
  to: string;
  terms: Record<string, unknown>;
  expires_at?: string;
}

export interface TermsAcceptedPayload {
  negotiation_id: string;
  offer_id: string;
  accepted_by: string;
  accepted_at: string;
  final_terms: Record<string, unknown>;
}

export interface ReceiptIssuedPayload {
  receipt_id: string;
  negotiation_id: string;
  issued_to: string;
  issued_at: string;
  amount?: {
    value: string;
    currency: string;
  };
  tokens?: {
    input?: number;
    output?: number;
    reasoning?: number;
    tool?: number;
  };
  signature?: string;
}

export type ProtocolEvent =
  | EventEnvelope<NegotiationStartedPayload>
  | EventEnvelope<OfferMadePayload>
  | EventEnvelope<TermsAcceptedPayload>
  | EventEnvelope<ReceiptIssuedPayload>;