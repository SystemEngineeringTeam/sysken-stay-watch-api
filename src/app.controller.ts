import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { UserService } from './service/user.service';
import { User as UserModel } from '@prisma/client';
import { AppService } from './app.service';
import { Stayer as StayerModel } from '@prisma/client';
import { StayerService } from './service/stayer.service';
import { json } from 'stream/consumers';

@Controller('api')
export class AppController {
  private MACList: { MACAddresses: string[] };
  private getarpTime: Date;
  private arpList: { MACAddresses: string[]; GetTime: Date };

  constructor(
    private readonly appService: AppService,
    private readonly userService: UserService,
    private readonly stayerService: StayerService,
  ) {}

  //デバッグ用
  @Get('hello')
  getHello(): string {
    return 'Hello from API!';
  }

  //ユーザの全情報を取得
  @Get('users/get')
  async getUsers() {
    const stayersData: {
      id: number;
      name: string;
      grade: string;
      student_number: string;
      MACAddress: string;
    }[] = await this.userService.getUsers();
    const returnData = {
      users: stayersData,
    };

    return returnData;
  }

  //ユーザ登録
  @Post('user/add')
  async addUser(
    @Body()
    postsData: {
      user: {
        name: string;
        grade: string;
        studentNumber: string;
        MACAddress: string;
      };
    },
  ): Promise<UserModel> {
    const { user } = postsData;
    return this.userService.addUser({
      name: user.name,
      grade: user.grade,
      student_number: user.studentNumber,
      MACAddress: user.MACAddress,
    });
  }

  //ユーザ削除
  @Delete('user/delete')
  async deleteUser(
    @Body()
    { user: { id } },
  ): Promise<UserModel> {
    this.stayerService.deleteStayerByUserID(+id);
    return this.userService.deleteUser(+id);
  }

  //現在の滞在者を取得(名前、学年、滞在開始時間)
  @Get('stayers/get')
  async getStayers() {
    const stayersData: { user_id: number; startTime: Date }[] =
      await this.stayerService.getNowStayersTime();

    //stayersDataのuser_idから現在の滞在者情報(名前、学年)を取得
    const stayersID: number[] = stayersData.map((stayer) => stayer.user_id);
    const stayersInfo: { id: number; name: string; grade: string }[] =
      await this.userService.getStayersInfo(stayersID);

    //stayersDataとstayersInfoを結合し整形
    const stayers = stayersInfo.map((stayerInfo) => {
      const stayer = stayersData.find(
        (stayer) => stayer.user_id === stayerInfo.id,
      );
      return {
        name: stayerInfo.name,
        grade: stayerInfo.grade,
        startTime: stayer.startTime,
      };
    });

    const returnData = {
      stayers: stayers,
    };

    return returnData;
  }

  //滞在履歴を取得(名前、学年、滞在開始時間、滞在終了時間)
  @Get('stayhistory/get')
  async getStayhistory() {
    const stayhistoryData: {
      id: number;
      user_id: number;
      startTime: Date;
      endTime: Date;
    }[] = await this.stayerService.getOldStayersTime();

    console.log(stayhistoryData.length);

    //stayhistoryDataのuser_idから滞在者情報(名前、学年)を取得
    const stayersID: number[] = stayhistoryData.map((stayer) => stayer.user_id);
    const stayersInfo: { id: number; name: string; grade: string }[] =
      await this.userService.getStayersInfo(stayersID);

    //stayhistoryDataとstayersInfoを結合し整形
    const stayhistory_null = stayhistoryData.map((stayer) => {
      const stayerInfo = stayersInfo.find(
        (stayerInfo) => stayer.user_id === stayerInfo.id,
      );
      if(stayerInfo != undefined){
        return {
          name: stayerInfo.name,
          grade: stayerInfo.grade,
          startTime: stayer.startTime,
          endTime: stayer.endTime,
        };
      }
    });

    //nullを削除
    const stayhistory = stayhistory_null.filter((stayer) => stayer != undefined);

    const returnData = {
      history: stayhistory,
    };

    return returnData;
  }

  //滞在者情報の追加
  @Post('stayer/add')
  async addStayer(
    @Body()
    postsData: {
      stayer: {
        user_id: number;
        startTime: Date;
        endTime: Date;
      };
    },
  ): Promise<StayerModel> {
    const { stayer } = postsData;
    return this.stayerService.addStayer({
      user_id: stayer.user_id,
      startTime: stayer.startTime,
      endTime: stayer.endTime,
    });
  }

  //ARPサーバからMACアドレスを送信
  //入退室者を更新する
  @Post('register/set')
  async setMACaddresses(@Body() requestBody: { MACAddresses: string[] }) {
    console.log(requestBody);
    this.MACList = requestBody;
    this.getarpTime = new Date();

    /* 入室者と退室者の判定と更新 */
    //ARPサーバから送られてきたMACAddressを配列に格納
    const NowMACAddresses = requestBody.MACAddresses;

    //滞在中のstayersのuserテーブルのID(stayersID)の取得
    const stayersData: { user_id: number }[] =
      await this.stayerService.getStayersID();
    const stayersID: number[] = stayersData.map((stayer) => stayer.user_id);
    //stayersIDからMACAddressを取得
    const OldMACAddress = await this.userService.getMACaddress(stayersID);

    //入室者を出す
    const NewMACAddresses: string[] = NowMACAddresses.filter(
      (NowMACAddress) =>
        !OldMACAddress.some(
          (OldMACAddress) => OldMACAddress.MACAddress === NowMACAddress,
        ),
    );

    console.log(NewMACAddresses);

    //退出者を出す
    const ExitMACAddresses = OldMACAddress.filter(
      (OldMACAddress) =>
        !NowMACAddresses.some(
          (NowMACAddress) => NowMACAddress === OldMACAddress.MACAddress,
        ),
    );

    //NewMACAddresses内のMACAddressから、滞在者情報をstayersテーブルに格納
    const NewUserIDs = await this.userService.getUserID(NewMACAddresses);
    console.log(NewUserIDs);
    NewUserIDs.forEach(async (NewUserID) => {
      await this.stayerService.addStayer({
        user_id: NewUserID.id,
        startTime: new Date(),
        endTime: null,
      });
    });

    //ExitMACAddresses内のMACAddressから、滞在者情報をstayersテーブルのendTImeを更新
    const OldUserIDs = await this.userService.getUserID(
      ExitMACAddresses.map((ExitMACAddresses) => ExitMACAddresses.MACAddress),
    );
    OldUserIDs.forEach(async (OldUserID) => {
      await this.stayerService.updateEndTime(OldUserID.id);
    });

    /* 滞在履歴の削除(12時間経過した滞在履歴を削除 */
    //滞在履歴の取得(滞在者は含まない)
    const stayer = await this.stayerService.getOldStayersTime();

    //現在時刻の取得
    const now = new Date();

    //滞在終了時間が720時間前より前かどうかを判定
    const isOlderThan12Hours = (endTime: Date, now: Date): boolean => {
      const twelveHoursAgo = new Date(now.getTime() - 24 * 30 * 60 * 60 * 1000); // 720時間前(30日前)の時刻
      return endTime <= twelveHoursAgo;
    };

    //12時間経過した滞在履歴を削除
    stayer.forEach(async (stayer) => {
      const etBool = isOlderThan12Hours(stayer.endTime, now);
      if (etBool) {
        await this.stayerService.deleteStayer(stayer.id);
      }
    });

    return requestBody;
  }

  //ARPサーバから受け取ったMACアドレスを返す
  @Get('arp/get')
  async getARP(): Promise<{ MACAddresses: string[]; GetTime: Date }> {
    return {
      MACAddresses: this.MACList.MACAddresses,
      GetTime: this.getarpTime,
    };
  }
}
