package com.mobile

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import android.os.SystemClock
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

private const val PREFS_NAME = "gizlichat_alarm_escalation"
private const val EXTRA_SENDER_ID = "senderId"
private const val EXTRA_SCHEDULED_AT = "scheduledAt"

/**
 * Native side of the "15 dk boyunca bakılmadığında alarm çalsın" setting
 * (default OFF, see notificationService.isAlarmEscalationEnabled). A JS
 * `setTimeout` can't do this: the app's JS engine is not guaranteed to be
 * alive for the full 15 minutes once the screen goes off or the app is
 * backgrounded/killed, however long that stays true — only the OS-level
 * AlarmManager, which can wake the device from Doze, is reliable for an
 * unbounded wait like this. State (which sender has a pending escalation,
 * and when a chat was last opened) lives in SharedPreferences instead of
 * JS/AsyncStorage because AlarmEscalationReceiver fires in a plain
 * BroadcastReceiver with no React context guaranteed to exist.
 */
class AlarmEscalationModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AlarmEscalation"

  private fun prefs(): SharedPreferences =
    reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  private fun pendingIntentFor(senderId: String, scheduledAt: Long): PendingIntent {
    val intent = Intent(reactApplicationContext, AlarmEscalationReceiver::class.java).apply {
      putExtra(EXTRA_SENDER_ID, senderId)
      putExtra(EXTRA_SCHEDULED_AT, scheduledAt)
    }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    return PendingIntent.getBroadcast(reactApplicationContext, senderId.hashCode(), intent, flags)
  }

  /**
   * Schedules the escalation only if one isn't already pending for this
   * sender — a burst of several messages from the same contact must not keep
   * pushing the 15-minute window out further, it should fire 15 minutes
   * after the FIRST unread one.
   */
  @ReactMethod
  fun scheduleEscalation(senderId: String, delayMs: Double) {
    val prefsKey = "pending_$senderId"
    if (prefs().getBoolean(prefsKey, false)) {
      return
    }
    val scheduledAt = System.currentTimeMillis()
    val triggerAtElapsed = SystemClock.elapsedRealtime() + delayMs.toLong()
    val pendingIntent = pendingIntentFor(senderId, scheduledAt)
    val alarmManager = reactApplicationContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        alarmManager.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAtElapsed, pendingIntent)
      } else {
        alarmManager.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAtElapsed, pendingIntent)
      }
      prefs().edit().putBoolean(prefsKey, true).putLong("scheduledAt_$senderId", scheduledAt).apply()
    } catch (e: SecurityException) {
      // Android 12+ (API 31) requires the user to grant "Alarms & reminders"
      // for exact alarms; if it's not granted, silently skip rather than
      // crash — this is an opt-in extra, not core notification delivery.
    }
  }

  @ReactMethod
  fun cancelEscalation(senderId: String) {
    val alarmManager = reactApplicationContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    alarmManager.cancel(pendingIntentFor(senderId, 0))
    prefs().edit().remove("pending_$senderId").remove("scheduledAt_$senderId").apply()
  }

  /**
   * Called when a chat room is opened for `senderId` — records "seen now" so
   * that if an escalation alarm is already in flight (can't be cancelled
   * reliably if the process is about to die anyway) the receiver still knows
   * to skip it, and also cancels/clears the pending flag for the normal case.
   */
  @ReactMethod
  fun markChatOpened(senderId: String) {
    prefs().edit().putLong("opened_$senderId", System.currentTimeMillis()).apply()
    cancelEscalation(senderId)
  }
}
