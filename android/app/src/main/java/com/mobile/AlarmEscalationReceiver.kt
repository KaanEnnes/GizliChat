package com.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager

private const val CHANNEL_ID = "chat_alarm_escalation"
private const val PREFS_NAME = "gizlichat_alarm_escalation"

/**
 * Fires ~15 minutes after an unread chat notification, however long the
 * screen has been off in the meantime (AlarmEscalationModule schedules this
 * with setExactAndAllowWhileIdle, which wakes the device from Doze). Uses a
 * plain platform Notification here instead of notifee/JS on purpose: the app
 * process may be fully dead by the time this runs, and a BroadcastReceiver is
 * guaranteed to run regardless.
 */
class AlarmEscalationReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val senderId = intent.getStringExtra("senderId") ?: return
    val scheduledAt = intent.getLongExtra("scheduledAt", 0L)

    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    prefs.edit().remove("pending_$senderId").apply()

    // Already opened the chat since this alarm was scheduled — nothing to do.
    val openedAt = prefs.getLong("opened_$senderId", 0L)
    if (openedAt >= scheduledAt) {
      return
    }

    val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    ensureChannel(context, notificationManager)

    val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()
    val contentPendingIntent = PendingIntent.getActivity(
      context,
      senderId.hashCode(),
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val notification = Notification.Builder(context, CHANNEL_ID)
      .setContentTitle("Mini Oyunlar")
      .setContentText("Kaçırdığın bir şey var, kontrol et!")
      .setSmallIcon(context.applicationInfo.icon)
      .setContentIntent(contentPendingIntent)
      .setFullScreenIntent(contentPendingIntent, true)
      .setAutoCancel(true)
      .setCategory(Notification.CATEGORY_ALARM)
      .build()

    notificationManager.notify("alarm_$senderId".hashCode(), notification)
  }

  private fun ensureChannel(context: Context, notificationManager: NotificationManager) {
    if (notificationManager.getNotificationChannel(CHANNEL_ID) != null) {
      return
    }
    val alarmSoundUri = RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
    val channel = NotificationChannel(CHANNEL_ID, "Kaçırılan bildirim alarmı", NotificationManager.IMPORTANCE_HIGH)
    val audioAttributes = android.media.AudioAttributes.Builder()
      .setUsage(android.media.AudioAttributes.USAGE_ALARM)
      .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    channel.setSound(alarmSoundUri, audioAttributes)
    channel.enableVibration(true)
    channel.vibrationPattern = longArrayOf(0, 800, 400, 800, 400, 800)
    notificationManager.createNotificationChannel(channel)
  }
}
