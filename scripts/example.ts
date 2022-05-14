import { program } from '@project-serum/anchor/dist/cjs/spl/token';
import {
  getAllProposals,
  getAllTokenOwnerRecords,
  getRealms,
  getTokenOwnerRecordsByOwner,
  ProgramAccount,
  Proposal,
  Realm,
  getTokenOwnerRecordForRealm,
  getTokenOwnerRecord,
} from '@solana/spl-governance';
import { Connection, PublicKey } from '@solana/web3.js';

async function run() {
  const connection = new Connection(process.env.RPC_URL!);
  const programId = new PublicKey(
    'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw',
  );

  const realms = await getRealms(connection, programId);

  const owner = await getTokenOwnerRecord(connection, new PublicKey('57xLoAzt4RekTATUqf937BKk1HxPPJfsnrzzC3gcpnjE'));

  console.log(realms.length);
  console.log("owner address: ", owner.account.governingTokenOwner.toBase58());

  // const programAccounts = await connection.getProgramAccounts(
  //   programId,
  // );

  // console.log(programAccounts);
  // console.log(programAccounts[0].account.owner.toBase58());

  // Fetch all the realms data
  // If a realm has a new proposal -> votingProposalCount if it increases
  // Get the new proposal(s) and tweet about it

  // let promises = realms.map(realm => {
  //   return getAllProposals(connection, programId, realm.pubkey);
  // });

  // const realmsPromises = realms.map(async realm => {
  //   return {
  //     realm: realm,
  //     proposals: (await getAllProposals(connection, programId, realm.pubkey)).flat(),
  //     tokenOwnerRecords: await getAllTokenOwnerRecords(connection, programId, realm.pubkey),
  //   };
  // });

  // await Promise.all(realmsPromises);
  for (const realm of realms) {
    if (realm.account.votingProposalCount > 0) {
      console.log('name: ', realm.account.name);
      console.log('accountType: ', realm.account.accountType);
      console.log('votingProposalCount: ', realm.account.votingProposalCount);
      console.log('realm all: ', realm);

      const proposals = (await getAllProposals(
        connection,
        programId,
        realm.pubkey,
      )).flat();

      // for (const proposal of proposals) {
      //   console.log("proposal: ", proposal.account);
      //   console.log(`https://realms.today/dao/${realm.pubkey.toBase58()}/proposal/${proposal.pubkey.toBase58()}`);

      //   console.log("proposal owner wrong ", proposal.account.tokenOwnerRecord.toBase58());
      //   const owner = await getTokenOwnerRecord(connection, proposal.account.tokenOwnerRecord);
      //   console.log("proposal owner correct ", owner.account);
      // }

      // const tokenOwnerRecords = await getAllTokenOwnerRecords(
      //   connection,
      //   programId,
      //   realm.pubkey,
      // );

      // console.log('token owner records length: ', tokenOwnerRecords.length);
      // console.log('token owner records: ', tokenOwnerRecords);

      // for (const tokenHolder of tokenOwnerRecords) {
      //   console.log(
      //     'token holder address: ',
      //     tokenHolder.account.governingTokenOwner.toBase58(),
      //   );
      // }

      break;
    }
  }
}

run();
