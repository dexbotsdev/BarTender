import { connection, privateKey } from '../config';
import { PublicKey, VersionedTransaction, TransactionInstruction, TransactionMessage, AccountInfo, AddressLookupTableAccount, Keypair } from '@solana/web3.js';
import { DEFAULT_TOKEN, PROGRAMIDS, addLookupTableInfo, feeId, makeTxVersion, wallet } from '../utils/constants';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getMint } from '@solana/spl-token';
import { readFile } from "fs";
import { Liquidity, MARKET_STATE_LAYOUT_V3, Percent, SPL_MINT_LAYOUT, Token, TokenAmount, buildSimpleTransaction } from "raydium-sdk-opt";
import { BN } from "@project-serum/anchor";
import { buildAndSendTx, getWalletTokenAccount, sendTx } from "../utils/raydiumUtil";
import { LookupTableProvider } from "../utils/LookupTableProvider";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes";
import { getTokenBalance } from "../utils/send_transaction";
 
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
    
    const lookupTableProvider = new LookupTableProvider(); 
    const addressesMain: PublicKey[] = []; 
    const lookupTablesPool = lookupTableProvider.computeIdealLookupTablesForAddresses(addressesMain); 
    const slippage = new Percent(1, 100) 

    const insts: TransactionInstruction[] = []
    var finalLookupTable:AddressLookupTableAccount[]=[];
     
 
    for(var item of tokenInfo.pumpWallets){ 
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

      try{
        await createWalletSwaps(lookupTableProvider, item, poolKeys, baseToken, blockhash)
      }catch(error){
        console.log('Failed Swap for Wallet '+item.tokenAddress )
      } 
    } 

 
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
async function createWalletSwaps(lookupTableProvider: LookupTableProvider, item: any, poolKeys: any, baseToken: Token, blockhash: string): Promise<any> {
  const txsSigned: VersionedTransaction[] = [];

    const swapperwallet = new NodeWallet(Keypair.fromSecretKey(bs58.decode(item.privateKey)));
 
    console.debug('Create Wallet  Swap '+item.walletAddress)
   
    const tokenBalance :any = await getTokenBalance(baseToken.mint, swapperwallet.payer);

    if(!tokenBalance ) return;

    if(tokenBalance && tokenBalance<=1)return;

    
    const userwalletTokenAccounts = await getWalletTokenAccount(connection, swapperwallet.publicKey);
    const outputTokenAmount = new TokenAmount(DEFAULT_TOKEN.SOL, 0.01, false);
    const inTokenAmount = new TokenAmount(baseToken, tokenBalance);
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
      makeTxVersion 
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
        if(key.pubkey)
        addressesSwapMain.push(key.pubkey);
      });
    });
    const lookupTablesSwapMain = lookupTableProvider.computeIdealLookupTablesForAddresses(addressesSwapMain);

    console.log(lookupTablesSwapMain);

    const messageMain = new TransactionMessage({
      payerKey: swapperwallet.publicKey,
      recentBlockhash: blockhash,
      instructions: createSwapInstructions,
    }).compileToV0Message(lookupTablesSwapMain);
   
    const txMain = new VersionedTransaction(messageMain);

    try {
      const serializedMsg = txMain.serialize();
      if (serializedMsg.length > 1232) {
        console.log('tx too big');
        process.exit(0);
      }
      txMain.sign([swapperwallet.payer]);
    } catch (e) {
      console.log(e, 'error signing txMain');
      process.exit(0);
    }

     const txid = await connection.sendTransaction(txMain);


     console.log(txid)       
}

