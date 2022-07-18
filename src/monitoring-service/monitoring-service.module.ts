import { Module } from '@nestjs/common';
import { JupV2ArbMonitoringService } from './jupV2ArbMonitoring.service';
import { DialectConnection } from './dialect-connection';
import { JupV3ArbMonitoringService } from './jupV3ArbMonitoring.service';

@Module({
  controllers: [],
  providers: [
    {
      provide: DialectConnection,
      useValue: DialectConnection.initialize(),
    },
    JupV2ArbMonitoringService,
    JupV3ArbMonitoringService,
  ],
})
export class MonitoringServiceModule {}
