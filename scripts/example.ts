import * as anchor from '@project-serum/anchor';
import {
  AccountMeta,
  ParsedMessageAccount,
  Connection,
  PublicKey,
  PartiallyDecodedInstruction,
} from '@solana/web3.js';
import { IDL } from '../src/idl/jupiter';
import { BorshCoder } from '@project-serum/anchor';
import type { ParsedAccountData } from '@solana/web3.js';
import type { Instruction } from '@project-serum/anchor';
import { InstructionDisplay } from '@project-serum/anchor/dist/cjs/coder/borsh/instruction';
import { TokenListProvider } from '@solana/spl-token-registry';
import { token } from '@project-serum/anchor/dist/cjs/utils';

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

async function run() {
  const connection = new Connection(process.env.RPC_URL!);
  const jupiterV2ProgramId = new PublicKey(
    'JUP2jxvXaqu7NQY1GmNF4m1vodw12LVXYxbFL2uJvfo',
  );

  const signatures = await connection.getConfirmedSignaturesForAddress2(
    jupiterV2ProgramId,
  );

  console.log('signatures: ', signatures.length);

  const txs = await Promise.all(
    signatures.map(
      async (signature) =>
        await connection.getParsedConfirmedTransaction(signature.signature),
    ),
  );

  const tokenListProvider = new TokenListProvider();

  const allTokens = await tokenListProvider.resolve();

  const tokensList = allTokens.filterByClusterSlug('mainnet-beta').getList();

  console.log('txs: ', txs[0]?.transaction.message);

  // const transactions = await connection.getTransaction(signatures[0].signature);

  console.log('done fetching transactions we have ', txs.length);

  for (let i = 0; i < txs.length; i++) {
    // const signature = signatures[i];

    const tx = txs[i];

    if (tx != null) {
      const ix = tx.transaction.message
        .instructions[2] as PartiallyDecodedInstruction;

      if (ix == null) {
        continue;
      }

      const result = getSenderAndReceiverTokenAccounts(
        tx.transaction.message.accountKeys,
        ix,
      );

      // Found an arb trade
      if (
        result &&
        result.inAmount &&
        result.minimumOutAmount &&
        result.inAmount != 'null' &&
        result.source.toBase58() === result.destination.toBase58() &&
        parseInt(result.inAmount) < parseInt(result.minimumOutAmount)
      ) {
        console.log('source', result.source.toBase58());
        console.log('destination', result.destination.toBase58());
        console.log('inAmount', result.inAmount);
        console.log('minimumOutAmount', result.minimumOutAmount);
        console.log('tokenProgram', result.tokenProgram.toBase58());

        const sourceParsedAccountInfo = await connection.getParsedAccountInfo(
          result.source,
        );
        const destinationParsedAccountInfo =
          await connection.getParsedAccountInfo(result.destination);

        if (
          (sourceParsedAccountInfo.value?.data as ParsedAccountData) &&
          (destinationParsedAccountInfo.value?.data as ParsedAccountData)
        ) {
          console.log(
            'sourceParsedAccountInfo.parsed: ',
            (sourceParsedAccountInfo.value?.data as ParsedAccountData).parsed,
          );
          console.log(
            'destinationParsedAccountInfo.parsed: ',
            (destinationParsedAccountInfo.value?.data as ParsedAccountData)
              .parsed,
          );

          const tokenMint = (
            destinationParsedAccountInfo.value?.data as ParsedAccountData
          ).parsed.info.mint;

          const tokenData = tokensList.find(
            ({ address }) => address === tokenMint,
          );

          console.log('tokenData', tokenData);
        }
        // console.log("sourceParsedAccountInfo: ", sourceParsedAccountInfo);
      }
    }
  }
}

run();
