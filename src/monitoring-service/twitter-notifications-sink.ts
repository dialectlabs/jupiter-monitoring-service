import { TwitterApi } from 'twitter-api-v2';
import { Logger } from '@nestjs/common';
import { NotificationSink } from '@dialectlabs/monitor';

export interface TwitterNotification {
  message: string;
}

const maxMsgLen = 250;

export class TwitterNotificationsSink
  implements NotificationSink<TwitterNotification>
{
  private readonly logger = new Logger(TwitterNotificationsSink.name);
  private twitterClient =
    !process.env.TEST_MODE &&
    new TwitterApi({
      appKey: process.env.TWITTER_APP_KEY!,
      appSecret: process.env.TWITTER_APP_SECRET!,
      accessToken: process.env.TWITTER_ACCESS_TOKEN!,
      accessSecret: process.env.TWITTER_ACCESS_SECRET!,
    });

  async push({ message: text }: TwitterNotification): Promise<void> {
    this.logger.log(text);
    if (this.twitterClient) {
      return this.twitterClient!.v2.tweet({
        text,
      }).then();
    }
    return Promise.resolve();
  }
}
