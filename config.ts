import { Connection, Keypair } from "@solana/web3.js"

export const tokenInfo={ 
    tokenName:"BONKX",
    decimals:6,
    symbol:"BONX",
    supply: "1000000",
    image: "./logo.png",
    fees:"0.025",
    description:"The $BONKX is a home video game console developed and marketed by Nintendo", 
     imgType: 'image/png',
    imgName: 'SOLANA_SPL_TOKEN', 
    sellerFeeBasisPoints: 500,
    addLP: 90,
    addSol: 0.1,
    transfers:[
        {
            partnerId:'DbGWZNB8e9X8tsVhZuZjCXGxcfRCiRZDLLSNUXwns9Nb',
            partnerShare: 10
        } 
    ],
    createPool: true,
    burnPool:true,
    revokeToken:true,
    startAfterXMinutes: 0,
    devnet:true
}

export const connectionD = new Connection('http://localhost:8899')

export const connection = tokenInfo.devnet? new Connection('https://solana-devnet.g.alchemy.com/v2/HQAlV1C4epoXirkOdOeZPiotmqc7h3XK','confirmed'):  new Connection('https://solana-mainnet.g.alchemy.com/v2/HDr7q2-W0P_Vx9oJ71EU4bw6fnW9YsoF','confirmed')

export const devKey  = Keypair.fromSecretKey(Uint8Array.from([184,220,93,79,111,221,162,175,39,88,186,3,132,85,148,254,67,135,120,119,197,148,223,178,168,160,209,127,142,236,134,116,101,209,141,19,184,25,232,186,98,186,61,206,27,58,91,118,57,252,83,135,76,14,95,100,233,32,194,47,96,104,165,107]))
export const mainnetKey = Keypair.fromSecretKey(Uint8Array.from([51,152,102,132,205,46,150,161,81,71,228,141,154,107,8,187,75,228,35,84,152,242,223,223,37,26,207,177,79,145,66,63,104,209,185,164,84,125,29,63,222,208,111,33,6,51,104,226,189,11,251,5,62,215,113,177,97,26,150,175,200,87,30,167]))
export const NFT_STORAGE_TOKEN='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaWQ6ZXRocjoweDAxQzM4ZGVhN0QwQTcxRkIyY0NGOGIzYzliMWVmMDk3Mjc0MUY2ODYiLCJpc3MiOiJuZnQtc3RvcmFnZSIsImlhdCI6MTcwMTkxNDE5MDY3MCwibmFtZSI6Im9yZGluYW5jZSJ9.DR8xEjrABHIXPV3tBktejuG7br0r672brDF4Fy-fvBY'


export const privateKey = tokenInfo.devnet ? devKey:mainnetKey;

export const RPC_URL = tokenInfo.devnet? 'https://api.devnet.solana.com':'https://solana-mainnet.g.alchemy.com/v2/HDr7q2-W0P_Vx9oJ71EU4bw6fnW9YsoF';



export const mainnetKeyA1 =  tokenInfo.devnet ? devKey:Keypair.fromSecretKey(Uint8Array.from([194,15,87,216,2,103,168,217,83,156,131,243,33,41,231,102,2,50,98,199,245,98,167,0,35,151,137,134,117,222,108,188,215,213,239,173,123,34,254,237,229,68,0,85,39,219,190,55,59,93,149,40,154,200,72,65,133,60,220,253,83,143,201,77]))
export const mainnetKeyB = tokenInfo.devnet ? devKey: Keypair.fromSecretKey(Uint8Array.from([194,15,87,216,2,103,168,217,83,156,131,243,33,41,231,102,2,50,98,199,245,98,167,0,35,151,137,134,117,222,108,188,215,213,239,173,123,34,254,237,229,68,0,85,39,219,190,55,59,93,149,40,154,200,72,65,133,60,220,253,83,143,201,77]))
export const mainnetKeyC = tokenInfo.devnet ? devKey: Keypair.fromSecretKey(Uint8Array.from([194,15,87,216,2,103,168,217,83,156,131,243,33,41,231,102,2,50,98,199,245,98,167,0,35,151,137,134,117,222,108,188,215,213,239,173,123,34,254,237,229,68,0,85,39,219,190,55,59,93,149,40,154,200,72,65,133,60,220,253,83,143,201,77]))
export const mainnetKeyD =  tokenInfo.devnet ? devKey:Keypair.fromSecretKey(Uint8Array.from([194,15,87,216,2,103,168,217,83,156,131,243,33,41,231,102,2,50,98,199,245,98,167,0,35,151,137,134,117,222,108,188,215,213,239,173,123,34,254,237,229,68,0,85,39,219,190,55,59,93,149,40,154,200,72,65,133,60,220,253,83,143,201,77]))
export const mainnetKeyA = tokenInfo.devnet ? devKey: Keypair.fromSecretKey(Uint8Array.from([51,152,102,132,205,46,150,161,81,71,228,141,154,107,8,187,75,228,35,84,152,242,223,223,37,26,207,177,79,145,66,63,104,209,185,164,84,125,29,63,222,208,111,33,6,51,104,226,189,11,251,5,62,215,113,177,97,26,150,175,200,87,30,167]))


export const BLOXAUTH='ODc3NmU3ZjctYjY5Mi00NjliLWE2OTMtNmE5NTg3NTViOWZjOjcwYTlkZWU0MDM4MDE1ZTIzZjRhN2UxNjdiOTMyNzRm';