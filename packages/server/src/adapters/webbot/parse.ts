import { WEB_BOT_AUTH_HEADERS, parseStructuredField } from '../../http/headers';

export interface WebBotAuthHeaders {
  signature?: string;
  signatureInput?: string;
  signatureAgent?: string;
}

export function parseWebBotAuthHeaders(
  headers: Record<string, string | string[] | undefined>
): WebBotAuthHeaders {
  const signature = headers[WEB_BOT_AUTH_HEADERS.SIGNATURE];
  const signatureInput = headers[WEB_BOT_AUTH_HEADERS.SIGNATURE_INPUT];
  const signatureAgent = headers[WEB_BOT_AUTH_HEADERS.SIGNATURE_AGENT];

  return {
    signature: Array.isArray(signature) ? signature[0] : signature,
    signatureInput: Array.isArray(signatureInput) ? signatureInput[0] : signatureInput,
    signatureAgent: Array.isArray(signatureAgent) 
      ? parseStructuredField(signatureAgent[0] || '') || undefined
      : signatureAgent 
        ? parseStructuredField(signatureAgent) || undefined
        : undefined,
  };
}

export function hasRequiredWebBotAuthHeaders(headers: WebBotAuthHeaders): boolean {
  return !!(headers.signature && headers.signatureInput && headers.signatureAgent);
}

export interface WebBotAuthHint {
  hasSignature: boolean;
  signatureAgent?: string;
}

export function detectWebBotAuthHint(
  headers: Record<string, string | string[] | undefined>
): WebBotAuthHint {
  const parsed = parseWebBotAuthHeaders(headers);
  
  return {
    hasSignature: !!(parsed.signature && parsed.signatureInput),
    signatureAgent: parsed.signatureAgent,
  };
}