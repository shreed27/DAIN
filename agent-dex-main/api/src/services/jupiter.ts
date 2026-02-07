import { Connection, VersionedTransaction, Keypair } from '@solana/web3.js';

// Slippage validation bounds
const SLIPPAGE_BOUNDS = {
  MIN_BPS: 1,      // 0.01%
  MAX_BPS: 500,    // 5%
  DEFAULT_BPS: 50, // 0.5%
};

function validateSlippage(slippageBps?: number): number {
  if (slippageBps === undefined) return SLIPPAGE_BOUNDS.DEFAULT_BPS;

  if (slippageBps < SLIPPAGE_BOUNDS.MIN_BPS) {
    throw new Error(`Slippage ${slippageBps} bps is below minimum ${SLIPPAGE_BOUNDS.MIN_BPS} (0.01%)`);
  }
  if (slippageBps > SLIPPAGE_BOUNDS.MAX_BPS) {
    throw new Error(`Slippage ${slippageBps} bps exceeds maximum ${SLIPPAGE_BOUNDS.MAX_BPS} (5%)`);
  }
  return slippageBps;
}

const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6';
const JUPITER_PRICE_API = 'https://price.jup.ag/v4';
const HELIUS_RPC = process.env.HELIUS_RPC_URL || 'https://calla-zffb4d-fast-mainnet.helius-rpc.com';

const connection = new Connection(HELIUS_RPC, 'confirmed');

export interface QuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  contextSlot?: number;
  timeTaken?: number;
}

export async function getQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps?: number;
}): Promise<QuoteResponse> {
  const { inputMint, outputMint, amount } = params;
  // Validate slippage bounds
  const slippageBps = validateSlippage(params.slippageBps);

  const url = new URL(`${JUPITER_QUOTE_API}/quote`);
  url.searchParams.set('inputMint', inputMint);
  url.searchParams.set('outputMint', outputMint);
  url.searchParams.set('amount', amount);
  url.searchParams.set('slippageBps', slippageBps.toString());

  const res = await fetch(url.toString());
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Jupiter quote failed: ${res.status} — ${error}`);
  }

  return res.json() as Promise<QuoteResponse>;
}

export async function executeSwap(params: {
  quoteResponse: QuoteResponse;
  keypair: Keypair;
}): Promise<{ txSignature: string; inputAmount: string; outputAmount: string }> {
  const { quoteResponse, keypair } = params;

  // Get swap transaction from Jupiter
  const swapRes = await fetch(`${JUPITER_QUOTE_API}/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    }),
  });

  if (!swapRes.ok) {
    const error = await swapRes.text();
    throw new Error(`Jupiter swap failed: ${swapRes.status} — ${error}`);
  }

  const { swapTransaction } = (await swapRes.json()) as { swapTransaction: string };

  // Get blockhash BEFORE sending (fixes race condition)
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

  // Deserialize, sign, and send
  const txBuf = Buffer.from(swapTransaction, 'base64');
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([keypair]);

  const rawTx = tx.serialize();
  const txSignature = await connection.sendRawTransaction(rawTx, {
    // Default to false for safety - preflight catches errors before they hit the blockchain
    skipPreflight: process.env.SOLANA_SKIP_PREFLIGHT === 'true',
    maxRetries: 3,
  });

  // Confirm with the SAME blockhash used in the transaction
  await connection.confirmTransaction({
    signature: txSignature,
    blockhash,
    lastValidBlockHeight,
  }, 'confirmed');

  return {
    txSignature,
    inputAmount: quoteResponse.inAmount,
    outputAmount: quoteResponse.outAmount,
  };
}

export async function getTokenPrice(mint: string): Promise<{ price: number; mintSymbol?: string } | null> {
  const res = await fetch(`${JUPITER_PRICE_API}/price?ids=${mint}`);
  if (!res.ok) return null;

  const data = (await res.json()) as { data: Record<string, any> };
  const priceData = data.data?.[mint];
  if (!priceData) return null;

  return {
    price: priceData.price,
    mintSymbol: priceData.mintSymbol,
  };
}

export async function getMultipleTokenPrices(mints: string[]): Promise<Record<string, { price: number; mintSymbol?: string }>> {
  const ids = mints.join(',');
  const res = await fetch(`${JUPITER_PRICE_API}/price?ids=${ids}`);
  if (!res.ok) return {};

  const data = (await res.json()) as { data: Record<string, any> };
  const result: Record<string, { price: number; mintSymbol?: string }> = {};

  for (const [mint, priceData] of Object.entries(data.data || {})) {
    const pd = priceData as any;
    result[mint] = {
      price: pd.price,
      mintSymbol: pd.mintSymbol,
    };
  }

  return result;
}

export async function getTrendingTokens(): Promise<any[]> {
  // Use Jupiter's token list sorted by volume
  try {
    const res = await fetch('https://token.jup.ag/strict');
    if (!res.ok) return [];
    const tokens = await res.json();
    // Return top 20 tokens (they're roughly sorted by popularity)
    return (tokens as any[]).slice(0, 20).map((t: any) => ({
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      decimals: t.decimals,
      logoURI: t.logoURI,
    }));
  } catch {
    return [];
  }
}

export { connection };
