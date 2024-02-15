import { AddressLookupTableProgram, Transaction, sendAndConfirmRawTransaction } from "@solana/web3.js";
import { readFile, writeFile } from "fs";
import { wallet } from "./src/constants";
import { connection } from "./config";





async function start() {

    readFile('./tokenInfo.json', 'utf8',  async (error, data) => {
        if (error) {
             
            return;
        }
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash({ commitment: 'finalized' });
        const rslot = await connection.getSlot({commitment:'finalized'});
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

      const info = JSON.parse(data);

      info.lookupTableAddress = lookupTableAddress;


      writeFile('./tokenInfo.json', JSON.stringify(info), (err) => {
          if (err) throw err;
          console.log('The file has been saved! Now run --  npm run createPool');
      });


      console.log()
        

    })

}


start()
