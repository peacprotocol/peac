import {
  JsonRpcProvider,
  Wallet,
  Contract,
  Interface,
  TypedDataDomain,
  TypedDataField,
  verifyTypedData,
  id,
} from 'ethers';
import type { JWK } from 'jose';
import { getRedis } from '../utils/redis-pool';
import { metrics } from '../metrics';
import { canonicalize } from '../crypto/jcs';
import { mintSession } from '../core/session';
import { config } from '../config';

type Mode = 'DIRECT_USDC' | 'SETTLEMENT_CONTRACT';

const {
  x402: { mode, chainId, usdcAddress, contractAddress, rpcUrl, privateKey, timeoutMs },
  session: { ttl },
  redistribution,
} = config as {
  x402: {
    mode: Mode;
    chainId: number;
    usdcAddress?: string;
    contractAddress?: string;
    rpcUrl: string;
    privateKey: string;
    timeoutMs: number;
  };
  session: { ttl: number };
  redistribution: { enabled: boolean; feeBps: number; treasury?: string };
};

// Validate config at module init
if (!rpcUrl) throw new Error('config_rpc_url_required');
if (!privateKey) throw new Error('config_private_key_required');
if (!chainId || Number.isNaN(chainId)) throw new Error('config_chain_id_required');
if (mode !== 'DIRECT_USDC' && mode !== 'SETTLEMENT_CONTRACT')
  throw new Error('config_invalid_mode');
if (mode === 'DIRECT_USDC' && !usdcAddress) throw new Error('config_usdc_address_required');
if (mode === 'SETTLEMENT_CONTRACT' && !contractAddress)
  throw new Error('config_contract_address_required');

const provider = new JsonRpcProvider(rpcUrl);
const signer = new Wallet(privateKey, provider);

const ERC20_IFACE = new Interface(['function transfer(address to, uint256 amount) returns (bool)']);
const X402_IFACE = new Interface([
  'function settle(address recipient, uint256 amount, bytes32 nonce) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
]);

const PaymentTypes: Record<string, TypedDataField[]> = {
  Payment: [
    { name: 'agentId', type: 'string' },
    { name: 'nonce', type: 'string' },
    { name: 'recipient', type: 'string' },
    { name: 'amount', type: 'string' },
    { name: 'currency', type: 'string' },
  ],
};

function domain(verifyingContract: string): TypedDataDomain {
  return { name: 'PEAC x402', version: '1', chainId, verifyingContract };
}

function isNonZeroUintString(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9]+$/.test(s) && s !== '0';
}

function isHexAddress(s: unknown): s is string {
  return typeof s === 'string' && /^0x[0-9a-fA-F]{40}$/.test(s);
}

// Payment amount limits (1 to 1,000,000,000 units)
const MIN_PAYMENT_AMOUNT = BigInt('1');
const MAX_PAYMENT_AMOUNT = BigInt('1000000000');

function withTimeout<T>(p: Promise<T>, ms: number, tag: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(tag)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export class X402Provider {
  /**
   * Process a payment and return a session token on success.
   */
  async processPayment(input: {
    agentId: string;
    nonce: string;
    recipient: string;
    amount: string;
    currency: 'USDC' | string;
    signature: string;
    purpose?: string;
    resource?: string;
    agentJwk?: JWK; // <— type tightened
  }): Promise<string> {
    if (!input || typeof input !== 'object') throw new Error('bad_request');

    const { agentId, nonce, recipient, amount, currency, signature, purpose, resource, agentJwk } =
      input;

    if (!isHexAddress(agentId)) throw new Error('agent_invalid');
    if (!nonce || typeof nonce !== 'string') throw new Error('bad_request');
    if (!isHexAddress(recipient)) throw new Error('bad_request');
    if (!isNonZeroUintString(amount)) throw new Error('bad_request');
    if (currency !== 'USDC') throw new Error('wrong_currency');

    // Validate payment amount limits
    const amountBigInt = BigInt(amount);
    if (amountBigInt < MIN_PAYMENT_AMOUNT) throw new Error('amount_too_small');
    if (amountBigInt > MAX_PAYMENT_AMOUNT) throw new Error('amount_too_large');

    // Idempotency: SET key NX EX 86400; keep on failures
    const redis = getRedis();
    const idemKey = 'x402:nonce:' + canonicalize({ chainId, agentId, nonce });
    const setRes = await redis.set(idemKey, Date.now().toString(), 'EX', 86400, 'NX');
    if (setRes !== 'OK') throw new Error('idempotent_replay');

    // EIP-712 verification
    const verifyingContract = mode === 'DIRECT_USDC' ? usdcAddress : contractAddress;
    if (!verifyingContract) {
      throw new Error('missing_contract_address');
    }
    const message = { agentId, nonce, recipient, amount, currency };
    const recovered = verifyTypedData(
      domain(verifyingContract),
      { ...PaymentTypes },
      message,
      signature,
    );

    if (!recovered || typeof recovered !== 'string') {
      throw new Error('agent_invalid');
    }
    if (recovered.toLowerCase() !== agentId.toLowerCase()) {
      throw new Error('agent_invalid');
    }

    // Send real transaction via signer
    let contract: Contract;
    let txPromise: Promise<{
      wait: (confirmations?: number) => Promise<{ status?: number } | null>;
    }>;

    if (mode === 'DIRECT_USDC') {
      contract = new Contract(usdcAddress as string, ERC20_IFACE, signer);
      txPromise = contract.transfer(recipient, amount);
    } else {
      contract = new Contract(contractAddress as string, X402_IFACE, signer);
      const hasSettle = typeof contract.settle === 'function';
      txPromise = hasSettle
        ? contract.settle(recipient, amount, id(nonce))
        : contract.transfer(recipient, amount);
    }

    try {
      const tx = await txPromise;
      const receipt = await withTimeout(tx.wait(1), timeoutMs, 'onchain_timeout');
      if (!receipt || !receipt.status || receipt.status !== 1) {
        metrics.paymentAttempt.inc({ provider: 'x402', outcome: 'failure' });
        throw new Error('onchain_failed');
      }
    } catch (e: unknown) {
      metrics.paymentAttempt.inc({ provider: 'x402', outcome: 'failure' });
      throw new Error(e instanceof Error ? e.message : 'onchain_timeout');
    }

    // Optional redistribution (Preview)
    if (mode === 'DIRECT_USDC') {
      const enabled = !!redistribution?.enabled;
      const feeBps = Number(redistribution?.feeBps || 0);
      const treasury = redistribution?.treasury;

      if (enabled && feeBps > 0 && treasury && isHexAddress(treasury)) {
        try {
          const fee = (BigInt(amount) * BigInt(feeBps)) / 10000n;
          if (fee > 0n) {
            const contract = new Contract(usdcAddress as string, ERC20_IFACE, signer);
            const feeTx = await contract.transfer(treasury, fee.toString());
            const feeReceipt = (await withTimeout(feeTx.wait(1), timeoutMs, 'onchain_timeout')) as {
              status?: number;
            } | null;
            if (!feeReceipt || !feeReceipt.status || feeReceipt.status !== 1) {
              metrics.redistributionTotal.inc({
                outcome: 'failed',
                mode: 'DIRECT_USDC',
              });
            } else {
              metrics.redistributionTotal.inc({
                outcome: 'applied',
                mode: 'DIRECT_USDC',
              });
            }
          } else {
            metrics.redistributionTotal.inc({
              outcome: 'skipped',
              mode: 'DIRECT_USDC',
            });
          }
        } catch {
          metrics.redistributionTotal.inc({
            outcome: 'failed',
            mode: 'DIRECT_USDC',
          });
          // best-effort: do not throw
        }
      } else {
        metrics.redistributionTotal.inc({
          outcome: 'skipped',
          mode: 'DIRECT_USDC',
        });
      }
    } else {
      metrics.redistributionTotal.inc({
        outcome: 'skipped',
        mode: 'SETTLEMENT_CONTRACT',
      });
    }

    // Success: mint a session via existing positional signature
    const token = await mintSession(
      agentId,
      agentJwk, // typed as JWK | undefined
      resource,
      purpose ? [purpose] : [],
      ttl,
    );

    metrics.paymentAttempt.inc({ provider: 'x402', outcome: 'success' });
    return token;
  }
}
