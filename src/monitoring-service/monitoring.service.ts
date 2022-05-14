import { Connection, PublicKey } from '@solana/web3.js';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DialectConnection } from './dialect-connection';
import {
  getAllProposals,
  getAllTokenOwnerRecords,
  getRealms,
  getTokenOwnerRecord,
  ProgramAccount,
  Proposal,
  Realm,
} from '@solana/spl-governance';
import {
  TwitterNotification,
  TwitterNotificationsSink,
} from './twitter-notifications-sink';

import {
  Monitors,
  NotificationSink,
  Pipelines,
  ResourceId,
  SourceData,
} from '@dialectlabs/monitor';
import { Duration } from 'luxon';

const mainnetPK = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

const connection = new Connection(
  process.env.REALMS_PRC_URL ?? process.env.RPC_URL!,
);

interface RealmData {
  realm: ProgramAccount<Realm>;
  proposals: ProgramAccount<Proposal>[];
  realmMembersSubscribedToNotifications: Record<string, PublicKey>;
}

type TokenOwnerRecordToGoverningTokenOwnerType = {
  [key: string]: string;
};

/*
Realms use case:
When a proposal is added to a realm -
1. send a tweet out

---

* global data fetch
1. Fetch all realms
2. Fetch all proposals

* filter or detect diff
3. Look for diffs in the proposals array
4. When finding a proposal added or removed
5. Send out tweet for new proposal
*/

@Injectable()
export class MonitoringService implements OnModuleInit, OnModuleDestroy {
  private readonly notificationSink: NotificationSink<TwitterNotification> =
    new TwitterNotificationsSink();

  private readonly logger = new Logger(MonitoringService.name);
  private tokenOwnerRecordToGoverningTokenOwner: TokenOwnerRecordToGoverningTokenOwnerType =
    {};

  constructor(private readonly dialectConnection: DialectConnection) {}

  private static async getProposals(realm: ProgramAccount<Realm>) {
    const proposals = (
      await getAllProposals(connection, mainnetPK, realm.pubkey)
    ).flat();
    if (process.env.TEST_MODE) {
      return proposals.slice(
        0,
        Math.round(Math.random() * Math.max(0, proposals.length - 3)),
      );
    }
    return proposals;
  }

  async onModuleInit() {
    this.initMonitor();
  }

  async onModuleDestroy() {
    await Monitors.shutdown();
  }

  private initMonitor() {
    const monitor = Monitors.builder({
      monitorKeypair: this.dialectConnection.getKeypair(),
      dialectProgram: this.dialectConnection.getProgram(),
    })
      .defineDataSource<RealmData>()
      .poll(
        async (subscribers) => this.getRealmsData(subscribers),
        Duration.fromObject({ seconds: 60 }),
      )
      .transform<ProgramAccount<Proposal>[], ProgramAccount<Proposal>[]>({
        keys: ['proposals'],
        pipelines: [Pipelines.added((p1, p2) => p1.pubkey.equals(p2.pubkey))],
      })
      .notify()
      .dialectThread(
        ({ value, context }) => {
          const realmName: string = context.origin.realm.account.name;
          const realmId: string = context.origin.realm.pubkey.toBase58();
          const message: string = this.constructMessage(
            realmName,
            realmId,
            value,
          );
          this.logger.log(`Sending dialect message: ${message}`);
          return {
            message: message,
          };
        },
        (
          {
            context: {
              origin: { realmMembersSubscribedToNotifications },
            },
          },
          recipient,
        ) => !!realmMembersSubscribedToNotifications[recipient.toBase58()],
      )
      .custom<TwitterNotification>(({ value, context }) => {
        const realmName: string = context.origin.realm.account.name;
        const realmId: string = context.origin.realm.pubkey.toBase58();
        const message = this.constructMessage(realmName, realmId, value);
        this.logger.log(`Sending tweet for ${realmName} : ${message}`);
        return {
          message,
        };
      }, this.notificationSink)
      .and()
      .dispatch('broadcast')
      .build();
    monitor.start();
  }

  private constructMessage(
    realmName: string,
    realmId: string,
    proposalsAdded: ProgramAccount<Proposal>[],
  ): string {
    return [
      ...proposalsAdded.map(
        (it) => {
          let walletAddress = this.tokenOwnerRecordToGoverningTokenOwner[
            it.account.tokenOwnerRecord.toBase58()
          ];

          if (walletAddress) {
            walletAddress = `${walletAddress.substring(0, 5)}...${walletAddress.substring(walletAddress.length - 5)}`;
          }

          return `📜 New proposal for ${realmName}: https://realms.today/dao/${realmId}/proposal/${it.pubkey.toBase58()}
${it.account.name}${
  walletAddress
    ? ` added by ${
        walletAddress
      }`
    : ''
}`;
        },
      ),
    ].join('\n');
  }

  private async getRealmsData(
    subscribers: ResourceId[],
  ): Promise<SourceData<RealmData>[]> {
    this.logger.log(
      `Getting realms data for ${subscribers.length} subscribers`,
    );
    const realms = await getRealms(connection, mainnetPK);
    let realmsPromises = realms.map(async (realm) => {
      return {
        realm: realm,
        proposals: await MonitoringService.getProposals(realm),
        tokenOwnerRecords: await getAllTokenOwnerRecords(
          connection,
          mainnetPK,
          realm.pubkey,
        ),
      };
    });

    if (process.env.TEST_MODE) {
      realmsPromises = realmsPromises.slice(0, 20);
    }

    const subscribersSet = Object.fromEntries(
      subscribers.map((it) => [it.toBase58(), it]),
    );

    this.logger.log(
      `Getting all realms data for ${realmsPromises.length} realms`,
    );
    const realmsData = await Promise.all(realmsPromises);
    this.logger.log(
      `Completed getting all realms data for ${realmsData.length} realms`,
    );

    const allProposals: ProgramAccount<Proposal>[] = realmsData
      .map((it) => {
        return it.proposals;
      })
      .flat();

    this.logger.log(
      `Getting all proposal owners for ${allProposals.length} proposals`,
    );

    const proposalsWithOwnerAddressPromises = allProposals.map(
      async (proposal) => {
        return {
          ...proposal,
          tokenOwnerRecord: await getTokenOwnerRecord(
            connection,
            proposal.account.tokenOwnerRecord,
          ),
        };
      },
    );

    const proposalsWithOwnerAddress = await Promise.all(
      proposalsWithOwnerAddressPromises,
    );

    this.tokenOwnerRecordToGoverningTokenOwner = Object.fromEntries(
      proposalsWithOwnerAddress.map((it) => [
        it.account.tokenOwnerRecord.toBase58(),
        it.tokenOwnerRecord.account.governingTokenOwner.toBase58(),
      ]),
    );

    this.logger.log(
      `Completed getting all proposal owners for ${allProposals.length} proposals`,
    );

    return realmsData.map((it) => {
      const realmMembersSubscribedToNotifications: Record<string, PublicKey> =
        process.env.TEST_MODE
          ? Object.fromEntries(subscribers.map((it) => [it.toBase58(), it]))
          : Object.fromEntries(
              it.tokenOwnerRecords
                .map((it) => it.account.governingTokenOwner)
                .filter((it) => subscribersSet[it.toBase58()])
                .map((it) => [it.toBase58(), it]),
            );
      const sourceData: SourceData<RealmData> = {
        resourceId: it.realm.pubkey,
        data: {
          realm: it.realm,
          proposals: it.proposals,
          realmMembersSubscribedToNotifications,
        },
      };
      return sourceData;
    });
  }
}
