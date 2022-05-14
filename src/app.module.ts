import { Module } from '@nestjs/common';
import { MonitoringServiceModule } from './monitoring-service/monitoring-service.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [MonitoringServiceModule, ConfigModule.forRoot()],
  providers: [],
})
export class AppModule {}
