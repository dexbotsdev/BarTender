
import { Connection, Keypair, PublicKey, Signer, Transaction } from "@solana/web3.js";
import { connection, tokenInfo } from "../config";
import { getOrCreateAssociatedTokenAccount, createTransferCheckedInstruction } from "@solana/spl-token";



//sleep function
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

//sending a transaction
export async function sendTx(connection: Connection, transaction: Transaction, signers: Array<Signer>) {

  const hash_info = (await connection.getLatestBlockhashAndContext()).value;

  transaction.recentBlockhash = hash_info.blockhash
  transaction.lastValidBlockHeight = hash_info.lastValidBlockHeight
  transaction.feePayer = signers[0].publicKey


  transaction.sign(...signers);
  const rawTransaction = transaction.serialize();


  var txid: string;
  try {
    txid = await connection.sendRawTransaction(rawTransaction, { skipPreflight: false, })

    if (tokenInfo.devnet)
      console.log(
        ` Transaction: https://solscan.io/tx/${txid}?cluster=devnet`,
      );
    else
      console.log(
        ` Transaction: https://solscan.io/tx/${txid}`,
      );

  }
  catch (e) {
    console.log(e)
    return 1
  }

  while (true) {
    const ret = await connection.getSignatureStatus(txid, { searchTransactionHistory: true })
    try {
      //@ts-ignore
      if (ret) {
        if (ret.value && ret.value.err == null) {
          return txid
        } else if (ret.value && ret.value.err != null) {

          console.log(ret.value.err)
          return 1
        } else {
          continue
        }
      }
    } catch (e) {
      console.log(e)
      return 1
    }

  }

}


export async function getTokenBalance(tokenMintAddress: PublicKey,wallet: Keypair) {
  try {
    const fromTokenAccount = await getOrCreateAssociatedTokenAccount(connection, wallet, tokenMintAddress, wallet.publicKey);
    const tokenAccountBalance = await connection.getTokenAccountBalance(fromTokenAccount.address);
    
    return tokenAccountBalance.value.amount;
  } catch (error) {
      console.error('Error fetching token balance:', error);
  }
} 

export const transferSPL = async (tokenMintAddress: string, amount: string, destAddress: string, txWallet: Keypair) => {

  console.log('WWallet -- 1 '+destAddress);


  const mintPubkey = new PublicKey(tokenMintAddress);

  console.log('WWallet -- 2 '+mintPubkey);


  const destPubkey = new PublicKey(destAddress);

  console.log('WWallet -- 3 '+destPubkey);


  const fromTokenAccount = await getOrCreateAssociatedTokenAccount(connection, txWallet, mintPubkey, txWallet.publicKey);
  const tokenAccountBalance = await connection.getTokenAccountBalance(fromTokenAccount.address);
  if (tokenAccountBalance) {
      const decimals = tokenAccountBalance.value.decimals;
      const toTokenAccount = await getOrCreateAssociatedTokenAccount(connection, txWallet, mintPubkey, destPubkey);

      console.log( amount +":"+ Math.floor(Number(amount) * 10 ** decimals)+":"+ decimals)
      const transaction = new Transaction().add(
          createTransferCheckedInstruction(
              fromTokenAccount.address,
              mintPubkey,
              toTokenAccount.address,
              txWallet.publicKey,
              Math.floor(Number(amount) * 10 ** decimals),
              decimals
          )
      );
      const txhash = await connection.sendTransaction(transaction, [txWallet]);
      return txhash;
  }
  return false;
};