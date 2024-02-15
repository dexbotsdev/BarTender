import { connection, privateKey, NFT_STORAGE_TOKEN, tokenInfo, RPC_URL } from "./config";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { Metaplex, keypairIdentity, toBigNumber, irysStorage, token } from "@metaplex-foundation/js";
import { METAPLEX, SOL, metadata, revokeFreezeAuthority, revokeMintAuthority, umi, uploadImage, userWallet, userWalletSigner } from "./src/web3utils";
import { CandyMachine } from "@metaplex-foundation/mpl-candy-machine";
import { generateSigner, percentAmount, signerIdentity } from "@metaplex-foundation/umi";
import { DEFAULT_TOKEN, PROGRAMIDS, TransactionWithSigners, wallet } from "./src/constants";
import { TokenStandard, createAndMint, mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { ACCOUNT_SIZE, TOKEN_PROGRAM_ID, createInitializeAccountInstruction, createMint, mintTo } from '@solana/spl-token';
import { readFile, writeFile } from "fs";
import { getVaultOwnerAndNonce } from "./src/serum";
import { sendSignedTransaction, signTransactions } from "./src/utils";
import { BN } from "@project-serum/anchor";
import { DexInstructions, Market } from "@project-serum/serum";
import { Token } from "@raydium-io/raydium-sdk";

let baseMint: PublicKey;
let baseMintDecimals: number;
let quoteMint: PublicKey;
let quoteMintDecimals: number;
const vaultInstructions: TransactionInstruction[] = [];
const vaultSigners: Keypair[] = [];
const marketInstructions: TransactionInstruction[] = [];
const marketSigners: Keypair[] = [];

const totalEventQueueSize = 11308
const totalRequestQueueSize = 844
const totalOrderbookSize = 14524
const TRANSACTION_MESSAGES = [
    {
        sendingMessage: "Creating mints.",
        successMessage: "Created mints successfully.",
    },
    {
        sendingMessage: "Creating vaults.",
        successMessage: "Created vaults successfully.",
    },
    {
        sendingMessage: "Creating market.",
        successMessage: "Created market successfully.",
    },
];
const programID = new PublicKey(PROGRAMIDS.OPENBOOK_MARKET);

async function start() {

    readFile('./tokenInfo.json', 'utf8', async (error, data) => {
        if (error) {
            //logger.debug(error);
            return;
        }
        let tokenInfo = JSON.parse(data);
        baseMint = new PublicKey(tokenInfo.baseMint);
        baseMintDecimals = tokenInfo.decimals;
        quoteMint = new PublicKey(SOL);
        quoteMintDecimals = 9;


        const marketAccounts = {
            market: Keypair.generate(),
            requestQueue: Keypair.generate(),
            eventQueue: Keypair.generate(),
            bids: Keypair.generate(),
            asks: Keypair.generate(),
            baseVault: Keypair.generate(),
            quoteVault: Keypair.generate(),
        };

        const [vaultOwner, vaultOwnerNonce] = await getVaultOwnerAndNonce(
            marketAccounts.market.publicKey,
            programID
        );
        // create vaults
        vaultInstructions.push(
            ...[
                SystemProgram.createAccount({
                    fromPubkey: wallet.publicKey,
                    newAccountPubkey: marketAccounts.baseVault.publicKey,
                    lamports: await connection.getMinimumBalanceForRentExemption(
                        ACCOUNT_SIZE
                    ),
                    space: ACCOUNT_SIZE,
                    programId: TOKEN_PROGRAM_ID,
                }),
                SystemProgram.createAccount({
                    fromPubkey: wallet.publicKey,
                    newAccountPubkey: marketAccounts.quoteVault.publicKey,
                    lamports: await connection.getMinimumBalanceForRentExemption(
                        ACCOUNT_SIZE
                    ),
                    space: ACCOUNT_SIZE,
                    programId: TOKEN_PROGRAM_ID,
                }),
                createInitializeAccountInstruction(
                    marketAccounts.baseVault.publicKey,
                    baseMint,
                    vaultOwner
                ),
                createInitializeAccountInstruction(
                    marketAccounts.quoteVault.publicKey,
                    quoteMint,
                    vaultOwner
                ),
            ]
        );

        vaultSigners.push(marketAccounts.baseVault, marketAccounts.quoteVault);

        // tickSize and lotSize here are the 1e^(-x) values, so no check for ><= 0
        const baseLotSize = Math.round(
            10 ** baseMintDecimals * Math.pow(10, -1 * baseMintDecimals)
        );
        const quoteLotSize = Math.round(
            10 ** quoteMintDecimals *
            Math.pow(10, -1 * baseMintDecimals) *
            Math.pow(10, -1 * -2)
        );


           // create market account
           marketInstructions.push(
            SystemProgram.createAccount({
                newAccountPubkey: marketAccounts.market.publicKey,
                fromPubkey: privateKey.publicKey,
                space: Market.getLayout(programID).span,
                lamports: await connection.getMinimumBalanceForRentExemption(
                    Market.getLayout(programID).span
                ),
                programId: programID,
            })
        );

        // create request queue
        marketInstructions.push(
            SystemProgram.createAccount({
                newAccountPubkey: marketAccounts.requestQueue.publicKey,
                fromPubkey: privateKey.publicKey,
                space: totalRequestQueueSize,
                lamports: await connection.getMinimumBalanceForRentExemption(
                    totalRequestQueueSize
                ),
                programId: programID,
            })
        );

        // create event queue
        marketInstructions.push(
            SystemProgram.createAccount({
                newAccountPubkey: marketAccounts.eventQueue.publicKey,
                fromPubkey: wallet.publicKey,
                space: totalEventQueueSize,
                lamports: await connection.getMinimumBalanceForRentExemption(
                    totalEventQueueSize
                ),
                programId: programID,
            })
        );

        const orderBookRentExempt = await connection.getMinimumBalanceForRentExemption(totalOrderbookSize);

        // create bids
        marketInstructions.push(
            SystemProgram.createAccount({
                newAccountPubkey: marketAccounts.bids.publicKey,
                fromPubkey: wallet.publicKey,
                space: totalOrderbookSize,
                lamports: orderBookRentExempt,
                programId: programID,
            })
        );

        // create asks
        marketInstructions.push(
            SystemProgram.createAccount({
                newAccountPubkey: marketAccounts.asks.publicKey,
                fromPubkey: wallet.publicKey,
                space: totalOrderbookSize,
                lamports: orderBookRentExempt,
                programId: programID,
            })
        );

        marketSigners.push(
            marketAccounts.market,
            marketAccounts.requestQueue,
            marketAccounts.eventQueue,
            marketAccounts.bids,
            marketAccounts.asks
        );


        marketInstructions.push(
            DexInstructions.initializeMarket({
                market: marketAccounts.market.publicKey,
                requestQueue: marketAccounts.requestQueue.publicKey,
                eventQueue: marketAccounts.eventQueue.publicKey,
                bids: marketAccounts.bids.publicKey,
                asks: marketAccounts.asks.publicKey,
                baseVault: marketAccounts.baseVault.publicKey,
                quoteVault: marketAccounts.quoteVault.publicKey,
                baseMint,
                quoteMint,
                baseLotSize: new BN(baseLotSize),
                quoteLotSize: new BN(quoteLotSize),
                feeRateBps: 0, // Unused in v3
                quoteDustThreshold: new BN(1), // Unused in v3
                vaultSignerNonce: vaultOwnerNonce,
                programId: programID,
            })
        );

        const transactionWithSigners: TransactionWithSigners[] = [];
        transactionWithSigners.push(
            {
                transaction: new Transaction().add(...vaultInstructions),
                signers: vaultSigners,
            },
            {
                transaction: new Transaction().add(...marketInstructions),
                signers: marketSigners,
            }
        );

        try {

            console.log(`${marketAccounts.market.publicKey.toBase58()}`);

            const signedTransactions: Transaction[] = await signTransactions({
                transactionsAndSigners: transactionWithSigners,
                wallet,
                connection,
            });
            console.log(signedTransactions);




            // looping creates weird indexing issue with transactionMessages
            const a = await sendSignedTransaction({
                signedTransaction: signedTransactions[0],
                connection,
                skipPreflight: false,
                successCallback: async (txSig) => {

                    console.log(signedTransactions.length > 2
                        ? TRANSACTION_MESSAGES[0].successMessage
                        : TRANSACTION_MESSAGES[1].successMessage)
                },
                sendingCallback: async () => {
                    console.log(signedTransactions.length > 2
                        ? TRANSACTION_MESSAGES[0].sendingMessage
                        : TRANSACTION_MESSAGES[1].sendingMessage)
                },
            });

            if (a) {
                const b = await sendSignedTransaction({
                    signedTransaction: signedTransactions[1],
                    connection,
                    skipPreflight: false,
                    successCallback: async (txSig) => {

                        console.log(signedTransactions.length > 2
                            ? TRANSACTION_MESSAGES[1].successMessage
                            : TRANSACTION_MESSAGES[2].successMessage)

                    },
                    sendingCallback: async () => {
                        console.log(signedTransactions.length > 2
                            ? TRANSACTION_MESSAGES[1].sendingMessage
                            : TRANSACTION_MESSAGES[2].sendingMessage)
                    },
                });
            }

            if (signedTransactions.length > 2) {
                const c = await sendSignedTransaction({
                    signedTransaction: signedTransactions[2],
                    connection,
                    skipPreflight: false,
                    successCallback: async (txSig) => {


                        console.log(TRANSACTION_MESSAGES[2].successMessage)

                    },
                    sendingCallback: async () => {
                        console.log(TRANSACTION_MESSAGES[2].sendingMessage)
                    },
                });
            }

            console.log(`MARKET ID -     ${marketAccounts.market.publicKey.toBase58()}`)
            console.log(`BASE MINT -     ${baseMint.toBase58()}`)
            console.log(`QUOTE MINT -     ${quoteMint.toBase58()}`)
            console.log(`SUPPLY  -     ${metadata.tokenSupply}`)
            const tokenPoolInfo ={
                baseMint: new Token(TOKEN_PROGRAM_ID, baseMint, tokenInfo.decimals, tokenInfo.tokenName, tokenInfo.symbol),
                quoteMint:DEFAULT_TOKEN.SOL,
                baseMintAmount: (0.01)*tokenInfo.addLP*Number(tokenInfo.supply)* 10 ** tokenInfo.decimals,
                quoteMintAmount: tokenInfo.addSol* 10 ** 9,
                marketId:marketAccounts.market.publicKey
              }

            tokenInfo ={
                ...tokenInfo,
                ...tokenPoolInfo
            }
            writeFile('./tokenInfo.json',JSON.stringify(tokenInfo), (err) => {
                if (err) throw err;
                console.log('The file has been saved! Now run --  npm run createLookup');
              });

        } catch (e) {
            console.error("[explorer]: ", e); 
        }
    })

}


start()