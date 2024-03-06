import { connection } from "../config";
import { PublicKey, VersionedTransaction, TransactionInstruction, TransactionMessage, AccountInfo, AddressLookupTableAccount, Keypair } from '@solana/web3.js';
import { DEFAULT_TOKEN, PROGRAMIDS, addLookupTableInfo, feeId, makeTxVersion, wallet } from '../utils/constants';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getMint } from '@solana/spl-token';
import { readFile } from "fs";
import { Liquidity, MARKET_STATE_LAYOUT_V3, Percent, SPL_MINT_LAYOUT, Token, TokenAmount } from "raydium-sdk-opt";
import { BN } from "@project-serum/anchor";
import { getWalletTokenAccount } from "../utils/raydiumUtil";
import { LookupTableProvider } from "../utils/LookupTableProvider";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
 
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
    
    const lookupTableProvider = new LookupTableProvider();
 
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
    const outputTokenAmount = new TokenAmount(baseToken, 1, false);
    const inTokenAmount =   new TokenAmount(DEFAULT_TOKEN.SOL, 0.01 * 10 ** 9);

    const slippage = new Percent(1, 100)

    console.log("Creating fetchInfo...", tokenInfo.baseMint.mint, tokenInfo.supply, tokenInfo.addSol);

    console.log(connection.rpcEndpoint)  
   

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
    
       finalLookupTable.push(...lookUps); 
       insts.push(...inst)
    }
    finalLookupTable.push(...lookupTablesPool);
    


 
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

    const outputTokenAmount2 = new TokenAmount(baseToken, 1, false);
    const inTokenAmount2 = new TokenAmount(DEFAULT_TOKEN.SOL, inTokenAmount.toSignificant(), false);


    const { innerTransactions: swapOutTransactions } = await Liquidity.makeSwapInstructionSimple({
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
 
 
      return {
        inst:createSwapInstructions,
        lookUps:lookupTablesSwapMain
      }
}

