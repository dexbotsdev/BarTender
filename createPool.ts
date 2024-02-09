import { connection, mainnetKeyA, privateKey } from "./config";
import { PublicKey } from "@solana/web3.js";
import { DEFAULT_TOKEN, PROGRAMIDS, addLookupTableInfo, makeTxVersion, wallet } from "./src/constants";
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { readFile } from "fs";
import { Liquidity, MARKET_STATE_LAYOUT_V3, Market, Percent, Token, TokenAmount, buildSimpleTransaction } from "@raydium-io/raydium-sdk";
import { BN } from "@project-serum/anchor";
import { ammCreatePool, calcMarketStartPrice, getWalletTokenAccount } from "./src/raydiumUtil";


async function start() {

    readFile('./tokenInfo.json', 'utf8', async (error, data) => {
        if (error) {
            //logger.debug(error);
            return;
        }
        const tokenInfo = JSON.parse(data);
        const baseToken = new Token(TOKEN_PROGRAM_ID, new PublicKey(tokenInfo.baseMint.mint), tokenInfo.baseMint.decimals, tokenInfo.baseMint.name, tokenInfo.baseMint.symbol) // USDC
        const quoteToken = DEFAULT_TOKEN.SOL // RAY
        const targetMarketId = new PublicKey(tokenInfo.marketId)
        const addBaseAmount = new BN(tokenInfo.baseMintAmount) // 10000 / 10 ** 6,
        const addQuoteAmount = new BN(tokenInfo.quoteMintAmount) // 10000 / 10 ** 9,
        const startTime = Math.floor(Date.now() / 1000) + 5 * 60  
        const walletTokenAccounts = await getWalletTokenAccount(connection, wallet.publicKey)

        /* do something with start price if needed */
        const startPrice = calcMarketStartPrice({ addBaseAmount, addQuoteAmount })
        const marketBufferInfo: any = await connection.getAccountInfo(targetMarketId)
        const { baseMint, quoteMint, baseLotSize, quoteLotSize,baseVault,quoteVault,bids,asks,eventQueue } = MARKET_STATE_LAYOUT_V3.decode(marketBufferInfo.data)
        console.log(baseMint.toString(), quoteMint.toString(), baseLotSize.toString(), quoteLotSize.toString());
        let poolKeys :any = Liquidity.getAssociatedPoolKeys({
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



        const slippage = new Percent(1, 100);

        const amountIn = new TokenAmount(quoteToken, "0.1", false);


        console.log(' Creating Swap Transactions '+ amountIn.toFixed());

        const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
            connection,
            poolKeys,
            userKeys: {
                tokenAccounts: walletTokenAccounts,
                owner: mainnetKeyA.publicKey,
            },
            amountIn: amountIn,
            amountOut: new TokenAmount(baseToken,'1',false),
            fixedSide: 'in',
            makeTxVersion,
        });
 
        console.log(' Creating new AMM Pool for marketId '+ tokenInfo.marketId);

        console.log(' Creating Swap Transactions ');

        console.log( innerTransactions)

        const tnxCD =  await buildSimpleTransaction({
            connection,
            makeTxVersion,
            payer: mainnetKeyA.publicKey,
            innerTransactions: innerTransactions,
            addLookupTableInfo: addLookupTableInfo,
          })
          
        ammCreatePool({
            startTime,
            addBaseAmount,
            addQuoteAmount,
            baseToken,
            quoteToken,
            targetMarketId,
            wallet: wallet.payer,
            walletTokenAccounts,
        },tnxCD).then(({ txids }) => {
          
            console.log('txids', txids)
        })

        

    })

}


start()