'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { VersionedTransaction } from '@solana/web3.js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowDownUp,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Wallet,
  RefreshCw,
  Shield,
  Brain,
  TrendingUp,
  TrendingDown,
  Eye,
  Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTokenAnalysis, type TokenAnalysisResult } from '@/lib/useTokenAnalysis';
import toast from 'react-hot-toast';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:4000';

// Common token list
const TOKENS = [
  { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112', decimals: 9, logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png' },
  { symbol: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png' },
  { symbol: 'USDT', mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6, logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg' },
  { symbol: 'JUP', mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', decimals: 6, logo: 'https://static.jup.ag/jup/icon.png' },
  { symbol: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5, logo: 'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I' },
  { symbol: 'WIF', mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', decimals: 6, logo: 'https://bafkreibk3covs5ltyqxa272uodhber6pq2cykudukprdz5cscjhqlmdv74.ipfs.nftstorage.link' },
  { symbol: 'RAY', mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', decimals: 6, logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png' },
];

interface QuoteData {
  inputAmount: string;
  outputAmount: string;
  priceImpact: string;
  routePlan: Array<{ protocol: string; percent: number }>;
  minimumReceived: string;
}

type SwapStatus = 'idle' | 'quoting' | 'ready' | 'signing' | 'sending' | 'confirming' | 'success' | 'error';

// AI Analysis result display config
const signalConfig: Record<string, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
  strong_buy: {
    color: 'text-green-400',
    bg: 'bg-green-500/20 border-green-500/30',
    icon: <TrendingUp className="h-4 w-4 text-green-400" />,
    label: 'Strong Buy',
  },
  buy: {
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/20 border-emerald-500/30',
    icon: <TrendingUp className="h-4 w-4 text-emerald-400" />,
    label: 'Buy',
  },
  watch: {
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/20 border-yellow-500/30',
    icon: <Eye className="h-4 w-4 text-yellow-400" />,
    label: 'Watch',
  },
  avoid: {
    color: 'text-orange-400',
    bg: 'bg-orange-500/20 border-orange-500/30',
    icon: <AlertCircle className="h-4 w-4 text-orange-400" />,
    label: 'Avoid',
  },
  sell: {
    color: 'text-red-400',
    bg: 'bg-red-500/20 border-red-500/30',
    icon: <TrendingDown className="h-4 w-4 text-red-400" />,
    label: 'Sell',
  },
};

export function SwapWidget() {
  const { publicKey, signTransaction, connected } = useWallet();
  const { connection } = useConnection();
  const { analyze, isAnalyzing, result: aiResult, clearResult } = useTokenAnalysis();

  const [inputToken, setInputToken] = useState(TOKENS[0]); // SOL
  const [outputToken, setOutputToken] = useState(TOKENS[1]); // USDC
  const [inputAmount, setInputAmount] = useState('');
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [status, setStatus] = useState<SwapStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [slippageBps, setSlippageBps] = useState(50); // 0.5%
  const [showAiPanel, setShowAiPanel] = useState(false);

  // Fetch quote when input changes
  const fetchQuote = useCallback(async () => {
    if (!inputAmount || parseFloat(inputAmount) <= 0) {
      setQuote(null);
      return;
    }

    setStatus('quoting');
    setError(null);

    try {
      const amountInSmallestUnit = Math.floor(
        parseFloat(inputAmount) * Math.pow(10, inputToken.decimals)
      ).toString();

      const response = await fetch(
        `${GATEWAY_URL}/api/v1/execution/quote`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inputMint: inputToken.mint,
            outputMint: outputToken.mint,
            amount: amountInSmallestUnit,
            slippageBps,
          }),
        }
      );

      const data = await response.json();

      if (data.success && data.data) {
        const outputAmountFormatted = (
          parseInt(data.data.outputAmount) / Math.pow(10, outputToken.decimals)
        ).toFixed(outputToken.decimals > 4 ? 4 : outputToken.decimals);

        setQuote({
          inputAmount: inputAmount,
          outputAmount: outputAmountFormatted,
          priceImpact: data.data.priceImpact || '0.00',
          routePlan: data.data.routePlan || [],
          minimumReceived: (parseFloat(outputAmountFormatted) * (1 - slippageBps / 10000)).toFixed(4),
        });
        setStatus('ready');
      } else {
        throw new Error(data.error || 'Failed to get quote');
      }
    } catch (err) {
      console.error('Quote error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch quote';
      setError(errorMsg);
      toast.error(errorMsg);
      setStatus('error');
      setQuote(null);
    }
  }, [inputAmount, inputToken, outputToken, slippageBps]);

  // Debounced quote fetching
  useEffect(() => {
    const timer = setTimeout(fetchQuote, 500);
    return () => clearTimeout(timer);
  }, [fetchQuote]);

  // Execute swap
  const executeSwap = async () => {
    if (!publicKey || !signTransaction || !quote) {
      setError('Please connect your wallet');
      toast.error('Please connect your wallet');
      return;
    }

    setStatus('signing');
    setError(null);
    setTxSignature(null);

    try {
      const amountInSmallestUnit = Math.floor(
        parseFloat(inputAmount) * Math.pow(10, inputToken.decimals)
      ).toString();

      // Get swap transaction from gateway
      const response = await fetch(`${GATEWAY_URL}/api/v1/execution/swap-transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputMint: inputToken.mint,
          outputMint: outputToken.mint,
          amount: amountInSmallestUnit,
          slippageBps,
          userPublicKey: publicKey.toBase58(),
        }),
      });

      const data = await response.json();

      if (!data.success || !data.data?.swapTransaction) {
        throw new Error(data.error || 'Failed to create swap transaction');
      }

      // Deserialize transaction
      const txBuf = Buffer.from(data.data.swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(txBuf);

      // Sign with wallet
      setStatus('signing');
      const signedTx = await signTransaction(transaction);

      // Send transaction
      setStatus('sending');
      const rawTx = signedTx.serialize();
      const signature = await connection.sendRawTransaction(rawTx, {
        skipPreflight: false,
        maxRetries: 3,
      });

      setTxSignature(signature);
      setStatus('confirming');

      // Confirm transaction
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      setStatus('success');
      toast.success(`Swapped ${inputAmount} ${inputToken.symbol} for ${quote.outputAmount} ${outputToken.symbol}`);

      // Reset after success
      setTimeout(() => {
        setInputAmount('');
        setQuote(null);
        setStatus('idle');
        setTxSignature(null);
      }, 5000);

    } catch (err) {
      console.error('Swap error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Swap failed';
      setError(errorMsg);
      toast.error(errorMsg);
      setStatus('error');
    }
  };

  // Swap tokens
  const handleSwapTokens = () => {
    const temp = inputToken;
    setInputToken(outputToken);
    setOutputToken(temp);
    setInputAmount('');
    setQuote(null);
    clearResult();
  };

  // AI Analysis handler
  const handleAiAnalysis = async () => {
    if (!quote) return;

    const rate = parseFloat(quote.outputAmount) / parseFloat(inputAmount);

    await analyze({
      symbol: outputToken.symbol,
      mint: outputToken.mint,
      currentPrice: rate,
      // In a real implementation, these would come from a price API
      priceChange24h: Math.random() * 20 - 10, // Simulated
      volume24h: Math.random() * 1000000, // Simulated
      liquidity: 50000, // Simulated
    });

    setShowAiPanel(true);
  };

  const isLoading = ['quoting', 'signing', 'sending', 'confirming'].includes(status);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 w-full max-w-md">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <ArrowDownUp className="h-5 w-5 text-cyan-400" />
          Swap
        </h3>
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-green-400" />
          <span className="text-xs text-zinc-400">Jupiter Powered</span>
        </div>
      </div>

      {/* Input Token */}
      <div className="p-4 rounded-xl bg-black/30 border border-white/5 mb-2">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-zinc-400">You Pay</span>
          {connected && (
            <button
              onClick={() => setInputAmount('1')}
              className="text-xs text-cyan-400 hover:text-cyan-300"
            >
              Max
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="number"
            value={inputAmount}
            onChange={(e) => setInputAmount(e.target.value)}
            placeholder="0.00"
            className="flex-1 bg-transparent text-2xl font-semibold text-white outline-none placeholder:text-zinc-600"
            disabled={!connected}
          />
          <select
            value={inputToken.symbol}
            onChange={(e) => setInputToken(TOKENS.find(t => t.symbol === e.target.value) || TOKENS[0])}
            className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm font-medium"
          >
            {TOKENS.map(token => (
              <option key={token.mint} value={token.symbol} className="bg-zinc-900">
                {token.symbol}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Swap Button */}
      <div className="flex justify-center -my-3 relative z-10">
        <button
          onClick={handleSwapTokens}
          className="w-10 h-10 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center hover:bg-zinc-700 transition-colors"
        >
          <ArrowDownUp className="h-4 w-4 text-white" />
        </button>
      </div>

      {/* Output Token */}
      <div className="p-4 rounded-xl bg-black/30 border border-white/5 mt-2">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-zinc-400">You Receive</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 text-2xl font-semibold text-white">
            {status === 'quoting' ? (
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            ) : quote ? (
              quote.outputAmount
            ) : (
              <span className="text-zinc-600">0.00</span>
            )}
          </div>
          <select
            value={outputToken.symbol}
            onChange={(e) => setOutputToken(TOKENS.find(t => t.symbol === e.target.value) || TOKENS[1])}
            className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm font-medium"
          >
            {TOKENS.map(token => (
              <option key={token.mint} value={token.symbol} className="bg-zinc-900">
                {token.symbol}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Quote Details */}
      {quote && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-4 p-3 rounded-lg bg-black/20 border border-white/5 text-xs space-y-2"
        >
          <div className="flex justify-between">
            <span className="text-zinc-400">Rate</span>
            <span className="text-white">
              1 {inputToken.symbol} = {(parseFloat(quote.outputAmount) / parseFloat(inputAmount)).toFixed(4)} {outputToken.symbol}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Price Impact</span>
            <span className={cn(
              parseFloat(quote.priceImpact) > 1 ? 'text-yellow-400' : 'text-green-400'
            )}>
              {parseFloat(quote.priceImpact).toFixed(2)}%
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Min. Received</span>
            <span className="text-white">{quote.minimumReceived} {outputToken.symbol}</span>
          </div>
          {quote.routePlan.length > 0 && (
            <div className="flex justify-between">
              <span className="text-zinc-400">Route</span>
              <span className="text-white">{quote.routePlan.map(r => r.protocol).join(' → ')}</span>
            </div>
          )}
        </motion.div>
      )}

      {/* Slippage Setting */}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-zinc-400">Slippage Tolerance</span>
        <div className="flex gap-1">
          {[50, 100, 200].map(bps => (
            <button
              key={bps}
              onClick={() => setSlippageBps(bps)}
              className={cn(
                "px-2 py-1 rounded text-xs",
                slippageBps === bps
                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                  : "bg-white/5 text-zinc-400 hover:bg-white/10"
              )}
            >
              {(bps / 100).toFixed(1)}%
            </button>
          ))}
        </div>
      </div>

      {/* AI Analysis Button */}
      {quote && connected && (
        <button
          onClick={handleAiAnalysis}
          disabled={isAnalyzing}
          className="mt-4 w-full py-3 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-400 font-medium flex items-center justify-center gap-2 hover:bg-purple-500/30 transition-all disabled:opacity-50"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Brain className="h-4 w-4" />
              Analyze with AI
              <Sparkles className="h-3 w-3" />
            </>
          )}
        </button>
      )}

      {/* AI Analysis Result Panel */}
      <AnimatePresence>
        {showAiPanel && aiResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 overflow-hidden"
          >
            <div className={cn(
              "p-4 rounded-xl border",
              signalConfig[aiResult.signal]?.bg || signalConfig.watch.bg
            )}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-purple-400" />
                  <span className="font-semibold text-white">AI Analysis</span>
                </div>
                <div className="flex items-center gap-2">
                  {signalConfig[aiResult.signal]?.icon}
                  <span className={cn(
                    "text-sm font-bold uppercase",
                    signalConfig[aiResult.signal]?.color || 'text-zinc-400'
                  )}>
                    {signalConfig[aiResult.signal]?.label || aiResult.signal}
                  </span>
                </div>
              </div>

              <p className="text-sm text-zinc-300 leading-relaxed mb-3">
                {aiResult.reasoning}
              </p>

              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Confidence</span>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-20 bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${aiResult.confidence}%` }}
                      transition={{ duration: 0.5 }}
                      className={cn(
                        "h-full",
                        aiResult.confidence >= 70 ? 'bg-purple-500' :
                        aiResult.confidence >= 50 ? 'bg-purple-400' : 'bg-purple-300'
                      )}
                    />
                  </div>
                  <span className={signalConfig[aiResult.signal]?.color || 'text-zinc-400'}>
                    {aiResult.confidence}%
                  </span>
                </div>
              </div>

              {aiResult.risk && (
                <div className="mt-3 p-2 rounded-lg bg-black/30 text-xs">
                  <span className="text-orange-400 font-medium">Risk: </span>
                  <span className="text-zinc-400">{aiResult.risk}</span>
                </div>
              )}

              {aiResult.strategy && (
                <div className="mt-2 p-2 rounded-lg bg-black/30 text-xs">
                  <span className="text-cyan-400 font-medium">Strategy: </span>
                  <span className="text-zinc-400">{aiResult.strategy}</span>
                </div>
              )}

              <button
                onClick={() => setShowAiPanel(false)}
                className="mt-3 text-xs text-zinc-500 hover:text-zinc-300"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Message */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
          <span className="text-xs text-red-400">{error}</span>
        </motion.div>
      )}

      {/* Success Message */}
      {status === 'success' && txSignature && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20"
        >
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-green-400" />
            <span className="text-sm text-green-400 font-medium">Swap Successful!</span>
          </div>
          <a
            href={`https://solscan.io/tx/${txSignature}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
          >
            View on Solscan <ExternalLink className="h-3 w-3" />
          </a>
        </motion.div>
      )}

      {/* Swap Button */}
      {!connected ? (
        <button
          disabled
          className="w-full mt-6 py-4 rounded-xl bg-zinc-700 text-zinc-400 font-semibold flex items-center justify-center gap-2"
        >
          <Wallet className="h-5 w-5" />
          Connect Wallet to Swap
        </button>
      ) : (
        <button
          onClick={executeSwap}
          disabled={!quote || isLoading || status === 'success'}
          className={cn(
            "w-full mt-6 py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all",
            !quote || isLoading || status === 'success'
              ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
              : "bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-400 hover:to-blue-400"
          )}
        >
          {status === 'quoting' && <><Loader2 className="h-5 w-5 animate-spin" /> Getting Quote...</>}
          {status === 'signing' && <><Loader2 className="h-5 w-5 animate-spin" /> Sign in Wallet...</>}
          {status === 'sending' && <><Loader2 className="h-5 w-5 animate-spin" /> Sending Transaction...</>}
          {status === 'confirming' && <><Loader2 className="h-5 w-5 animate-spin" /> Confirming...</>}
          {status === 'success' && <><CheckCircle2 className="h-5 w-5" /> Swap Complete!</>}
          {status === 'ready' && <>Swap {inputToken.symbol} for {outputToken.symbol}</>}
          {status === 'idle' && <>Enter an amount</>}
          {status === 'error' && <><RefreshCw className="h-5 w-5" /> Try Again</>}
        </button>
      )}
    </div>
  );
}

export default SwapWidget;
