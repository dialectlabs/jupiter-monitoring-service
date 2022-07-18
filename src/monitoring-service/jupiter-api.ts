import * as anchor from '@project-serum/anchor';
import {
  AccountMeta,
  ParsedMessageAccount,
  Connection,
  PublicKey,
  PartiallyDecodedInstruction,
} from '@solana/web3.js';
import { IDL } from '../idl/jupiter';
import { BorshCoder } from '@project-serum/anchor';
import type { ParsedAccountData } from '@solana/web3.js';
import type { Instruction } from '@project-serum/anchor';
import { InstructionDisplay } from '@project-serum/anchor/dist/cjs/coder/borsh/instruction';
import { TokenInfo, TokenListProvider } from '@solana/spl-token-registry';
import { token } from '@project-serum/anchor/dist/cjs/utils';
import { JUP_ABR_POLL_TIME_SEC } from './monitoring.service';
import { sign } from 'crypto';
import { find } from 'rxjs';

export interface ArbTradeData {
  jupProgramId: PublicKey;
  txSignature: string;
  tx: anchor.web3.ParsedTransactionWithMeta;
  source: PublicKey;
  destination: PublicKey;
  inAmount: string;
  minimumOutAmount: string;
  tokenProgram: PublicKey;
  tokenMint: ParsedAccountData;
  tokenData: TokenInfo;
}

const accountNamesMapping: any = {
  tokenSwap: {
    source: sentenceCase('source'),
    destination: sentenceCase('destination'),
    tokenProgram: sentenceCase('tokenProgram'),
  },
  mercurialExchange: {
    source: sentenceCase('sourceTokenAccount'),
    destination: sentenceCase('destinationTokenAccount'),
    tokenProgram: sentenceCase('tokenProgram'),
  },
  serumSwap: {
    source: sentenceCase('orderPayerTokenAccount'),
    coin: sentenceCase('coinWallet'),
    pc: sentenceCase('pcWallet'),
    tokenProgram: sentenceCase('tokenProgram'),
  },
  stepTokenSwap: {
    source: sentenceCase('source'),
    destination: sentenceCase('destination'),
    tokenProgram: sentenceCase('tokenProgram'),
  },
  saberExchange: {
    source: sentenceCase('inputUserAccount'),
    destination: sentenceCase('outputUserAccount'),
    tokenProgram: sentenceCase('tokenProgram'),
  },
  cropperTokenSwap: {
    source: sentenceCase('source'),
    destination: sentenceCase('destination'),
    tokenProgram: sentenceCase('tokenProgram'),
  },
  raydiumSwap: {
    source: sentenceCase('userSourceTokenAccount'),
    destination: sentenceCase('userDestinationTokenAccount'),
    tokenProgram: sentenceCase('tokenProgram'),
  },
  raydiumSwapV2: {
    source: sentenceCase('userSourceTokenAccount'),
    destination: sentenceCase('userDestinationTokenAccount'),
    tokenProgram: sentenceCase('tokenProgram'),
  },
  aldrinSwap: {
    base: sentenceCase('userBaseTokenAccount'),
    quote: sentenceCase('userQuoteTokenAccount'),
    tokenProgram: sentenceCase('tokenProgram'),
  },
  aldrinV2Swap: {
    base: sentenceCase('userBaseTokenAccount'),
    quote: sentenceCase('userQuoteTokenAccount'),
    tokenProgram: sentenceCase('tokenProgram'),
  },
  cremaTokenSwap: {
    source: sentenceCase('userSourceTokenAccount'),
    destination: sentenceCase('userDestinationTokenAccount'),
    tokenProgram: sentenceCase('tokenProgram'),
  },
  senchaExchange: {
    source: sentenceCase('inputUserAccount'),
    destination: sentenceCase('outputUserAccount'),
    tokenProgram: sentenceCase('tokenProgram'),
  },
};

// This methods will extract the user sender and receiver token accounts for each instruction
function getSenderAndReceiverTokenAccounts(
  accountKeys: ParsedMessageAccount[],
  instruction: PartiallyDecodedInstruction,
) {
  if (!instruction || !instruction.accounts) {
    return null;
  }

  const coder = new BorshCoder(IDL);
  const accountMetas: AccountMeta[] = instruction.accounts.map((pubkey) => {
    const accountKey = accountKeys.find((ak) => {
      return ak.pubkey.equals(pubkey);
    });

    return {
      pubkey,
      isSigner: accountKey ? accountKey.signer : false,
      isWritable: accountKey ? accountKey.writable : false,
    };
  });

  const ix = coder.instruction.decode(instruction.data, 'base58');

  if (ix == null) {
    return;
  }

  if (!Object.keys(accountNamesMapping).includes(ix.name)) {
    return null;
  }

  const format = coder.instruction.format(ix, accountMetas);

  if (format == null) {
    return;
  }

  return extractSenderAndReceiverTokenAccounts(ix, format);
}

function sentenceCase(field: string): string {
  const result = field.replace(/([A-Z])/g, ' $1');
  return result.charAt(0).toUpperCase() + result.slice(1);
}

function extractSenderAndReceiverTokenAccounts(
  ix: Instruction,
  format: InstructionDisplay,
) {
  const accountMapping = accountNamesMapping[ix.name];
  if (!accountMapping) {
    return null;
  }

  let source: PublicKey | undefined;
  let destination: PublicKey | undefined;
  let tokenProgram: PublicKey | undefined;
  let inAmount: string | undefined;
  let minimumOutAmount: string | undefined;

  const ixData: any = ix.data;
  // console.log("inamount: ", format.args)
  // console.log("format: ", format);

  if (!format) {
    return null;
  }

  // Serum destination token account depends on the source token account
  if (ix.name === 'serumSwap') {
    source = format.accounts.find(
      ({ name }) => name === accountMapping['source'],
    )?.pubkey;
    let coin = format.accounts.find(
      ({ name }) => name === accountMapping['coin'],
    )?.pubkey;
    let pc = format.accounts.find(
      ({ name }) => name === accountMapping['pc'],
    )?.pubkey;
    tokenProgram = format.accounts.find(
      ({ name }) => name === accountMapping['tokenProgram'],
    )?.pubkey;

    if (coin != null && source != null) {
      destination = coin.equals(source) ? pc : coin;
    }

    inAmount = format.args.find(({ name }) => name === 'inAmount')?.data;
    minimumOutAmount = format.args.find(
      ({ name }) => name === 'minimumOutAmount',
    )?.data;
  } else if (ix.name === 'aldrinV2Swap' || ix.name == 'aldrinSwap') {
    let sourceKey = (ix.data as any).side.bid ? 'quote' : 'base';
    let destinationKey = (ix.data as any).side.bid ? 'base' : 'quote';

    source = format.accounts.find(
      ({ name }) => name === accountMapping[sourceKey],
    )?.pubkey;
    destination = format.accounts.find(
      ({ name }) => name === accountMapping[destinationKey],
    )?.pubkey;

    tokenProgram = format.accounts.find(
      ({ name }) => name === accountMapping['tokenProgram'],
    )?.pubkey;

    inAmount = format.args.find(({ name }) => name === 'inAmount')?.data;
    minimumOutAmount = format.args.find(
      ({ name }) => name === 'minimumOutAmount',
    )?.data;
  } else {
    source = format.accounts.find(
      ({ name }) => name === accountMapping['source'],
    )?.pubkey;
    destination = format.accounts.find(
      ({ name }) => name === accountMapping['destination'],
    )?.pubkey;

    tokenProgram = format.accounts.find(
      ({ name }) => name === accountMapping['tokenProgram'],
    )?.pubkey;

    inAmount = format.args.find(({ name }) => name === 'inAmount')?.data;
    minimumOutAmount = format.args.find(
      ({ name }) => name === 'minimumOutAmount',
    )?.data;
  }

  if (!source || !destination || !tokenProgram) {
    return null;
  }

  return {
    source,
    destination,
    inAmount,
    minimumOutAmount,
    tokenProgram,
  };
}

export async function findJupArbTrades(jupiterProgramId: PublicKey): Promise<ArbTradeData[]> {
  let arbTrades: ArbTradeData[] = [];
  const connection = new Connection(process.env.RPC_URL!);
  const jupiterV2ProgramId = new PublicKey(
    'JUP2jxvXaqu7NQY1GmNF4m1vodw12LVXYxbFL2uJvfo',
  );
  const jupiterV3ProgramId = new PublicKey(
    'JUP3c2Uh3WA4Ng34tw6kPd2G4C5BB21Xo36Je1s32Ph',
  );
  
  let signatures = await connection.getConfirmedSignaturesForAddress2(jupiterProgramId);

  // concat together several more calls
  // NOTE / TODO: As of July 2022, this appears to catch all jupiter transaction with JUP_ABR_POLL_TIME_SEC at 1 sec
  //   In the future, if jupiterV2ProgramId transactions increase significantly, should continue concating transactions
  //   back in time by simply adding more lines like below. Each time we do this, it grabs the next 1000 signatures
  //   back in time, per getConfirmedSignaturesForAddress2 documentation
  signatures = signatures.concat(await connection.getConfirmedSignaturesForAddress2(jupiterProgramId, { before: signatures[signatures.length - 1].signature }));

  console.log(`Done fetching ${signatures.length} most recent sigs for program: ${jupiterProgramId}`);

  const txs = await Promise.all(
    signatures.map(
      async (signature) =>
        //await connection.getParsedConfirmedTransaction(signature.signature),
        await connection.getParsedTransaction(signature.signature),
    ),
  );
  const tokenListProvider = new TokenListProvider();
  const allTokens = await tokenListProvider.resolve();
  const tokensList = allTokens.filterByClusterSlug('mainnet-beta').getList();

  console.log(`Done fetching ${txs.length} txs.`);
  console.log("Parsing these txs to look for arb trades . . .");
  let numWithAtleastTwoParsedIx = 0;
  let numWithMoreThanTwoParsedIx = 0;
  let lastIrregularFee = -1;
  let irregularFees: number[] = [];
  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i];

    if (tx != null) {

      const allIx: PartiallyDecodedInstruction[] = tx.transaction.message.instructions.map((ix) => {
        return ix as PartiallyDecodedInstruction;
      })

      const allResults: (
        { source: PublicKey; 
          destination: PublicKey; 
          inAmount: string | undefined; 
          minimumOutAmount: string | undefined; 
          tokenProgram: PublicKey; }
         | null 
         | undefined
         )[] = 
      allIx.map(ix => {
        return getSenderAndReceiverTokenAccounts(tx.transaction.message.accountKeys, ix);
      })

      let jupSwapIxs = allResults.filter((res) => {
        return res;
      });
      if (jupSwapIxs.length === 2) {
        numWithAtleastTwoParsedIx++;
        // console.log(`Able to parse: ${jupSwapIxs.length}`);
        // console.log({allIx});
        // console.log({foundResults: jupSwapIxs});
        // Check if it is an arb trade
        if (
          jupSwapIxs[0] &&
          jupSwapIxs[1] &&
          jupSwapIxs[0].inAmount &&
          jupSwapIxs[1].minimumOutAmount &&
          jupSwapIxs[0].source.toBase58() === jupSwapIxs[1].destination.toBase58() &&
          parseInt(jupSwapIxs[0].inAmount) < parseInt(jupSwapIxs[1].minimumOutAmount)
        ) { 
          // Arb trade!
          // console.log('Found a new arb trade:');
          // console.log('source', jupSwapIxs[0].source.toBase58());
          // console.log('destination', jupSwapIxs[1].destination.toBase58());
          // console.log('inAmount', jupSwapIxs[0].inAmount);
          // console.log('minimumOutAmount', jupSwapIxs[1].minimumOutAmount);
          // console.log('tokenProgram', jupSwapIxs[0].tokenProgram.toBase58());
          // console.log('tokenProgram', jupSwapIxs[1].tokenProgram.toBase58());
      
          // Check tx fee
          let isIrregularFee = false;
          if (tx?.meta?.fee && tx?.meta?.fee != 5000) {
            irregularFees.push(tx.meta.fee);
            lastIrregularFee = tx.meta.fee;
            isIrregularFee = true;
          }

          const sourceParsedAccountInfo = await connection.getParsedAccountInfo(
            jupSwapIxs[0].source,
          );
          const destinationParsedAccountInfo =
            await connection.getParsedAccountInfo(jupSwapIxs[1].destination);

          if (
            (sourceParsedAccountInfo.value?.data as ParsedAccountData) &&
            (destinationParsedAccountInfo.value?.data as ParsedAccountData)
          ) {
            // console.log(
            //   'sourceParsedAccountInfo.parsed: ',
            //   (sourceParsedAccountInfo.value?.data as ParsedAccountData).parsed,
            // );
            // console.log(
            //   'destinationParsedAccountInfo.parsed: ',
            //   (destinationParsedAccountInfo.value?.data as ParsedAccountData)
            //     .parsed,
            // );

            const tokenMint = (
              destinationParsedAccountInfo.value?.data as ParsedAccountData
            ).parsed.info.mint;

            const tokenData = tokensList.find(
              ({ address }) => address === tokenMint,
            );

            //console.log('tokenData', tokenData);

            // TODO revisit this logic to decide what tweets are important/interesting.
            // NOTE: artificially limiting number of tweets sent. filtering data for most useful tweets.
            //   Only tweet if irregular fee is used to boost tx priority.

            if (isIrregularFee && arbTrades.length < 2) {
              arbTrades.push({
                jupProgramId: jupiterProgramId,
                txSignature: signatures[i].signature,
                tx: tx,
                source: jupSwapIxs[0].source,
                destination: jupSwapIxs[1].destination,
                inAmount: jupSwapIxs[0].inAmount,
                minimumOutAmount: jupSwapIxs[1].minimumOutAmount,
                tokenProgram: jupSwapIxs[0].tokenProgram,
                tokenMint: tokenMint,
                tokenData: tokenData,
              } as ArbTradeData);
            }
        }

      } else if (jupSwapIxs.length > 2) {
        numWithMoreThanTwoParsedIx++;
      }
      
    }
  }
  }
  console.log("Found arb trades: ", arbTrades);
  console.log(`Total arbs this poll: ${arbTrades.length}`);
  // console.log(`${numWithAtleastTwoParsedIx}`);
  // console.log(`${numWithMoreThanTwoParsedIx}`);
  console.log(`irregular fees: ${irregularFees.length}`);
  if (irregularFees.length > 0) {
    let sum = 0;
    irregularFees.forEach((fee) => {
      sum += fee;
    });
    console.log(`last irregular fee: ${lastIrregularFee}`);
    console.log(`average irregular fee: ${sum / irregularFees.length}`);
  }
  return arbTrades;
}

// Testing Only - only commit if commented out
// (async () => {
//   const jupiterV2ProgramId = new PublicKey(
//     'JUP2jxvXaqu7NQY1GmNF4m1vodw12LVXYxbFL2uJvfo',
//   );
//   const jupiterV3ProgramId = new PublicKey(
//     'JUP3c2Uh3WA4Ng34tw6kPd2G4C5BB21Xo36Je1s32Ph',
//   );
//   let arbs: ArbTradeData[] = [];
//   arbs = await findJupArbTrades(jupiterV2ProgramId);

//   const profit = (parseInt(arbs[0].minimumOutAmount) - parseInt(arbs[0].inAmount)) / (10 ** arbs[0].tokenData.decimals);
//   console.log(`Profit: ${profit} ${arbs[0].tokenData.symbol}.`);
//   arbs = arbs.concat(await findJupArbTrades(jupiterV3ProgramId));
//   console.log(arbs.length);
// })()