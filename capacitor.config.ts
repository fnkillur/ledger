import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.teo.ledger',
  appName: '가뿌까',
  webDir: 'dist',
  // 웹 화면이 그려지기 전 잠깐 보이는 WebView 바탕을 시작 화면과 같은 색으로 맞춰 흰 화면이 튀지 않게 한다.
  backgroundColor: '#f7f6f3',
  plugins: {
    CapacitorHttp: { enabled: true },
    // 시스템 시작 화면(아이콘)을 웹 시작 화면(아이콘 + 이름)이 그려질 때까지 붙잡아 두어, 아이콘이 사라졌다 다시 나타나지 않게 한다.
    SplashScreen: { launchAutoHide: false, backgroundColor: '#f7f6f3', showSpinner: false },
  },
}

export default config
