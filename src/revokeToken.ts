import { PublicKey } from "@solana/web3.js";
import { revokeFreezeAuthority, revokeMintAuthority } from "../utils/web3utils";
import { readFile } from "fs";

let baseMint: PublicKey; 

async function start() {

    readFile('./tokenInfo.json', 'utf8', async (error, data) => {
        if (error) {
        //logger.debug(error);
          return;
        }
        const tokenInfo = JSON.parse(data);  
        baseMint = new PublicKey(tokenInfo.baseMint);

        const revokeMint = await revokeMintAuthority(baseMint);
        const revokeFreeze = await revokeFreezeAuthority(baseMint);
 
        if(revokeFreeze && revokeMint){
            console.log("Successfully Revoked , now run 'npm run createMarket' ")
        }

    })

}


start()