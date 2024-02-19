import { connection } from "./config";
import { ComputeBudgetProgram, LAMPORTS_PER_SOL, PublicKey, VersionedTransaction, TransactionInstruction, TransactionMessage, sendAndConfirmTransaction, AccountInfo, SystemProgram, AddressLookupTableAccount } from '@solana/web3.js';
import { DEFAULT_TOKEN, PROGRAMIDS, addLookupTableInfo, feeId, makeTxVersion, wallet } from './src/constants';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getMint } from '@solana/spl-token';
import { readFile } from "fs";
import { Liquidity, Logger, MARKET_STATE_LAYOUT_V3, SPL_MINT_LAYOUT, Token, TokenAmount } from "@raydium-io/raydium-sdk";
import { BN } from "@project-serum/anchor";
import { getWalletTokenAccount } from "./src/raydiumUtil";
import { LookupTableProvider } from "./src/LookupTableProvider";
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

    const createSwapInstructions: TransactionInstruction[] = [];
    for (const itemIx of innerTransactions) {
      createSwapInstructions.push(...itemIx.instructions)
      createSwapInstructions.push(...itemIx.instructions)
    }
    const addressesSwapMain: PublicKey[] = [];
    createSwapInstructions.forEach((ixn) => {
      ixn.keys.forEach((key) => {
        addressesSwapMain.push(key.pubkey);
      });
    });
    const lookupTablesPool = lookupTableProvider.computeIdealLookupTablesForAddresses(addressesMain);
    const lookupTablesSwapMain = lookupTableProvider.computeIdealLookupTablesForAddresses(addressesSwapMain);


    const insts: TransactionInstruction[] = []
    const finalLookupTable = lookupTablesSwapMain.concat(lookupTablesPool);
 

    insts.push(...createPoolInstructions);
    insts.push(...createSwapInstructions)
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

    console.log(finalLookupTable[0].state.addresses);

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
      txMain.sign([wallet.payer]);
    } catch (e) {
      console.log(e, 'error signing txMain');
      process.exit(0);
    }

    const txid = await connection.sendTransaction(txMain);


    console.log(txid)

  })

}

export async function derivePoolKeys(marketId: PublicKey) {
  const marketInfo = await getMarketInfo(marketId);
  const marketDeco = await getDecodedData(marketId);
  const baseMint = marketDeco.baseMint;
  const baseMintData = await getMintData(baseMint);
  const baseDecimals: any = await getDecimals(baseMintData);
  const ownerBaseAta = await getOwnerAta(baseMint, wallet.publicKey);
  const quoteMint: any = marketDeco.quoteMint;
  const quoteMintData = await getMintData(quoteMint);
  const quoteDecimals: any = await getDecimals(quoteMintData);
  const ownerQuoteAta = await getOwnerAta(quoteMint, wallet.publicKey);
  const lpMint = PublicKey.findProgramAddressSync([гayV4.toBuffer(), marketId.toBuffer(), Buffer.from('lp_mint_associated_seed', 'utf-8')], гayV4)[0]
  const ownerLpAta = await getOwnerAta(lpMint, wallet.publicKey);
  const authority = PublicKey.findProgramAddressSync([Buffer.from([97, 189, 189, 32, 97, 117, 116, 184, 111, 114, 105, 116, 121])], гayV4)[0];

  const seeds = [marketId.toBuffer()];
  const seedsWithNonce = seeds.concat(Buffer.from([Number(marketDeco.vaultSignerNonce.toString())]), Buffer.alloc(7));
  const vaultSigner = PublicKey.createProgramAddressSync(seedsWithNonce, openbookProgram)

  const marketAuthority = vaultSigner;


  const poolkeys = {
    keg: TOKEN_PROGRAM_ID,
    version: 4,
    marketVersion: 3,
    programId: гayV4,
    baseMint: baseMint,
    quoteMint: quoteMint,
    OwnerBaseAta: ownerBaseAta,
    ownerQuoteAta: ownerQuoteAta,
    ownerLpAta: ownerLpAta,
    baseDecimals: baseDecimals,
    quoteDecimals: quoteDecimals,
    lpDecimals: baseDecimals,
    authority: authority,
    marketAuthority: marketAuthority,
    nonce: Number(marketDeco.vaultSignerNonce.toString()),
    marketProgramId: openbookProgram,
    marketId: marketId,
    marketBids: marketDeco.bids,
    marketAsks: marketDeco.asks,
    marketQuoteVault: marketDeco.quoteVault, marketBaseVault: marketDeco.baseVault,
    marketEventQueue: marketDeco.eventQueue,
    id: PublicKey.findProgramAddressSync([гayV4.toBuffer(), marketId.toBuffer(), Buffer.from('am_associated_seed', 'utf-8')], гayV4)[0],
    baseVault: PublicKey.findProgramAddressSync([гayV4.toBuffer(), marketId.toBuffer(), Buffer.from('coin_vault_associated_seed', 'utf-8')], гayV4)[0],
    coinVault: PublicKey.findProgramAddressSync([гayV4.toBuffer(), marketId.toBuffer(), Buffer.from('pc_vault_associated_seed', 'utf-8')], гayV4)[0],
    lpMint: lpMint,
    lpVault: PublicKey.findProgramAddressSync([гayV4.toBuffer(), marketId.toBuffer(), Buffer.from('temp_1p_token_associated_seed', 'utf-8')], гayV4)[0],
    targetOrders: PublicKey.findProgramAddressSync([гayV4.toBuffer(), marketId.toBuffer(), Buffer.from('target_associated_seed', 'utf-8')], гayV4)[0],
    withdrawQueue: PublicKey.findProgramAddressSync([гayV4.toBuffer(), marketId.toBuffer(), Buffer.from('withdraw_associated_seed', 'utf-8')], гayV4)[0],
    openOrders: PublicKey.findProgramAddressSync([гayV4.toBuffer(), marketId.toBuffer(), Buffer.from('open_order_associated_seed', 'utf-8')], гayV4)[0],
    quoteVault: PublicKey.findProgramAddressSync([гayV4.toBuffer(), marketId.toBuffer(), Buffer.from('pc_vault_associated_seed', 'utf-8')], гayV4)[0],
    lookupTableAccount: SystemProgram.programId
  };

  return poolkeys;
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
