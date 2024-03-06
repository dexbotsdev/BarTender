import { connection } from "./config";
import { ComputeBudgetProgram, LAMPORTS_PER_SOL, PublicKey, VersionedTransaction, TransactionInstruction, TransactionMessage, sendAndConfirmTransaction, AccountInfo, SystemProgram, AddressLookupTableAccount, Keypair } from '@solana/web3.js';
import { DEFAULT_TOKEN, PROGRAMIDS, addLookupTableInfo, feeId, makeTxVersion, wallet } from './src/constants';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getMint } from '@solana/spl-token';
import { readFile } from "fs";
import { DEVNET_SPL_TOKENS, Liquidity, Logger, MARKET_STATE_LAYOUT_V3, Market, Percent, SOL, SPL_MINT_LAYOUT, Token, TokenAmount, WSOL, simulateTransaction } from "@raydium-io/raydium-sdk";
import { BN } from "@project-serum/anchor";
import { getWalletTokenAccount } from "./src/raydiumUtil";
import { LookupTableProvider } from "./src/LookupTableProvider";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { lookup } from 'dns';
import { formatAmmKeysById } from "./src/formatAmmKeysById";

const httpTimeout = 30_000
const MAINNET_API_HTTP = 'https://uk.solana.dex.blxrbdn.com'
const PRIORITY_RATE = 100; // MICRO_LAMPORTS 
const SEND_AMT = 0.01 * LAMPORTS_PER_SOL;
const PRIORITY_FEE_IX = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_RATE });

const гayV4 = PROGRAMIDS.AmmV4;

const logger = Logger.from('CreateLPPS')
const openbookProgram = PROGRAMIDS.OPENBOOK_MARKET; //new PublicKey('srmqPvymJeFKQ4z6Qed1GFppgkRHL9kaELCbyksJtPX')
const serumProgramId = new PublicKey('9xQeWvG816bUx9EPjHma23yvVM2ZWbrrp2b9PusVFin')


async function start() {

  readFile('./tokenInfo.json', 'utf8', async (error, data) => {
    if (error) {
      //console.log(error);
      return;
    }
    let tokenInfo = JSON.parse(data);
    const mint = new PublicKey(tokenInfo.baseMint.mint);
    const mintInfo = await getMint(connection, mint);
    const baseToken = new Token(TOKEN_PROGRAM_ID, mint, mintInfo.decimals);
    const quoteToken = new Token(TOKEN_PROGRAM_ID, "So11111111111111111111111111111111111111112", 9, "WSOL", "WSOL");
    const targetMarketId = new PublicKey(tokenInfo.marketId)
    const marketBufferInfo: any = await connection.getAccountInfo(targetMarketId)

    const addBaseAmount = new BN(tokenInfo.baseMintAmount)
    const addQuoteAmount = new BN(tokenInfo.quoteMintAmount)
    const { baseMint, quoteMint, baseLotSize, quoteLotSize, baseVault, quoteVault, bids, asks, eventQueue, requestQueue } = MARKET_STATE_LAYOUT_V3.decode(marketBufferInfo.data)

     const startTime = 0;//Math.floor(Date.now()/3000)
    const walletTokenAccounts = await getWalletTokenAccount(connection, wallet.publicKey)
    let poolKeys: any = Liquidity.getAssociatedPoolKeys({
      version: 4,
      marketVersion: 3,
      baseMint,
      quoteMint,
      baseDecimals: 7,
      quoteDecimals: 9,
      marketId: targetMarketId,
      programId: PROGRAMIDS.AmmV4,
      marketProgramId: PROGRAMIDS.OPENBOOK_MARKET
    })
    poolKeys.marketBaseVault = baseVault;
    poolKeys.marketQuoteVault = quoteVault;
    poolKeys.marketBids = bids;
    poolKeys.marketAsks = asks;
    poolKeys.marketEventQueue = eventQueue;
    console.log("Pool Keys:", poolKeys);
    
    const lookupTableProvider = new LookupTableProvider();
  
    const lookupTablesPool = lookupTableProvider.computeIdealLookupTablesForAddresses([]);
    const outputTokenAmount = new TokenAmount(baseToken, 1, false);
    const inTokenAmount =   new TokenAmount(DEFAULT_TOKEN.SOL, 0.01 * 10 ** 9);

    const slippage = new Percent(1, 100)

    console.log("Token Mint is ...", mint.toBase58() );

   
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    console.log("getLatestBlockhash...", blockhash );

    const insts: TransactionInstruction[] = []
    var finalLookupTable:AddressLookupTableAccount[]=[];
   // insts.push(...createPoolInstructions);
    const wallets: Keypair[] = []

       wallets.push(wallet.payer)
      const {
        inst,
        lookUps 
      }  = await createBurgerSwaps(wallet,lookupTableProvider,  poolKeys, baseToken, blockhash)
    
      finalLookupTable.push(...lookUps); 
      insts.push(...inst) 

      

 
    const messageMain = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: blockhash,
      instructions: insts,
    }).compileToV0Message(finalLookupTable);


     const txMain = new VersionedTransaction(messageMain);

    try {
      const serializedMsg = txMain.serialize();
      if (serializedMsg.length > 1232) {
        console.log('tx too big');
        process.exit(0);
      }
      txMain.sign([wallet.payer,...wallets]);
    } catch (e) {
      console.log(e, 'error signing txMain');
      process.exit(0);
    }

     const txid = await connection.sendTransaction(txMain);


     console.log(txid)

  })

}
 

start()


async function getMarketInfo(marketId: PublicKey) {
  let marketInfo: AccountInfo<Buffer> | null;
  while (true) {
    marketInfo = await connection.getAccountInfo(marketId);

 
    if (marketInfo) { break; }
    return marketInfo;
  }
}

async function getDecodedData(marketId: PublicKey) {
  const marketBufferInfo: any = await connection.getAccountInfo(marketId)

  return MARKET_STATE_LAYOUT_V3.decode(marketBufferInfo.data);

}

async function getMintData(baseMint: any) {
  return await connection.getAccountInfo(baseMint);
}

async function getDecimals(baseMintData: any) {
  return SPL_MINT_LAYOUT.decode(baseMintData.data).decimals;
}

async function getOwnerAta(baseMint: any, publicKey: PublicKey) {
  const foundAta = PublicKey.findProgramAddressSync([publicKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), baseMint.toBuffer()], ASSOCIATED_TOKEN_PROGRAM_ID)[0]
  return foundAta;
}
// async function createWalletSwaps(swapperwallet:NodeWallet,lookupTableProvider: LookupTableProvider, item: any, poolKeys: any, baseToken: Token, blockhash: string): Promise<any> {
//   const txsSigned: VersionedTransaction[] = [];


 
//     console.debug('Create Step 1 Swap ')
   

//     const userwalletTokenAccounts = await getWalletTokenAccount(connection, swapperwallet.publicKey);
//     const outputTokenAmount = new TokenAmount(baseToken, 1, false);
//     const inTokenAmount = new TokenAmount(DEFAULT_TOKEN.SOL, item.amountToSwap, false);
//     const { innerTransactions: swapTransactions } = await Liquidity.makeSwapInstructionSimple({
//       connection,
//       poolKeys,
//       userKeys: {
//         tokenAccounts: userwalletTokenAccounts,
//         owner: swapperwallet.publicKey,
//         payer:swapperwallet.publicKey
//       },
//       amountIn: inTokenAmount,
//       amountOut: outputTokenAmount,
//       fixedSide: 'in',
//       makeTxVersion,
//       lookupTableCache: addLookupTableInfo
//     });

//     const outputTokenAmount2 = new TokenAmount(baseToken, 1, false);
//     const inTokenAmount2 = new TokenAmount(DEFAULT_TOKEN.SOL, inTokenAmount.toSignificant(), false);


//     const { innerTransactions: swapOutTransactions } = await Liquidity.makeSwapInstructionSimple({
//       connection,
//       poolKeys,
//       userKeys: {
//         tokenAccounts: userwalletTokenAccounts,
//         owner: swapperwallet.publicKey,
//         payer:swapperwallet.publicKey
//       },
//       amountIn: inTokenAmount,
//       amountOut: outputTokenAmount,
//       fixedSide: 'in',
//       makeTxVersion,
//       lookupTableCache: addLookupTableInfo
//     });
//     console.debug('Create Step 2 makeSwapInstructionSimple ')

//     const createSwapInstructions: TransactionInstruction[] = [];
//     for (const itemIx of swapTransactions) {
//       createSwapInstructions.push(...itemIx.instructions);
//     }

//     console.debug('Create Step 3 makeSwapInstructionSimple ')

//     const addressesSwapMain: PublicKey[] = [];
//     createSwapInstructions.forEach((ixn) => {
//       ixn.keys.forEach((key) => {
//         addressesSwapMain.push(key.pubkey);
//       });
//     });
//     const lookupTablesSwapMain = lookupTableProvider.computeIdealLookupTablesForAddresses(addressesSwapMain);
 
 
//       return {
//         inst:createSwapInstructions,
//         lookUps:lookupTablesSwapMain
//       }
// }

async function createBurgerSwaps(swapperwallet:NodeWallet,lookupTableProvider: LookupTableProvider, poolKeys: any, baseToken: Token, blockhash: string): Promise<any> {
  const txsSigned: VersionedTransaction[] = [];


 
    console.debug('Create Step 1 Swap ')
   

    const userwalletTokenAccounts = await getWalletTokenAccount(connection, swapperwallet.publicKey);
    const outputTokenAmount = new TokenAmount(baseToken, 1, false);
    const inTokenAmount =   new TokenAmount(DEFAULT_TOKEN.SOL, 0.002 * 10 ** 9);
    const { innerTransactions: swapInTransactions } = await Liquidity.makeSwapInstructionSimple({
      connection,
      poolKeys,
      userKeys: {
        tokenAccounts: userwalletTokenAccounts,
        owner: swapperwallet.publicKey,
        payer:swapperwallet.publicKey
      },
      amountIn: inTokenAmount,
      amountOut: outputTokenAmount,
      fixedSide: 'in',
      makeTxVersion,
      lookupTableCache: addLookupTableInfo
    });

    let slippage = new Percent(25, 100)
    
    console.log('fetchInfo Liquidity  ')
    console.log(connection.rpcEndpoint)
     let poolInfo = await Liquidity.fetchInfo({ connection, poolKeys: poolKeys })

    console.log(poolInfo)

    const { amountOut,
      minAmountOut,
      currentPrice,
      executionPrice,
      priceImpact,
      fee } = Liquidity.computeAmountOut({
          poolKeys: poolKeys,
          poolInfo: poolInfo,
          amountIn: inTokenAmount,
          currencyOut: baseToken,
          slippage: slippage,
      })
      

    console.log('Swapping Liquidity  ')

    console.log('Swapping from   inputAmount ' + inTokenAmount.toExact())
    console.log('amountOut:' + amountOut.toExact() + '  minAmountOut: ' + minAmountOut.raw)
    console.log('currentPrice:' + currentPrice.invert().toFixed() + '  executionPrice: ' + executionPrice?.invert().toSignificant())
    console.log('priceImpact:' + priceImpact.toSignificant() + '  fee: ' + fee.toSignificant())


    const out = minAmountOut.toExact();
    const out2 = Number(Number(out)*1.5).toFixed(0)
    const output2TokenAmount = new TokenAmount(DEFAULT_TOKEN.SOL, out2);
    const in2TokenAmount =   new TokenAmount(baseToken, amountOut.raw);

    slippage = new Percent(0, 100)
    const { innerTransactions: swapOutTransactions } = await Liquidity.makeSwapInstructionSimple({
      connection,
      poolKeys,
      userKeys: {
        tokenAccounts: userwalletTokenAccounts,
        owner: swapperwallet.publicKey,
        payer:swapperwallet.publicKey
      },
      amountIn: in2TokenAmount,
      amountOut: output2TokenAmount,
      fixedSide: 'in',
      makeTxVersion,
      lookupTableCache: addLookupTableInfo,
      
    });
    console.debug('Create Step 2 makeSwapIN-N-OUT-InstructionSimple ')

    const createSwapInstructions: TransactionInstruction[] = [];
    for (const itemIx of swapInTransactions) {
      createSwapInstructions.push(...itemIx.instructions);
    }
    
    for (const itemIx of swapOutTransactions) {
      createSwapInstructions.push(...itemIx.instructions);
    }
    console.debug('Create Step 3 makeSwapIN-N-OUT-InstructionSimple ')

    const addressesSwapMain: PublicKey[] = [];
    createSwapInstructions.forEach((ixn) => {
      ixn.keys.forEach((key) => {
        addressesSwapMain.push(key.pubkey);
      });
    });
    const lookupTablesSwapMain = lookupTableProvider.computeIdealLookupTablesForAddresses(addressesSwapMain);
 
 
      return {
        inst:createSwapInstructions,
        lookUps:lookupTablesSwapMain
      }
}

 
