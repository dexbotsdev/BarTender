import { Connection, Keypair } from "@solana/web3.js"

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
    addSol: 2, 
    buySwap:1,
    devnet:false
}

 



export const devKey=[44,218,89,142,101,242,9,58,61,155,90,184,151,166,12,166,163,56,148,78,201,185,134,129,186,3,226,176,9,98,137,147,178,53,178,105,158,179,79,218,208,181,160,123,111,211,47,88,206,6,237,153,97,151,40,216,147,189,83,160,231,160,65,126]
export const mainkey=[158,226,217,5,57,102,17,210,101,243,151,206,128,144,101,151,58,94,141,49,239,233,34,240,233,12,224,159,172,48,59,247,16,208,120,245,138,16,231,39,39,114,230,68,240,189,98,149,39,97,220,227,239,254,146,112,178,92,156,198,72,119,144,101]

export const devnetKey  = Keypair.fromSecretKey(Uint8Array.from(devKey))
export const mainnetKey = Keypair.fromSecretKey(Uint8Array.from(mainkey))
export const NFT_STORAGE_TOKEN='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaWQ6ZXRocjoweDAxQzM4ZGVhN0QwQTcxRkIyY0NGOGIzYzliMWVmMDk3Mjc0MUY2ODYiLCJpc3MiOiJuZnQtc3RvcmFnZSIsImlhdCI6MTcwMTkxNDE5MDY3MCwibmFtZSI6Im9yZGluYW5jZSJ9.DR8xEjrABHIXPV3tBktejuG7br0r672brDF4Fy-fvBY'


export const privateKey = tokenInfo.devnet ? devnetKey:mainnetKey;

export const RPC_URL = tokenInfo.devnet? 'https://solana-devnet.g.alchemy.com/v2/HQAlV1C4epoXirkOdOeZPiotmqc7h3XK':
    'https://solana-mainnet.g.alchemy.com/v2/HQAlV1C4epoXirkOdOeZPiotmqc7h3XK';

    export const connection = new Connection(RPC_URL,'confirmed') 

export const mainnetKeyA1 =  tokenInfo.devnet ? devKey:Keypair.fromSecretKey(Uint8Array.from([194,15,87,216,2,103,168,217,83,156,131,243,33,41,231,102,2,50,98,199,245,98,167,0,35,151,137,134,117,222,108,188,215,213,239,173,123,34,254,237,229,68,0,85,39,219,190,55,59,93,149,40,154,200,72,65,133,60,220,253,83,143,201,77]))
export const mainnetKeyB = tokenInfo.devnet ? devKey: Keypair.fromSecretKey(Uint8Array.from([194,15,87,216,2,103,168,217,83,156,131,243,33,41,231,102,2,50,98,199,245,98,167,0,35,151,137,134,117,222,108,188,215,213,239,173,123,34,254,237,229,68,0,85,39,219,190,55,59,93,149,40,154,200,72,65,133,60,220,253,83,143,201,77]))
export const mainnetKeyC = tokenInfo.devnet ? devKey: Keypair.fromSecretKey(Uint8Array.from([194,15,87,216,2,103,168,217,83,156,131,243,33,41,231,102,2,50,98,199,245,98,167,0,35,151,137,134,117,222,108,188,215,213,239,173,123,34,254,237,229,68,0,85,39,219,190,55,59,93,149,40,154,200,72,65,133,60,220,253,83,143,201,77]))
export const mainnetKeyD =  tokenInfo.devnet ? devKey:Keypair.fromSecretKey(Uint8Array.from([194,15,87,216,2,103,168,217,83,156,131,243,33,41,231,102,2,50,98,199,245,98,167,0,35,151,137,134,117,222,108,188,215,213,239,173,123,34,254,237,229,68,0,85,39,219,190,55,59,93,149,40,154,200,72,65,133,60,220,253,83,143,201,77]))
export const mainnetKeyA = tokenInfo.devnet ? devKey: Keypair.fromSecretKey(Uint8Array.from([243,249,16,92,167,245,23,219,170,14,184,191,87,43,68,68,192,163,63,144,5,98,144,188,34,195,176,72,80,4,57,36,226,121,130,208,116,40,57,235,81,159,94,161,196,205,10,205,32,241,176,142,95,72,23,119,251,95,190,80,149,231,241,127]))


export const BLOXAUTH='ODc3NmU3ZjctYjY5Mi00NjliLWE2OTMtNmE5NTg3NTViOWZjOjcwYTlkZWU0MDM4MDE1ZTIzZjRhN2UxNjdiOTMyNzRm';