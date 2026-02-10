import { parseArgs } from 'util';
import fs from 'fs';
import path from 'path';
import { Keypair, Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

const { values } = parseArgs({
    options: {
        symbol: { type: 'string' }, // Token Mint to Sell
        private_key: { type: 'string' },
        slippage: { type: 'string' }
    },
});

const { symbol, private_key, slippage } = values;

const DEBUG_LOG = path.join(path.dirname(process.argv[1]), 'solana_debug.log');
fs.appendFileSync(DEBUG_LOG, `${new Date().toISOString()} - Solana Close Position: ${JSON.stringify({ symbol })}\n`);

if (!symbol || !private_key) {
    console.error("Missing required arguments: symbol, private_key");
    process.exit(1);
}

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const JUP_API = 'https://quote-api.jup.ag/v6';
const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

console.log(`Solana Jupiter Pipeline: Closing position (Selling) for ${symbol}...`);

function parsePrivateKey(key) {
    try {
        if (!key.startsWith('0x') && key.length > 60) {
            return Keypair.fromSecretKey(bs58.decode(key));
        }
        const hexKey = key.startsWith('0x') ? key.slice(2) : key;
        const bytes = Buffer.from(hexKey, 'hex');
        return Keypair.fromSecretKey(bytes);
    } catch (e) {
        try {
            const arr = JSON.parse(key);
            return Keypair.fromSecretKey(Uint8Array.from(arr));
        } catch {
            throw new Error(`Invalid private key format: ${e.message}`);
        }
    }
}

async function getTokenBalance(connection, wallet, mint) {
    try {
        const { TOKEN_PROGRAM_ID } = await import('@solana/spl-token');
        const accounts = await connection.getParsedTokenAccountsByOwner(wallet, {
            mint: new PublicKey(mint)
        });

        if (accounts.value.length > 0) {
            const balance = accounts.value[0].account.data.parsed.info.tokenAmount;
            return {
                amount: balance.amount,
                decimals: balance.decimals,
                uiAmount: balance.uiAmount
            };
        }
        return { amount: '0', decimals: 9, uiAmount: 0 };
    } catch {
        return { amount: '0', decimals: 9, uiAmount: 0 };
    }
}

async function closePosition() {
    try {
        console.log(`✅ Pipeline: Parsing wallet...`);
        const wallet = parsePrivateKey(private_key);
        const walletPubkey = wallet.publicKey.toBase58();
        console.log(`   Wallet: ${walletPubkey.slice(0, 6)}...${walletPubkey.slice(-4)}`);

        const connection = new Connection(SOLANA_RPC, 'confirmed');

        // 1. Check token balance
        console.log(`🔍 Checking Wallet Balance for ${symbol}`);
        const balance = await getTokenBalance(connection, wallet.publicKey, symbol);

        fs.appendFileSync(DEBUG_LOG, `${new Date().toISOString()} - Balance: ${JSON.stringify(balance)}\n`);

        if (BigInt(balance.amount) > 0n) {
            console.log(`✅ Found Balance: ${balance.uiAmount} tokens (${balance.amount} raw)`);
            console.log(`🚀 Fetching Quote: Token -> USDC`);

            // 2. Get Quote (Sell entire balance)
            const slippageBps = slippage || '100'; // 1% default for close
            const quoteUrl = `${JUP_API}/quote?inputMint=${symbol}&outputMint=${USDC_MINT}&amount=${balance.amount}&slippageBps=${slippageBps}`;

            const quoteRes = await fetch(quoteUrl);
            if (!quoteRes.ok) {
                throw new Error(`Quote failed: ${quoteRes.status} ${await quoteRes.text()}`);
            }
            const quote = await quoteRes.json();

            if (quote.error) {
                throw new Error(`Jupiter quote error: ${quote.error}`);
            }

            const outputDecimals = 6; // USDC
            const outAmount = parseFloat(quote.outAmount) / Math.pow(10, outputDecimals);
            console.log(`   Quote: ${balance.uiAmount} tokens -> ${outAmount.toFixed(2)} USDC`);
            console.log(`   Price Impact: ${quote.priceImpactPct}%`);

            // 3. Get Swap Transaction
            console.log(`🚀 Building swap transaction...`);

            const swapRes = await fetch(`${JUP_API}/swap`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quoteResponse: quote,
                    userPublicKey: walletPubkey,
                    wrapAndUnwrapSol: true,
                    dynamicComputeUnitLimit: true,
                    prioritizationFeeLamports: 'auto'
                })
            });

            if (!swapRes.ok) {
                throw new Error(`Swap request failed: ${swapRes.status} ${await swapRes.text()}`);
            }
            const swapData = await swapRes.json();

            if (swapData.error) {
                throw new Error(`Jupiter swap error: ${swapData.error}`);
            }

            // 4. Sign and send
            console.log(`✅ Signing transaction...`);
            const swapTxBuf = Buffer.from(swapData.swapTransaction, 'base64');
            const transaction = VersionedTransaction.deserialize(swapTxBuf);
            transaction.sign([wallet]);

            console.log(`🚀 Sending transaction to Solana...`);
            const signature = await connection.sendRawTransaction(transaction.serialize(), {
                skipPreflight: false,
                maxRetries: 3,
                preflightCommitment: 'confirmed'
            });

            console.log(`   Signature: ${signature}`);

            // 5. Confirm
            console.log(`⏳ Confirming transaction...`);
            const confirmation = await connection.confirmTransaction(signature, 'confirmed');

            if (confirmation.value.err) {
                throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
            }

            console.log('✅ Position Closed Successfully!');
            console.log(`   Signature: ${signature}`);
            console.log(`   Explorer: https://solscan.io/tx/${signature}`);

            const logEntry = {
                timestamp: new Date().toISOString(),
                exchange: 'solana_jupiter',
                action: 'close_position',
                symbol,
                amountSold: balance.uiAmount,
                usdcReceived: outAmount,
                signature,
                priceImpact: quote.priceImpactPct
            };

            fs.appendFileSync(DEBUG_LOG, `${new Date().toISOString()} - Success: ${JSON.stringify(logEntry)}\n`);

            const logPath = path.join(path.dirname(process.argv[1]), '..', '..', '..', 'trades.json');
            try {
                fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
            } catch (e) { }

            console.log(JSON.stringify({ success: true, signature, ...logEntry }));

        } else {
            console.log(`✅ No token balance for ${symbol}`);
            console.log(JSON.stringify({ success: true, message: 'No position to close' }));
        }

    } catch (error) {
        console.error("Pipeline Error:", error.message);
        fs.appendFileSync(DEBUG_LOG, `${new Date().toISOString()} - Error: ${error.message}\n`);
        process.exit(1);
    }
}

closePosition();
