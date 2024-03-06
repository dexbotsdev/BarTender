import { Connection, Keypair } from "@solana/web3.js"

export const  devKey=[155,16,137,64,184,35,81,185,19,133,229,35,172,185,230,123,71,78,187,97,113,237,14,123,180,168,47,170,122,123,114,105,187,19,135,4,73,123,236,202,93,65,211,172,65,28,29,147,248,41,147,214,107,240,40,33,101,14,102,193,193,139,255,100]
export const mainkey=[133,41,27,234,252,71,171,219,120,172,222,143,96,186,175,132,178,169,157,108,81,213,87,23,123,51,211,90,240,252,181,149,187,246,109,231,206,214,166,253,47,22,41,21,67,143,58,194,237,144,61,25,66,11,254,25,182,195,34,138,227,56,107,63]

export const tokenInfo={ 
    tokenName:"WIFBONK",
    decimals:9,
    symbol:"WIFBONK",
    supply: "1000000",
    image: "./logo.png",
    fees:"0.025",
    description:"The $WIFBONK is TOKEN By  Team BONK", 
     imgType: 'image/png',
    imgName: 'SOLANA_SPL_TOKEN', 
    sellerFeeBasisPoints: 500,
    addLP: 90,
    addSol: 1,  
    devnet:true,
    wallets:[
        {
            amountToSwap:0.01,
            privateKey:devKey
        }

    ]
}

 

 
export const devnetKey  = Keypair.fromSecretKey(Uint8Array.from(devKey))
export const mainnetKey = Keypair.fromSecretKey(Uint8Array.from(mainkey))
export const NFT_STORAGE_TOKEN='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaWQ6ZXRocjoweDAxQzM4ZGVhN0QwQTcxRkIyY0NGOGIzYzliMWVmMDk3Mjc0MUY2ODYiLCJpc3MiOiJuZnQtc3RvcmFnZSIsImlhdCI6MTcwMTkxNDE5MDY3MCwibmFtZSI6Im9yZGluYW5jZSJ9.DR8xEjrABHIXPV3tBktejuG7br0r672brDF4Fy-fvBY'


export const privateKey = tokenInfo.devnet ? devnetKey:mainnetKey;

export const RPC_URL = tokenInfo.devnet? 'https://solana-devnet.g.alchemy.com/v2/nRseMC35yPyR6XOdzvbktQ6dlT4Z1OMk':
    'https://api.mainnet-beta.solana.com';

export const connection = new Connection(RPC_URL,'confirmed') 
 