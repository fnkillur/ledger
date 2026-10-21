import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.teo.ledger',
  appName: '가계부',
  webDir: 'dist',
  plugins: {
    CapacitorHttp: { enabled: true },
  },
}

export default config
