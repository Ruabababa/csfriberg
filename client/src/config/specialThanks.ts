export interface SpecialThanksItem {
  name: string;
  note?: string;
  image: string;
  href: string;
  analyticsEvent: string;
}

export const SPECIAL_THANKS: SpecialThanksItem[] = [
  {
    name: '怂皇的一天',
    note: 'Bilibili 社区主页',
    image: 'https://i2.hdslb.com/bfs/face/f6be81d793f156fe314ac182a975e9b53dc36e40.jpg@128w_128h_1c_1s.webp',
    href: 'https://space.bilibili.com/290893104',
    analyticsEvent: 'home-special-thanks-bilibili',
  },
];

if (SPECIAL_THANKS.length > 10) {
  throw new Error('SPECIAL_THANKS_LIMIT_EXCEEDED');
}
