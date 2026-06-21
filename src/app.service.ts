import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): { hi: string } {
    return {
      hi: 'Hello World!',
    };
  }
}
