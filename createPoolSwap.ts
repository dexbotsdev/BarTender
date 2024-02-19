import { connection } from "./config";
import { ComputeBudgetProgram, LAMPORTS_PER_SOL, PublicKey, VersionedTransaction, TransactionInstruction, TransactionMessage, sendAndConfirmTransaction, AccountInfo, SystemProgram, AddressLookupTableAccount, Keypair } from '@solana/web3.js';
import { DEFAULT_TOKEN, PROGRAMIDS, addLookupTableInfo, feeId, makeTxVersion, wallet } from './src/constants';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getMint } from '@solana/spl-token';
import { readFile } from "fs";
import { Liquidity, Logger, MARKET_STATE_LAYOUT_V3, SPL_MINT_LAYOUT, Token, TokenAmount, simulateTransaction } from "@raydium-io/raydium-sdk";
import { BN } from "@project-serum/anchor";
import { getWalletTokenAccount } from "./src/raydiumUtil";
import { LookupTableProvider } from "./src/LookupTableProvider";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { lookup } from 'dns';
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
      //logger.debug(error);
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

    const startTime = Math.floor(Date.now() / 2000)
    const walletTokenAccounts = await getWalletTokenAccount(connection, wallet.publicKey)
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
    poolKeys.marketBaseVault = baseVault;
    poolKeys.marketQuoteVault = quoteVault;
    poolKeys.marketBids = bids;
    poolKeys.marketAsks = asks;
    poolKeys.marketEventQueue = eventQueue;
    // console.log("Pool Keys:", poolKeys);
    const outputTokenAmount = new TokenAmount(baseToken, 1, false);
    const inTokenAmount = new TokenAmount(DEFAULT_TOKEN.SOL, tokenInfo.buySwap, false);

    console.log("Creating pool...", tokenInfo.baseMint.mint, tokenInfo.supply, tokenInfo.addSol);

    //const poolKeys = await derivePoolKeys(new PublicKey(tokenInfo.marketId));
    //console.log(JSON.stringify(poolKeys,null,2));

    const lookupTableProvider = new LookupTableProvider();
    const lookupAccount = await lookupTableProvider.getLookupTable(new PublicKey(tokenInfo.lookupTableAddress));

    const initPoolInstructionResponse = await Liquidity.makeCreatePoolV4InstructionV2Simple({
      connection,
      programId: PROGRAMIDS.AmmV4,
      marketInfo: {
        marketId: targetMarketId,
        programId: PROGRAMIDS.OPENBOOK_MARKET,
      },
      baseMintInfo: baseToken,
      quoteMintInfo: quoteToken,
      baseAmount: addBaseAmount,
      quoteAmount: addQuoteAmount,
      startTime: new BN(Math.floor(startTime)),
      ownerInfo: {
        feePayer: wallet.publicKey,
        wallet: wallet.publicKey,
        tokenAccounts: walletTokenAccounts,
        useSOLBalance: true,
      },
      associatedOnly: false,
      checkCreateATAOwner: true,
      makeTxVersion,
      feeDestinationId: feeId, // only mainnet use this
    })


    const createPoolInstructions: TransactionInstruction[] = [];
    for (const itemIx of initPoolInstructionResponse.innerTransactions) {
      createPoolInstructions.push(...itemIx.instructions)
    }

    const addressesMain: PublicKey[] = [];
    createPoolInstructions.forEach((ixn) => {
      ixn.keys.forEach((key) => {
        addressesMain.push(key.pubkey);
      });
    });
    
    const lookupTablesPool = lookupTableProvider.computeIdealLookupTablesForAddresses(addressesMain);
 

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

    const insts: TransactionInstruction[] = []
    var finalLookupTable:AddressLookupTableAccount[]=[];
    insts.push(...createPoolInstructions);
    const wallets: Keypair[] = []

    for(var item of tokenInfo.wallets){

      const userwallet = Keypair.fromSecretKey(Uint8Array.from(item.privateKey));
      const swapperwallet = new NodeWallet(userwallet);
      wallets.push(swapperwallet.payer)
      const {
        inst,
        lookUps 
      }  = await createWalletSwaps(swapperwallet,lookupTableProvider, item, poolKeys, baseToken, blockhash)
  
      console.log(inst)
      console.log(lookUps)
  
      finalLookupTable.push(...lookUps);
       
  
      insts.push(...inst)
    }
    finalLookupTable.push(...lookupTablesPool);
    


 
    const messageMain = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: blockhash,
      instructions: insts,
    }).compileToV0Message(finalLookupTable);


    console.log(messageMain.serialize().length)
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

    console.log(marketInfo);

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
async function createWalletSwaps(swapperwallet:NodeWallet,lookupTableProvider: LookupTableProvider, item: any, poolKeys: any, baseToken: Token, blockhash: string): Promise<any> {
  const txsSigned: VersionedTransaction[] = [];


 
    console.debug('Create Step 1 Swap ')
   

    const userwalletTokenAccounts = await getWalletTokenAccount(connection, swapperwallet.publicKey);
    const outputTokenAmount = new TokenAmount(baseToken, 1, false);
    const inTokenAmount = new TokenAmount(DEFAULT_TOKEN.SOL, item.amountToSwap, false);
    const { innerTransactions: swapTransactions } = await Liquidity.makeSwapInstructionSimple({
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
    console.debug('Create Step 2 makeSwapInstructionSimple ')

    const createSwapInstructions: TransactionInstruction[] = [];
    for (const itemIx of swapTransactions) {
      createSwapInstructions.push(...itemIx.instructions);
    }

    console.debug('Create Step 3 makeSwapInstructionSimple ')

    const addressesSwapMain: PublicKey[] = [];
    createSwapInstructions.forEach((ixn) => {
      ixn.keys.forEach((key) => {
        addressesSwapMain.push(key.pubkey);
      });
    });
    const lookupTablesSwapMain = lookupTableProvider.computeIdealLookupTablesForAddresses(addressesSwapMain);
    console.debug('Create Step 4 makeSwapInstructionSimple ',lookupTablesSwapMain) 

 
      return {
        inst:createSwapInstructions,
        lookUps:lookupTablesSwapMain
      }
}

