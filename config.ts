import { Connection, Keypair } from "@solana/web3.js"
import bs58 from 'bs58'

const keyArray=[247,173,213,135,243,221,61,91,176,69,0,17,218,177,179,227,11,31,152,227,62,175,27,186,86,184,201,85,79,110,141,12,69,244,235,195,80,221,92,91,121,31,33,79,86,80,81,62,110,93,221,164,80,129,230,80,8,241,2,89,148,227,153,57]

export const tokenInfo={ 
    tokenName:"WIFBONK",
    decimals:9,
    symbol:"WIFBONK",
    supply: "1000000",
    image: "assets/logo.png", 
    description:"The $WIFBONK is TOKEN By  Team BONK", 
    imgType: 'image/png',
    imgName: 'SOLANA_SPL_TOKEN',  
    addLP: 90, //%ge of supply tokens
    addSol: 1,  
    devnet:true,
    walletCount:20,
    walletAmountsFixed :false,
    walletFixedTokens: 0.1, //%ge of supply tokens -- Only if its fixed
    fixedSolTransfer:0.01,  // sols to transfer to wallets
    wallets:[
        {
            amountToSwap:0.01,
            privateKey:keyArray
        }

    ]
}

 

 
export const devnetKey  = Keypair.fromSecretKey(Uint8Array.from(keyArray))
export const mainnetKey = Keypair.fromSecretKey(Uint8Array.from(keyArray))
export const NFT_STORAGE_TOKEN='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaWQ6ZXRocjoweDAxQzM4ZGVhN0QwQTcxRkIyY0NGOGIzYzliMWVmMDk3Mjc0MUY2ODYiLCJpc3MiOiJuZnQtc3RvcmFnZSIsImlhdCI6MTcwMTkxNDE5MDY3MCwibmFtZSI6Im9yZGluYW5jZSJ9.DR8xEjrABHIXPV3tBktejuG7br0r672brDF4Fy-fvBY'

console.log(bs58.encode(devnetKey.secretKey))

export const privateKey = tokenInfo.devnet ? devnetKey:mainnetKey;

export const RPC_URL = tokenInfo.devnet? 'https://solana-devnet.g.alchemy.com/v2/nRseMC35yPyR6XOdzvbktQ6dlT4Z1OMk':
    'https://api.mainnet-beta.solana.com';

export const connection = new Connection(RPC_URL,'confirmed') 
 