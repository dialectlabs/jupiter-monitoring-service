import { Connection, PublicKey } from '@solana/web3.js';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DialectConnection } from './dialect-connection';
import {
  TwitterNotification,
  TwitterNotificationsSink,
} from './twitter-notifications-sink';
import { findJupArbTrades, ArbTradeData } from './jupiter-api';
import {
  Monitors,
  NotificationSink,
  Pipelines,
  ResourceId,
  SourceData,
} from '@dialectlabs/monitor';
import { Duration } from 'luxon';
import { TokenInfo } from '@solana/spl-token-registry';

export const JUP_ABR_POLL_TIME_SEC = 1;
const SOL_STANDARD_TX_FEE = 5000;
const jupV3ProgramIdStr = 'JUP3c2Uh3WA4Ng34tw6kPd2G4C5BB21Xo36Je1s32Ph';
const jupiterV3ProgramId = new PublicKey(
  jupV3ProgramIdStr,
);

interface JupiterArbitrageTrades {
  arbTrades: ArbTradeData[];
}

@Injectable()
export class JupV3ArbMonitoringService implements OnModuleInit, OnModuleDestroy {
  private readonly twitterNotificationSink: NotificationSink<TwitterNotification> =
    new TwitterNotificationsSink();

  private readonly logger = new Logger(JupV3ArbMonitoringService.name);

  constructor(private readonly dialectConnection: DialectConnection) {}

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
      .defineDataSource<JupiterArbitrageTrades>()
      .poll(
        async () => this.getJupArbTradeData(),
        Duration.fromObject({ seconds: JUP_ABR_POLL_TIME_SEC }),
      )
      .transform<ArbTradeData[], ArbTradeData[]>({
        keys: ['arbTrades'],
        pipelines: [Pipelines.added((p1, p2) => p1.txSignature === p2.txSignature)],
      })
      .notify()
      .custom(
        (val) => {
          const tokenData: TokenInfo = val.context.origin.arbTrades[0].tokenData;
          const message = this.constructMessage(val.context.origin);
          this.logger.log(`Pushing notif with ${val.context.origin.arbTrades.length} arbs to twitter sink:\n
          Sigs:\n
          ${val.context.origin.arbTrades[0].txSignature}
          ${val.context.origin.arbTrades[1].txSignature}`);
          //this.logger.log(message);
          return {
            message,
          };
        },
        this.twitterNotificationSink,
        {
          dispatch: 'unicast',
          to: (val) => new PublicKey(jupV3ProgramIdStr),
        }
      )
      .and()
      .build();
    monitor.start();
  }

  private constructMessage(
    jupArbTrades: JupiterArbitrageTrades,
  ): string {
    return [
      ...jupArbTrades.arbTrades.map(
        (it) => {
          //console.log(`Constructing new tweet message for arb trade: ${it}`);
          let jupVersion = 'v3';
          const profit = (parseInt(it.minimumOutAmount) - parseInt(it.inAmount)) / (10 ** it.tokenData.decimals);
          let notifMsg = `📈 📉 ${it.tokenData.symbol} arbitrage trade made on Jupiter ${jupVersion} for a profit of ${profit} ${it.tokenData.symbol}.`;
          if (it.tx.meta?.fee && it.tx.meta.fee != SOL_STANDARD_TX_FEE) {
            notifMsg += `\nArber increased tx fee to ${it.tx.meta.fee/(10**9)} SOL to boost priority.`;
          }
          return notifMsg;
        },
      ),
    ].join('\n');
  }

  private async getJupArbTradeData(): Promise<SourceData<JupiterArbitrageTrades>[]> {
    
    this.logger.log(
      `Polling for new Jupiter v3 arbitrage trades.`,
    );
    let arbTrades: ArbTradeData[] = await findJupArbTrades(jupiterV3ProgramId);

    const sourceData: SourceData<JupiterArbitrageTrades> = {
      groupingKey: 'JupiterArbitrageTrades',
      data: {
        arbTrades: arbTrades,
      },
    };
    return [sourceData];
  }
}
