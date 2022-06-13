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

interface JupiterArbitrageTrades {
  arbTrades: ArbTradeData[];
}

@Injectable()
export class MonitoringService implements OnModuleInit, OnModuleDestroy {
  private readonly twitterNotificationSink: NotificationSink<TwitterNotification> =
    new TwitterNotificationsSink();

  private readonly logger = new Logger(MonitoringService.name);

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
        Duration.fromObject({ seconds: 30 }),
      )
      .transform<ArbTradeData[], ArbTradeData[]>({
        keys: ['arbTrades'],
        // TODO compare unique transaction signature, confirm if this is signatures[0]
        pipelines: [Pipelines.added((p1, p2) => p1.tx.transaction.signatures[0] === p2.tx.transaction.signatures[0])],
      })
      .notify()
      .custom(
        (val) => {
          const tokenData: TokenInfo = val.context.origin.arbTrades[0].tokenData;
          const message = this.constructMessage(val.context.origin);
          this.logger.log(`Sending tweet for ${tokenData.symbol} arbitrage trade : ${message}`);
          this.logger.log(message);
          return {
            message,
          };
        },
        this.twitterNotificationSink,
        {
          dispatch: 'broadcast'
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
          // TODO add useful details about arb trade opportunity
          return `📈 📉 New arbitrage trade found on Jupiter for ${it.tokenData.symbol}`;
        },
      ),
    ].join('\n');
  }

  private async getJupArbTradeData(): Promise<SourceData<JupiterArbitrageTrades>[]> {
    this.logger.log(
      `Getting Jupiter arbitrage trade data.`,
    );
    const arbTrades: ArbTradeData[] =  await findJupArbTrades();
    const sourceData: SourceData<JupiterArbitrageTrades> = {
      groupingKey: 'JupiterArbitrageTrades',
      data: {
        arbTrades: arbTrades,
      },
    };
    return [sourceData];
  }
}
