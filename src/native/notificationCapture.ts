import { Capacitor, registerPlugin } from '@capacitor/core'
import type { CapturedNotification } from '../domain/notificationParser'

export type InstalledApp = { packageName: string; label: string }

type NotificationCapturePlugin = {
  isPermissionGranted(): Promise<{ granted: boolean }>
  openPermissionSettings(): Promise<void>
  listApps(): Promise<{ apps: InstalledApp[] }>
  getAllowedPackages(): Promise<{ packages: string[] }>
  setAllowedPackages(options: { packages: string[] }): Promise<void>
  readCaptures(): Promise<{ captures: CapturedNotification[] }>
  removeCaptures(options: { keys: string[] }): Promise<void>
}

export const NotificationCapture = registerPlugin<NotificationCapturePlugin>('NotificationCapture')

export const isCaptureSupported = () => Capacitor.getPlatform() === 'android'
