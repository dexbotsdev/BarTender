import { ExtensionType, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotent, createInitializeMintInstruction, createInitializeTransferFeeConfigInstruction, getAssociatedTokenAddress, getMintLen, getTransferFeeAmount, mintTo, unpackAccount, withdrawWithheldTokensFromAccounts } from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { AccountsAmount } from "./types";
import { NFTStorage } from 'nft.storage';
import { METADATA_2022_PROGRAM_ID, METADATA_2022_PROGRAM_ID_TESTNET, SUPPORTED_CHAINS } from "./constants";
import { Metaplex, keypairIdentity, toBigNumber, irysStorage } from "@metaplex-foundation/js";
import * as fs from 'fs';
import * as mime from 'mime';
import { File } from "nft.storage";
import { NFT_STORAGE_TOKEN, RPC_URL, connection, privateKey, tokenInfo } from "../config";
import path from "path";
import { toMetaplexFile } from "@metaplex-foundation/js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { createSignerFromKeypair } from "@metaplex-foundation/umi";
import * as splToken from "@solana/spl-token";

export const METAPLEX = Metaplex.make(connection)
    .use(keypairIdentity(privateKey))
    .use(irysStorage({
        address: 'https://node2.irys.xyz',
        providerUrl: RPC_URL,
        timeout: 60000,
    }));

function validateAddress(address: string) {
    let isValid = false;
    // Check if the address is valid
    try {
        new PublicKey(address);
        isValid = true;
    } catch (error) {
        console.error('Invalid address:', error);
    }
    return isValid;
}

export async function initSolanaWeb3Connection(rpc: string): Promise<Connection> {
    let connection: Connection = new Connection(rpc, 'confirmed');
    try {
        connection = new Connection(rpc, 'confirmed');
    } catch (error) {
        console.error('Invalid address:', error);
    }
    return connection;
}


async function fileFromPath(filePath: string) {
    const content = await fs.promises.readFile(filePath)
    return new File([content], path.basename(filePath))
}

export async function uploadImageLogo(imagePath: string, name: string, symbol: string, description: string) {
    let imageUrl = ""


    try {

        const client = new NFTStorage({ token: NFT_STORAGE_TOKEN })
        const metadataInfo = await client.store({
            name: name,
            symbol: symbol,
            description: description,
            image: await fileFromPath(imagePath)
        })

        imageUrl = `https://${metadataInfo.ipnft}.ipfs.nftstorage.link/metadata.json`;
    } catch (ex) {
        console.log(ex)
    }
    return imageUrl
}
export async function uploadImage(fileName: string): Promise<string> {
    console.log(`Step 1 - Uploading Image`);
    const imgBuffer = fs.readFileSync(fileName);
    const imgMetaplexFile = toMetaplexFile(imgBuffer, fileName);
    const imgUri = await METAPLEX.storage().upload(imgMetaplexFile);
    console.log(`   Image URI:`, imgUri); return imgUri;
}
export async function uploadMetadata(imgUri: string, imgType: string) {
    console.log(`Step 2 - Uploading Metadata`);

    const { uri } = await METAPLEX
        .nfts()
        .uploadMetadata({
            name: tokenInfo.tokenName,
            description: tokenInfo.description + ` \n Telegram : https://t.me/${tokenInfo.symbol}_portal`,
            image: imgUri,
            properties: {
                files: [
                    {
                        type: imgType,
                        uri: imgUri,
                    },
                ]
            }
        });
    console.log('   Metadata URI:', uri);
    return uri;
}
interface Metadata {
    name: string;
    symbol: string;
    uri: string;
    tokenSupply: string;
    description: string;
}
export const metadata: Metadata = {
    name: tokenInfo.tokenName,
    symbol: tokenInfo.symbol,
    uri: null!,
    tokenSupply: tokenInfo.supply,
    description: tokenInfo.description + ` \n Telegram : https://t.me/${tokenInfo.symbol}_portal`
};
interface CreateMarketInfo {
    baseToken: PublicKey;
    quoteToken: PublicKey;
    baseLotSize: number;
    quoteLotSize: number;
    feeRateBps: number;
}
export const umi = createUmi(RPC_URL);
export const userWallet = umi.eddsa.createKeypairFromSecretKey(privateKey.secretKey);
export const userWalletSigner = createSignerFromKeypair(umi, userWallet);
export const SOL = 'So11111111111111111111111111111111111111112';


export async function revokeMintAuthority(baseMint: PublicKey) {

    try{
        let authorityTransaction = new Transaction().add(
            splToken.createSetAuthorityInstruction(
                baseMint,
                privateKey.publicKey,
                splToken.AuthorityType.MintTokens,
                null,
                [],
                TOKEN_PROGRAM_ID
            )
        );
        console.log(`REVOKING MINT AUTHORITY  -     `) 
    
        const transactionId = await sendAndConfirmTransaction(
            connection,
            authorityTransaction,
            [privateKey]
        ).catch((error) => {
            console.log(error)
        }) 
        console.log(`REVOKED MINT AUTHORITY  -     ` + transactionId)
    
        return transactionId;
    }catch(error){
        console.log(error);

        return null;
    }
   
}

export async function revokeFreezeAuthority(baseMint: PublicKey) {

    try{
        let authorityTransaction = new Transaction().add(
            splToken.createSetAuthorityInstruction(
                baseMint,
                privateKey.publicKey,
                splToken.AuthorityType.FreezeAccount,
                null,
                [],
                TOKEN_PROGRAM_ID
            )
        );
        console.log(`REVOKING FREEZE AUTHORITY  -     `) 
    
        const transactionId = await sendAndConfirmTransaction(
            connection,
            authorityTransaction,
            [privateKey]
        ).catch((error) => {
            console.log(error)
        }) 
        console.log(`REVOKED FREEZE AUTHORITY  -     ` + transactionId)
    
        return transactionId;
    }catch(error){
        console.log(error);

        return null;
    }
   
}
