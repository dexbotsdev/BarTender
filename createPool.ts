import { connection, privateKey, tokenInfo } from "./config";
import { AddressLookupTableProgram, ComputeBudgetProgram, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, PublicKeyData, Signer, Transaction, VersionedTransaction, sendAndConfirmRawTransaction, TransactionInstruction, TransactionMessage } from '@solana/web3.js';
import { DEFAULT_TOKEN, PROGRAMIDS, addLookupTableInfo, makeTxVersion, wallet } from './src/constants';
import { TOKEN_PROGRAM_ID, getMint } from '@solana/spl-token';
import { readFile, writeFile } from "fs";
import { BigNumberish, Liquidity, LiquidityAssociatedPoolKeys, Logger, MARKET_STATE_LAYOUT_V3, Percent, Token, TokenAmount, buildSimpleTransaction } from "@raydium-io/raydium-sdk";
import { BN } from "@project-serum/anchor";
import { ammCreatePool, calcMarketStartPrice, getWalletTokenAccount } from "./src/raydiumUtil";
import { sendTx } from "./src/send_transaction";
import { formatAmmKeysById } from "./src/formatAmmKeysById";
import assert from "assert";
import { Market } from "@project-serum/serum";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
const logger = Logger.from('Liquidity')

const httpTimeout = 30_000
const MAINNET_API_HTTP = 'https://uk.solana.dex.blxrbdn.com'

const PRIORITY_RATE = 100; // MICRO_LAMPORTS 
const SEND_AMT = 0.01 * LAMPORTS_PER_SOL;
const PRIORITY_FEE_IX = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_RATE });



async function start() {

    readFile('./tokenInfo.json', 'utf8', async (error, data) => {
        if (error) {
            //logger.debug(error);
            return;
        }
        let tokenInfo = JSON.parse(data);
        const baseToken = new Token(TOKEN_PROGRAM_ID, new PublicKey(tokenInfo.baseMint.mint), tokenInfo.baseMint.decimals, tokenInfo.baseMint.name, tokenInfo.baseMint.symbol) // USDC
        const quoteToken = DEFAULT_TOKEN.SOL // RAYx
        const targetMarketId = new PublicKey(tokenInfo.marketId)

        const addBaseAmount = new BN(tokenInfo.baseMintAmount)
        const addQuoteAmount = new BN(tokenInfo.quoteMintAmount)

        const startTime = Math.floor(Date.now() / 2000)
        const walletTokenAccounts = await getWalletTokenAccount(connection, wallet.publicKey)

        /* do something with start price if needed */
        const startPrice = calcMarketStartPrice({ addBaseAmount, addQuoteAmount })
        const startPriceReal = calcMarketStartPrice({ addBaseAmount: new BN(tokenInfo.quoteMintAmount), addQuoteAmount: new BN(tokenInfo.quoteMintAmount) })

        const marketBufferInfo: any = await connection.getAccountInfo(targetMarketId)
        const { baseMint, quoteMint, baseLotSize, quoteLotSize, baseVault, quoteVault, bids, asks, eventQueue, requestQueue } = MARKET_STATE_LAYOUT_V3.decode(marketBufferInfo.data)
        console.log(baseMint.toString(), quoteMint.toString(), baseLotSize.toString(), quoteLotSize.toString());
        let poolKeys: any = Liquidity.getAssociatedPoolKeys({
            version: 4,
            marketVersion: 3,
            baseMint,
            quoteMint,
            baseDecimals: tokenInfo.decimals,
            quoteDecimals: 9,
            marketId: targetMarketId,
            programId: PROGRAMIDS.AmmV4,
            marketProgramId: PROGRAMIDS.OPENBOOK_MARKET
        })
        poolKeys.marketBaseVault =  baseVault;
        poolKeys.marketQuoteVault =  quoteVault;
        poolKeys.marketBids =  bids;
        poolKeys.marketAsks = asks;
        poolKeys.marketEventQueue =  eventQueue;
        // console.log("Pool Keys:", poolKeys);
        const outputTokenAmount = new TokenAmount(baseToken, 1, false);
        const inTokenAmount = new TokenAmount(DEFAULT_TOKEN.SOL, 2, false);
    
        // -------- step 2: create instructions by SDK function --------
        const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
            connection,
            poolKeys,
            userKeys: {
                tokenAccounts: walletTokenAccounts,
                owner: wallet.publicKey,
            },
            amountIn: inTokenAmount,
            amountOut: outputTokenAmount,
            fixedSide: 'in',
            makeTxVersion,
            lookupTableCache: addLookupTableInfo
        });
    
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash({ commitment: 'finalized' });


        ammCreatePool({
            startTime,
            addBaseAmount,
            addQuoteAmount,
            baseToken,
            quoteToken,
            targetMarketId,
            wallet: wallet.payer,
            walletTokenAccounts,
        }).then(async ({ txs }) => {
            console.log('txids')
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash({ commitment: 'finalized' });

            console.log('txids 3')


            const txn = new Transaction()
             // Create the priority fee instructions
            const computePriceIx = ComputeBudgetProgram.setComputeUnitPrice({
                microLamports: 1,
            });
            const computeLimitIx = ComputeBudgetProgram.setComputeUnitLimit({
                units: 400_000,
            });
            txn.add(computePriceIx, computeLimitIx)
 
            let i=0;
            for (const itemIx of txs.innerTransactions) {  
              
                txn.add(...itemIx.instructions) 
          
                txn.feePayer = wallet.publicKey
                txn.recentBlockhash = blockhash 
                i++;
            } 
            txn.sign(wallet.payer);
 
            const swapTnx = new Transaction();
             for (const itemIx of  innerTransactions) { 
                swapTnx.add(...itemIx.instructions)
                swapTnx.feePayer = wallet.publicKey
                swapTnx.recentBlockhash = blockhash 
            } 
            swapTnx.sign(wallet.payer);
            

            
           
            const tnxid = await sendAndConfirmTransactions(connection, wallet.payer, [txn,swapTnx]);

            // construct a v0 compatible transaction `Message`
            console.log(tnxid);

            tokenInfo.poolKeys = poolKeys; 

            writeFile('./tokenInfo.json', JSON.stringify(tokenInfo), (err) => {
                if (err) throw err;
                console.log('The file has been saved! Now run --  npm run addLP');
            });


        })



    })

}


start()
const buyToken = async (mintAddress: string, tokenAmount: number) => {
    console.log("Buying tokens...", mintAddress, tokenAmount);

    const mint = new PublicKey(mintAddress);
    const mintInfo = await getMint(connection, mint);
    const baseToken = new Token(TOKEN_PROGRAM_ID, mintAddress, mintInfo.decimals, 'MyTestToken', 'MTT');
    const quoteToken = new Token(TOKEN_PROGRAM_ID, "So11111111111111111111111111111111111111112", 9, "WSOL", "WSOL");
    const walletTokenAccounts = await getWalletTokenAccount(connection, wallet.publicKey);

    const slippage = new Percent(1, 100);
    const outputTokenAmount = new TokenAmount(baseToken, 1, false);
    const inTokenAmount = new TokenAmount(DEFAULT_TOKEN.SOL, 0.01, false);

    const [{ publicKey: marketId, accountInfo }] = await Market.findAccountsByMints(connection, baseToken.mint, quoteToken.mint, PROGRAMIDS.OPENBOOK_MARKET);
    const marketInfo = MARKET_STATE_LAYOUT_V3.decode(accountInfo.data);


    let poolKeys: any = Liquidity.getAssociatedPoolKeys({
        version: 4,
        marketVersion: 3,
        baseMint: baseToken.mint,
        quoteMint: quoteToken.mint,
        baseDecimals: baseToken.decimals,
        quoteDecimals: quoteToken.decimals,
        marketId: marketId,
        programId: PROGRAMIDS.AmmV4,
        marketProgramId: PROGRAMIDS.OPENBOOK_MARKET,
    });
    // console.log("Pool Keys:", poolKeys);
    poolKeys.marketBaseVault = marketInfo.baseVault;
    poolKeys.marketQuoteVault = marketInfo.quoteVault;
    poolKeys.marketBids = marketInfo.bids;
    poolKeys.marketAsks = marketInfo.asks;
    poolKeys.marketEventQueue = marketInfo.eventQueue;
    // console.log("Pool Keys:", poolKeys);
 
    // -------- step 2: create instructions by SDK function --------
    const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
        connection,
        poolKeys,
        userKeys: {
            tokenAccounts: walletTokenAccounts,
            owner: wallet.publicKey,
        },
        amountIn: inTokenAmount,
        amountOut: outputTokenAmount,
        fixedSide: 'in',
        makeTxVersion,
    });

   

    const transactions = await buildSimpleTransaction({
        connection: connection,
        makeTxVersion: makeTxVersion,
        payer: wallet.publicKey,
        innerTransactions: innerTransactions,
        addLookupTableInfo: addLookupTableInfo,
    });
    console.log("transactions:", transactions);

    await sendAndConfirmTransactions(connection, wallet.payer, transactions);
    console.log("Success!!!");

   
    return innerTransactions
}


export const sendAndConfirmTransactions = async (connection: Connection, payer: Signer, transactions: (Transaction | VersionedTransaction)[]) => {
    for (const tx of transactions) {
        let signature: any;
        if (tx instanceof VersionedTransaction) {

            tx.sign([payer]);
            signature = await connection.sendTransaction(tx);

            if (tokenInfo.devnet)
                console.log(
                    ` Transaction: https://solscan.io/tx/${signature}?cluster=devnet`,
                );
            else
                console.log(
                    ` Transaction: https://solscan.io/tx/${signature}`,
                );

        }
        else
            signature = await connection.sendTransaction(tx, [payer]);
        await connection.confirmTransaction(signature);

        if (tokenInfo.devnet)
            console.log(
                ` Transaction: https://solscan.io/tx/${signature}?cluster=devnet`,
            );
        else
            console.log(
                ` Transaction: https://solscan.io/tx/${signature}`,
            );
    }
};