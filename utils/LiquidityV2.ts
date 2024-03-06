import { CacheLTA, ComputeBudgetConfig, InstructionType, Liquidity, LiquiditySwapInstructionSimpleParams, Logger, TOKEN_PROGRAM_ID, Token, TokenAmount, TxVersion, splitTxAndSigners } from 'raydium-sdk-opt';
import { TransactionInstruction, Signer } from '@solana/web3.js';

const logger = Logger.from('LiquidityV2')



export class LiquidityV2 extends Liquidity{



    static async makeSwapInstructionSimple<T extends TxVersion>(
        params: LiquiditySwapInstructionSimpleParams & {
          makeTxVersion: T
          lookupTableCache?: CacheLTA
          computeBudgetConfig?: ComputeBudgetConfig
        },
      ) {
        const {
          connection,
          poolKeys,
          userKeys,
          amountIn,
          amountOut,
          fixedSide,
          config,
          makeTxVersion,
          lookupTableCache,
          computeBudgetConfig,
        } = params
        const { tokenAccounts, owner, payer = owner } = userKeys
    
        logger.debug('amountIn:', amountIn)
        logger.debug('amountOut:', amountOut)
        logger.assertArgument(
          !amountIn.isZero() && !amountOut.isZero(),
          'amounts must greater than zero',
          'currencyAmounts',
          {
            amountIn: amountIn.toFixed(),
            amountOut: amountOut.toFixed(),
          },
        )
    
        const { bypassAssociatedCheck, checkCreateATAOwner } = {
          // default
          ...{ bypassAssociatedCheck: false, checkCreateATAOwner: false },
          // custom
          ...config,
        }
    
        // handle currency in & out (convert SOL to WSOL)
        const tokenIn = amountIn instanceof TokenAmount ? amountIn.token : Token.WSOL
        const tokenOut = amountOut instanceof TokenAmount ? amountOut.token : Token.WSOL
    
        const tokenAccountIn = this._selectTokenAccount({
          programId: TOKEN_PROGRAM_ID,
          tokenAccounts,
          mint: tokenIn.mint,
          owner,
          config: { associatedOnly: false },
        })
        const tokenAccountOut = this._selectTokenAccount({
          programId: TOKEN_PROGRAM_ID,
          tokenAccounts,
          mint: tokenOut.mint,
          owner,
        })
    
        const [amountInRaw, amountOutRaw] = [amountIn.raw, amountOut.raw]
    
        const frontInstructions: TransactionInstruction[] = []
        const endInstructions: TransactionInstruction[] = []
        const frontInstructionsType: InstructionType[] = []
        const endInstructionsType: InstructionType[] = []
        const signers: Signer[] = []
    
        const _tokenAccountIn = await this._handleTokenAccount({
          programId: TOKEN_PROGRAM_ID,
          connection,
          side: 'in',
          amount: amountInRaw,
          mint: tokenIn.mint,
          tokenAccount: tokenAccountIn,
          owner,
          payer,
          frontInstructions,
          endInstructions,
          signers,
          bypassAssociatedCheck,
          frontInstructionsType,
          checkCreateATAOwner,
        })
        const _tokenAccountOut = await this._handleTokenAccount({
          programId: TOKEN_PROGRAM_ID,
          connection,
          side: 'out',
          amount: 0,
          mint: tokenOut.mint,
          tokenAccount: tokenAccountOut,
          owner,
          payer,
          frontInstructions,
          endInstructions,
          signers,
          bypassAssociatedCheck,
          frontInstructionsType,
          checkCreateATAOwner,
        })
    
        const ins = this.makeSwapInstruction({
          poolKeys,
          userKeys: {
            tokenAccountIn: _tokenAccountIn,
            tokenAccountOut: _tokenAccountOut,
            owner,
          },
          amountIn: amountInRaw,
          amountOut: amountOutRaw,
          fixedSide,
        })
        const ins2 = this.makeSwapInstruction({
            poolKeys,
            userKeys: {
              tokenAccountIn: _tokenAccountOut,
              tokenAccountOut: _tokenAccountIn,
              owner,
            },
            amountIn: amountOutRaw,
            amountOut: amountInRaw,
            fixedSide,
          })
        return {
          address: {},
          innerTransactions: await splitTxAndSigners({
            connection,
            makeTxVersion,
            computeBudgetConfig,
            payer,
            innerTransaction: [
              { instructionTypes: frontInstructionsType, instructions: frontInstructions, signers },
              ins.innerTransaction,
              ins2.innerTransaction,
              { instructionTypes: endInstructionsType, instructions: endInstructions, signers: [] },
            ],
            lookupTableCache,
          }),
        }
      }
}