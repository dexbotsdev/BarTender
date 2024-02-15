import assert from 'assert';

import {
  DEVNET_PROGRAM_ID,
  jsonInfo2PoolKeys,
  Liquidity,
  LiquidityPoolKeys,
  Percent,
  Token,
  TOKEN_PROGRAM_ID,
  TokenAmount,
} from '@raydium-io/raydium-sdk';
import { Keypair, PublicKey } from '@solana/web3.js';

 
import { formatAmmKeysById } from './formatAmmKeysById';
import { buildAndSendTx, getWalletTokenAccount } from './raydiumUtil';
import { connection, devnetKey } from '../config';
import { makeTxVersion, DEFAULT_TOKEN, wallet, OPENBOOK_DEX_DEVNET } from './constants';
 

type WalletTokenAccounts = Awaited<ReturnType<typeof getWalletTokenAccount>>
type TestTxInputInfo = {
  poolKeys: any,
  outputToken: Token
  targetPool: string
  inputTokenAmount: TokenAmount
  slippage: Percent
  walletTokenAccounts: WalletTokenAccounts
  wallet: Keypair
}

async function swapOnlyAmm(input: TestTxInputInfo) {
  // -------- pre-action: get pool info --------
   const poolKeys = jsonInfo2PoolKeys(input.poolKeys) as LiquidityPoolKeys



  // -------- step 1: coumpute amount out --------
 
  const inputTokenAmount = new TokenAmount(DEFAULT_TOKEN.SOL , 1)
  const outputTokenAmount = new TokenAmount(input.poolKeys.baseMint , 1)
  // -------- step 2: create instructions by SDK function --------
  const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
    connection,
    poolKeys,
    userKeys: {
      tokenAccounts: input.walletTokenAccounts,
      owner: input.wallet.publicKey,
    },
    amountIn: inputTokenAmount,
    amountOut: outputTokenAmount,
    fixedSide: 'in',
    makeTxVersion,
  })

  console.log('amountOut:', inputTokenAmount.toFixed(), '  minAmountOut: ', outputTokenAmount.toFixed())

  return { txids: await buildAndSendTx(innerTransactions) }
}

async function howToUse() {
  const inputToken =  DEFAULT_TOKEN.SOL 
  const outputToken = new Token(TOKEN_PROGRAM_ID, new PublicKey('BoPSK3iuRCrysLjSJCQcb2qZuTaT9ibVeBRYUJ8xPy1M'), 9, 'SHAKIRA', 'SHAKIRA')
  const targetPool = new PublicKey('AG9eDq1LkxCZ6N3YvQBCYZQLs3jQkedWHeiofbS1JMAD') // USDC-RAY pool
  const inputTokenAmount = new TokenAmount(inputToken, 10000)
  const slippage = new Percent(1, 100)
  const walletTokenAccounts = await getWalletTokenAccount(connection, wallet.publicKey)


  const v : 4|5 = 4;

  const poolKeys = await Liquidity.getAssociatedPoolKeys({
    version:v,
    marketVersion:3,
    marketId:targetPool,
    baseMint: outputToken.mint,
    quoteMint: inputToken.mint,
    baseDecimals:9,
    quoteDecimals:9,
    programId:new PublicKey(DEVNET_PROGRAM_ID.AmmV4),
    marketProgramId: new PublicKey(DEVNET_PROGRAM_ID.OPENBOOK_MARKET),
  })

  console.log(poolKeys);

  swapOnlyAmm({
    poolKeys,
    outputToken,
    targetPool:targetPool.toString(),
    inputTokenAmount,
    slippage,
    walletTokenAccounts,
    wallet: devnetKey,
  }).then(({ txids }) => {
    /** continue with txids */
    console.log('txids', txids)
  })
}


howToUse()