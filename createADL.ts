import { AddressLookupTableProgram, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmRawTransaction } from "@solana/web3.js";
import { readFile, writeFile } from "fs";
import { DEFAULT_TOKEN, OPENBOOK_DEX_DEVNET, PROGRAMIDS, addLookupTableInfo, feeId, makeTxVersion, wallet } from "./src/constants";
import { connection } from "./config";
import { Token, MARKET_STATE_LAYOUT_V3, DEVNET_PROGRAM_ID, Liquidity, TokenAmount } from "@raydium-io/raydium-sdk";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import { getWalletTokenAccount, calcMarketStartPrice, sendTransaction } from "./src/raydiumUtil";
import { LookupTableProvider } from "./src/LookupTableProvider";





async function start() {

    readFile('./tokenInfo.json', 'utf8',  async (error, data) => {
        if (error) {
             
            return;
        }
        let tokenInfo = JSON.parse(data);

        let { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash({ commitment: 'finalized' });
        const rslot = await connection.getSlot({commitment:'finalized'});
        const baseToken = new Token(TOKEN_PROGRAM_ID, new PublicKey(tokenInfo.baseMint.mint), tokenInfo.baseMint.decimals, tokenInfo.baseMint.name, tokenInfo.baseMint.symbol) // USDC
        const quoteToken = DEFAULT_TOKEN.SOL // RAY
        const targetMarketId = new PublicKey(tokenInfo.marketId)

        const addBaseAmount = new BN(tokenInfo.baseMintAmount)
        const addQuoteAmount = new BN(tokenInfo.quoteMintAmount)

        const startTime = Math.floor(Date.now() / 2000)
        const walletTokenAccounts = await getWalletTokenAccount(connection, wallet.publicKey)

        /* do something with start price if needed */
        const startPrice = calcMarketStartPrice({ addBaseAmount, addQuoteAmount })
        const startPriceReal = calcMarketStartPrice({ addBaseAmount: new BN(tokenInfo.quoteMintAmount), addQuoteAmount: new BN(tokenInfo.quoteMintAmount) })

        const marketBufferInfo: any = await connection.getAccountInfo(targetMarketId)
        let { baseLotSize, quoteLotSize, baseMint, quoteMint, baseVault, quoteVault, bids, asks, eventQueue, requestQueue } = MARKET_STATE_LAYOUT_V3.decode(marketBufferInfo.data)
     
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
        poolKeys.marketBaseVault = baseVault;
        poolKeys.marketQuoteVault = quoteVault;
        poolKeys.marketBids = bids;
        poolKeys.marketAsks = asks;
        poolKeys.marketEventQueue = eventQueue;
        // console.log("Pool Keys:", poolKeys);
        const outputTokenAmount = new TokenAmount(baseToken, 1, false);
        const inTokenAmount = new TokenAmount(DEFAULT_TOKEN.SOL, 0.01, false);
        const lpATA = new LookupTableProvider();


        const [lookupTableInst, lookupTableAddress] =
        AddressLookupTableProgram.createLookupTable({
            authority: wallet.publicKey,
            payer: wallet.publicKey,
            recentSlot: rslot 
        });

        const tnx = new Transaction(); 
        tnx.add(lookupTableInst)
        tnx.feePayer=wallet.publicKey,
        tnx.recentBlockhash= blockhash;
        tnx.sign(wallet.payer);

      const tnxId =   await sendAndConfirmRawTransaction(connection,tnx.serialize(),{commitment:'confirmed'});


     const lookupTableAccount :any = await lpATA.getLookupTable(lookupTableAddress);
      
       
      console.log("Table address from cluster:", lookupTableAccount);
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
  

        console.log(addressesMain)

        // const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
        //     connection,
        //     poolKeys,
        //     userKeys: {
        //         tokenAccounts: walletTokenAccounts,
        //         owner: wallet.publicKey,
        //     },
        //     amountIn: inTokenAmount,
        //     amountOut: outputTokenAmount,
        //     fixedSide: 'in',
        //     makeTxVersion,
        //     lookupTableCache: addLookupTableInfo
        // });
       

      const info = JSON.parse(data);

      info.lookupTableAddress = lookupTableAddress;


      const extendInstruction = AddressLookupTableProgram.extendLookupTable({
        payer: wallet.publicKey,
        authority: wallet.publicKey,
        lookupTable: lookupTableAddress,
        addresses: addressesMain,
    });
    ({ blockhash } = await connection.getLatestBlockhash({ commitment: 'finalized' }));
    const lookup2tx: any = new Transaction();
    lookup2tx.add(extendInstruction)
    lookup2tx.recentBlockhash = blockhash
    lookup2tx.feePayer=wallet.publicKey,
    lookup2tx.recentBlockhash= blockhash;
    lookup2tx.sign(wallet.payer);

    console.log("Adding lookup table address:", lookupTableAddress.toBase58());
   // const tnxId2 =   await sendAndConfirmRawTransaction(connection,lookup2tx.serialize(),{commitment:'confirmed'});


    const lookupTableAccount2 :any = await lpATA.getLookupTable(lookupTableAddress);
    console.log("Table address from cluster:", lookupTableAccount2);

    await sendTransaction([lookup2tx]);
      writeFile('./tokenInfo.json', JSON.stringify(info), (err) => {
          if (err) throw err;
          console.log('The file has been saved! Now run --  npm run createPool');
      });


      console.log()
        

    })

}


start()
