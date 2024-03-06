import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { revokeFreezeAuthority, revokeMintAuthority } from "../utils/web3utils";
import { readFile, writeFile } from "fs";
import { connection } from "../config";
import { TOKEN_PROGRAM_ID, getMint } from "@solana/spl-token";
import { Token } from "raydium-sdk-opt";
import bs58 from "bs58";
import { randomInt } from "crypto";
import { transferSPL } from "../utils/send_transaction";
import { wallet } from "../utils/constants";

let baseMint: PublicKey;

async function start() {

    readFile('./tokenInfo.json', 'utf8', async (error, data) => {
        if (error) {
            //logger.debug(error);
            return;
        }
        const tokenInfo = JSON.parse(data);
        const mint = new PublicKey(tokenInfo.baseMint.mint);
        const mintInfo = await getMint(connection, mint);
        const baseToken = new Token(TOKEN_PROGRAM_ID, mint, mintInfo.decimals);
        const quoteToken = new Token(TOKEN_PROGRAM_ID, "So11111111111111111111111111111111111111112", 9, "WSOL", "WSOL");


        tokenInfo.pumpWallets = [];

        writeFile('./tokenInfo.json', JSON.stringify(tokenInfo), (err) => {
            if (err) throw err;
            console.log('The file has been saved! Now run --  npm run addLP');
        });


        for (var i = 0; i < tokenInfo.walletCount; i++) {
            const tokenTransferAmnt = tokenInfo.walletAmountsFixed ? Number(tokenInfo.walletFixedTokens) * Number(tokenInfo.supply) * 0.01 ** mintInfo.decimals : randomInt(10000) * 1 ** mintInfo.decimals;
            const keypair = Keypair.generate();
            const walletAddress = keypair.publicKey.toBase58();
            const privateKey = bs58.encode(keypair.secretKey);
            const signature = await transferSPL(tokenInfo.baseMint.mint, tokenTransferAmnt.toFixed(0), walletAddress, wallet.payer);
            console.log('Tokens  sent:', signature);
            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: wallet.publicKey,
                    toPubkey: new PublicKey(walletAddress),
                    lamports: BigInt(tokenInfo.fixedSolTransfer * 1e9),
                })
            );
            const tnxId = await connection.sendTransaction(transaction,[wallet.payer]);
            console.log('Sols  sent:', signature);
            tokenInfo.pumpWallets.push({
                walletAddress: walletAddress,
                privateKey: privateKey,
                tokenAmount: tokenTransferAmnt,
                solAmount : tokenInfo.fixedSolTransfer
            })

        }


        writeFile('./tokenInfo.json', JSON.stringify(tokenInfo), (err) => {
            if (err) throw err;
            console.log('The file has been saved! Now run --  npm run createPool');
        });


    })

}


start()