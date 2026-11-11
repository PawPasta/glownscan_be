declare module 'vietqr' {
  export class VietQR {
    genQuickLink(input: {
      bank: string;
      accountName: string;
      accountNumber: string;
      amount: number;
      memo: string;
      template?: string;
    }): string;
  }
}
