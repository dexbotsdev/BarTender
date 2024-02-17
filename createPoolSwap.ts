import { connection, privateKey, tokenInfo } from "./config";
import { AddressLookupTableProgram, ComputeBudgetProgram, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, PublicKeyData, Signer, Transaction, VersionedTransaction, sendAndConfirmRawTransaction, TransactionInstruction, TransactionMessage, sendAndConfirmTransaction } from '@solana/web3.js';
import { DEFAULT_TOKEN, PROGRAMIDS, addLookupTableInfo, feeId, makeTxVersion, wallet } from './src/constants';
import { TOKEN_PROGRAM_ID, getMint } from '@solana/spl-token';
import { readFile, writeFile } from "fs";
import { BigNumberish, CacheLTA, ComputeBudgetConfig, InstructionType, Liquidity, LiquidityAssociatedPoolKeys, Logger, MARKET_STATE_LAYOUT_V3, Percent, Token, TokenAccount, TokenAmount, TxVersion, buildSimpleTransaction } from "@raydium-io/raydium-sdk";
import { BN } from "@project-serum/anchor";
import { ammCreatePool, calcMarketStartPrice, getATAAddress, getWalletTokenAccount } from "./src/raydiumUtil";
import { sendTx } from "./src/send_transaction";
import { formatAmmKeysById } from "./src/formatAmmKeysById";
import assert from "assert";
import { Market } from "@project-serum/serum";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import LP from "./LP";
const httpTimeout = 30_000
const MAINNET_API_HTTP = 'https://uk.solana.dex.blxrbdn.com'
const PRIORITY_RATE = 100; // MICRO_LAMPORTS 
const SEND_AMT = 0.01 * LAMPORTS_PER_SOL;
const PRIORITY_FEE_IX = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_RATE });

const logger = Logger.from('CreateLPPS')

async function start() {

    readFile('./tokenInfo.json', 'utf8', async (error, data) => {
        if (error) {
            //logger.debug(error);
            return;
        }
        let tokenInfo = JSON.parse(data);
        const mint = new PublicKey(tokenInfo.baseMint.mint);
        const mintInfo = await getMint(connection, mint);
        const baseToken = new Token(TOKEN_PROGRAM_ID, mint, mintInfo.decimals);
        const quoteToken = new Token(TOKEN_PROGRAM_ID, "So11111111111111111111111111111111111111112", 9, "WSOL", "WSOL");

        console.log("Creating pool...", tokenInfo.baseMint.mint, tokenInfo.supply, tokenInfo.addSol);

        const accounts = await Market.findAccountsByMints(connection, baseToken.mint, quoteToken.mint, PROGRAMIDS.OPENBOOK_MARKET);
        if (accounts.length === 0) {
            console.log("Not found OpenBook market!");
            return;
        }
        const [{ publicKey: marketId, accountInfo }] = await Market.findAccountsByMints(connection, baseToken.mint, quoteToken.mint, PROGRAMIDS.OPENBOOK_MARKET);

     
        const startTime = Math.floor(Date.now() / 1000);
        const baseAmount = xWeiAmount(tokenInfo.supply, mintInfo.decimals);
        const quoteAmount = xWeiAmount(tokenInfo.addSol, 9);
        const walletTokenAccounts = await getWalletTokenAccount(connection, wallet.publicKey);
       let { innerTransactions:txs, address } =  await  LP.makeCreatePoolV4InstructionV2Simple({
            connection,
            programId: PROGRAMIDS.AmmV4,
            marketInfo: {
                marketId: marketId,
                programId: PROGRAMIDS.OPENBOOK_MARKET,
            },
            baseMintInfo: baseToken,
            quoteMintInfo: quoteToken,
            baseAmount: baseAmount,
            quoteAmount: quoteAmount,
            startTime: new BN(startTime),
            ownerInfo: {
                feePayer: wallet.publicKey,
                wallet: wallet.publicKey,
                tokenAccounts: walletTokenAccounts,
                useSOLBalance: true,
            },
            associatedOnly: false,
            checkCreateATAOwner: true,
            makeTxVersion: makeTxVersion,
            feeDestinationId: feeId
        });

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
        const slippage = new Percent(1, 100);
        const outputTokenAmount = new TokenAmount(baseToken, 1, false);
        const inTokenAmount = new TokenAmount(DEFAULT_TOKEN.SOL, 0.01, false);
    
        const { innerTransactions:swaps } = await Liquidity.makeSwapInstructionSimple({
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


      console.log(txs)
      console.log(swaps)
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash({ commitment: 'finalized' });


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
     for (const itemIx of txs) {   
         txn.add(...itemIx.instructions)  
         txn.feePayer = wallet.publicKey
         txn.recentBlockhash = blockhash 
         i++;
     } 

       for (const itemIx of  swaps) { 
        txn.add(...itemIx.instructions) 
     }  
     

     console.log(txn.serialize({verifySignatures:false}))
   
      const transactions = await sendAndConfirmTransaction(connection,txn,[wallet.payer]);

      console.log(transactions)
  
    })

}

export const xWeiAmount = (amount: { toString: () => string; }, decimals: number) => {
    return new BN(Number(amount) * 10** decimals);
};

start()

async function makeCreatePoolV4InstructionV2Simple( {
    connection,
    programId,
    markInfo,
    baseMintInfo,
    quoteMintInfo,
    baseAmount,
    quoteAmount,
    startTime,
    ownerInfo,
    associatedOnly = false,
    computeBudgetConfig,
    checkCreateATAOwner = false,
    makeTxVersion,
    lookupTableCache,
    feeDestinationId,
  }: {
    connection: Connection
    programId: PublicKey
    markInfo: {
      marketId: PublicKey
      programId: PublicKey
    }
    baseMintInfo: Token
    quoteMintInfo: Token

    baseAmount: BN
    quoteAmount: BN
    startTime: BN

    ownerInfo: {
      feePayer: PublicKey
      wallet: PublicKey
      tokenAccounts: TokenAccount[]
      useSOLBalance?: boolean // if has WSOL mint
    }
    associatedOnly: boolean
    checkCreateATAOwner: boolean
    computeBudgetConfig?: ComputeBudgetConfig
  } & {
    makeTxVersion: TxVersion
    lookupTableCache?: CacheLTA
    feeDestinationId: PublicKey
  }) {
    const frontInstructions: TransactionInstruction[] = []
    const endInstructions: TransactionInstruction[] = []
    const frontInstructionsType: InstructionType[] = []
    const endInstructionsType: InstructionType[] = []
    const signers: Signer[] = []

    const mintAUseSOLBalance = ownerInfo.useSOLBalance && baseMintInfo.mint.equals(Token.WSOL.mint)
    const mintBUseSOLBalance = ownerInfo.useSOLBalance && quoteMintInfo.mint.equals(Token.WSOL.mint)
    const walletTokenAccounts = await getWalletTokenAccount(connection, wallet.publicKey)

    const ownerTokenAccountBase = await Liquidity._selectOrCreateTokenAccount({
        programId: TOKEN_PROGRAM_ID,
        mint: baseMintInfo.mint,
        tokenAccounts: mintAUseSOLBalance ? [] : ownerInfo.tokenAccounts,
        owner: ownerInfo.wallet,
  
        createInfo: mintAUseSOLBalance
          ? {
              connection,
              payer: ownerInfo.feePayer,
              amount: baseAmount,
  
              frontInstructions,
              frontInstructionsType,
              endInstructions: mintAUseSOLBalance ? endInstructions : [],
              endInstructionsType: mintAUseSOLBalance ? endInstructionsType : [],
              signers,
            }
          : undefined,
  
        associatedOnly: mintAUseSOLBalance ? false : associatedOnly,
        checkCreateATAOwner,
      })
  
      const ownerTokenAccountQuote = await Liquidity._selectOrCreateTokenAccount({
        programId: TOKEN_PROGRAM_ID,
        mint: quoteMintInfo.mint,
        tokenAccounts: mintBUseSOLBalance ? [] : ownerInfo.tokenAccounts,
        owner: ownerInfo.wallet,
  
        createInfo: mintBUseSOLBalance
          ? {
              connection,
              payer: ownerInfo.feePayer,
              amount: quoteAmount,
  
              frontInstructions,
              frontInstructionsType,
              endInstructions: mintBUseSOLBalance ? endInstructions : [],
              endInstructionsType: mintBUseSOLBalance ? endInstructionsType : [],
              signers,
            }
          : undefined,
  
        associatedOnly: mintBUseSOLBalance ? false : associatedOnly,
        checkCreateATAOwner,
      })


      if (ownerTokenAccountBase === undefined || ownerTokenAccountQuote === undefined)
      throw Error("you don't has some token account")


    const [{ publicKey: marketId, accountInfo }] = await Market.findAccountsByMints(connection, baseMintInfo.mint, quoteMintInfo.mint, PROGRAMIDS.OPENBOOK_MARKET);
    const marketInfo = MARKET_STATE_LAYOUT_V3.decode(accountInfo.data);

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash({ commitment: 'finalized' });

      const poolInfo :any = Liquidity.getAssociatedPoolKeys({
        version: 4,
        marketVersion: 3,
        marketId: markInfo.marketId,
        baseMint: baseMintInfo.mint,
        quoteMint: quoteMintInfo.mint,
        baseDecimals: baseMintInfo.decimals,
        quoteDecimals: quoteMintInfo.decimals,
        programId,
        marketProgramId: markInfo.programId,
      })
      poolInfo.marketBaseVault = marketInfo.baseVault;
      poolInfo.marketQuoteVault = marketInfo.quoteVault;
      poolInfo.marketBids = marketInfo.bids;
      poolInfo.marketAsks = marketInfo.asks;
      poolInfo.marketEventQueue = marketInfo.eventQueue;

      const ins = Liquidity.makeCreatePoolV4InstructionV2({
        programId,
        ammId: poolInfo.id,
        ammAuthority: poolInfo.authority,
        ammOpenOrders: poolInfo.openOrders,
        lpMint: poolInfo.lpMint,
        coinMint: poolInfo.baseMint,
        pcMint: poolInfo.quoteMint,
        coinVault: poolInfo.baseVault,
        pcVault: poolInfo.quoteVault,
        ammTargetOrders: poolInfo.targetOrders,
        marketProgramId: poolInfo.marketProgramId,
        marketId: poolInfo.marketId,
        userWallet: ownerInfo.wallet,
        userCoinVault: ownerTokenAccountBase,
        userPcVault: ownerTokenAccountQuote,
        userLpVault: getATAAddress(ownerInfo.wallet, poolInfo.lpMint, TOKEN_PROGRAM_ID).publicKey,
        ammConfigId: poolInfo.configId,
        feeDestinationId,
  
        nonce: poolInfo.nonce,
        openTime: startTime,
        coinAmount: baseAmount,
        pcAmount: quoteAmount,
      }).innerTransaction


     
      const amountOut = new TokenAmount(baseMintInfo, 1, false);
      const amountIn = new TokenAmount(DEFAULT_TOKEN.SOL, 0.01, false);
  

      logger.debug('amountIn:', amountIn)
      logger.debug('amountOut:', amountOut)
      logger.assertArgument(
        !amountIn.isZero() && !amountOut.isZero(),
        'amounts must greater than zero',
        'currencyAmounts',
        {
          amountIn: amountIn.toFixed(),
          amountOut: amountOut.toFixed(),
        },
      )



    const bypassAssociatedCheck= false
      
  
      // handle currency in & out (convert SOL to WSOL)
      const tokenIn = amountIn instanceof TokenAmount ? amountIn.token : Token.WSOL
      const tokenOut = amountOut instanceof TokenAmount ? amountOut.token : Token.WSOL
  
      const tokenAccountIn = Liquidity._selectTokenAccount({
        programId: TOKEN_PROGRAM_ID,
        tokenAccounts:walletTokenAccounts,
        mint: tokenIn.mint,
        owner:wallet.publicKey,
        config: { associatedOnly: false },
      })
      const tokenAccountOut = Liquidity._selectTokenAccount({
        programId: TOKEN_PROGRAM_ID,
        tokenAccounts: walletTokenAccounts,
        mint: tokenOut.mint,
        owner:wallet.publicKey,
      })
  
      const [amountInRaw, amountOutRaw] = [amountIn.raw, amountOut.raw]


      const sfrontInstructions: TransactionInstruction[] = []
    const sendInstructions: TransactionInstruction[] = []
    const sfrontInstructionsType: InstructionType[] = []
    const sendInstructionsType: InstructionType[] = []
    const ssigners: Signer[] = []

    const _tokenAccountIn = await Liquidity._handleTokenAccount({
      programId: TOKEN_PROGRAM_ID,
      connection,
      side: 'in',
      amount: amountInRaw,
      mint: tokenIn.mint,
      tokenAccount: tokenAccountIn,
      owner:wallet.publicKey,
      payer:wallet.publicKey,
      frontInstructions,
      endInstructions,
      signers,
      bypassAssociatedCheck,
      frontInstructionsType,
      checkCreateATAOwner,
    })
    const _tokenAccountOut = await Liquidity._handleTokenAccount({
      programId: TOKEN_PROGRAM_ID,
      connection,
      side: 'out',
      amount: 0,
      mint: tokenOut.mint,
      tokenAccount: tokenAccountOut,
      owner:wallet.publicKey,
      payer:wallet.publicKey,
      frontInstructions,
      endInstructions,
      signers,
      bypassAssociatedCheck,
      frontInstructionsType,
      checkCreateATAOwner,
    })


    const {innerTransaction:ins2} = Liquidity.makeSwapInstruction({
        poolKeys:poolInfo,
        userKeys: {
          tokenAccountIn: _tokenAccountIn,
          tokenAccountOut: _tokenAccountOut,
          owner:wallet.publicKey,
        },
        amountIn: amountInRaw,
        amountOut: amountOutRaw,
        fixedSide:'in',
      })


   

    const end= new Transaction().add(...frontInstructions).add(...ins.instructions,...ins2.instructions).add(... endInstructions);


    end.feePayer=wallet.publicKey;

    end.recentBlockhash=blockhash


    await sendAndConfirmTransaction(connection,end,[wallet.payer]);


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