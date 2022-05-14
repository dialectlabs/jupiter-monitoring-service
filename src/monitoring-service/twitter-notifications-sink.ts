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
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });

  async push({ message }: TwitterNotification): Promise<void> {
    let shortenedText = message.replace(/\s+/g, ' ').slice(0, maxMsgLen);
    // TODO: replace links with 23 characters (https://help.twitter.com/en/using-twitter/how-to-tweet-a-link)
    // const lastIndexOfSpace = shortenedText.lastIndexOf(' ');
    // shortenedText =
    //   lastIndexOfSpace === -1
    //     ? shortenedText
    //     : shortenedText.slice(0, lastIndexOfSpace);
    this.logger.log(shortenedText);
    this.twitterClient &&
      (await this.twitterClient.v2
        .tweet({
          text: shortenedText,
        })
        .catch(() => this.logger.error(it)));
    return;
  }
}
