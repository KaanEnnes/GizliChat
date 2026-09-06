package com.mobile

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class FloatingChatModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  init {
    FloatingChatBridge.reactContext = reactContext
  }

  override fun getName() = "FloatingChat"

  @ReactMethod
  fun hasOverlayPermission(promise: Promise) {
    val allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
      Settings.canDrawOverlays(reactApplicationContext)
    promise.resolve(allowed)
  }

  @ReactMethod
  fun requestOverlayPermission(promise: Promise) {
    try {
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:${reactApplicationContext.packageName}"),
      ).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactApplicationContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("OVERLAY_SETTINGS_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun isIgnoringBatteryOptimizations(promise: Promise) {
    val powerManager = reactApplicationContext.getSystemService(android.content.Context.POWER_SERVICE) as android.os.PowerManager
    promise.resolve(powerManager.isIgnoringBatteryOptimizations(reactApplicationContext.packageName))
  }

  /**
   * Küçük pencere açıkken uygulama arka plana alınınca (kullanıcı başka bir
   * uygulamaya geçince) gelen mesajların çok gecikmeli görünmesi — bu telefon
   * gibi agresif pil yönetimi yapan cihazlarda (MediaTek/XOS) arka plan
   * uygulamalarının ağ bağlantısının kısıtlanmasından kaynaklanıyor. Bu
   * standart Android izni foreground service'imizin ağ erişimini bu
   * kısıtlamadan muaf tutuyor.
   */
  @ReactMethod
  fun requestIgnoreBatteryOptimizations(promise: Promise) {
    try {
      val intent = Intent(
        Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
        Uri.parse("package:${reactApplicationContext.packageName}"),
      ).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactApplicationContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("BATTERY_SETTINGS_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun show(contactUid: String, contactName: String, myUid: String, themeJson: String, backgroundUri: String, promise: Promise) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(reactApplicationContext)) {
      promise.reject("NO_PERMISSION", "Diğer uygulamaların üzerinde gösterme izni yok")
      return
    }
    try {
      val intent = Intent(reactApplicationContext, FloatingChatService::class.java).apply {
        putExtra("contactUid", contactUid)
        putExtra("contactName", contactName)
        putExtra("myUid", myUid)
        putExtra("themeJson", themeJson)
        putExtra("backgroundUri", backgroundUri)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactApplicationContext.startForegroundService(intent)
      } else {
        reactApplicationContext.startService(intent)
      }
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("SHOW_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun hide(promise: Promise) {
    reactApplicationContext.stopService(Intent(reactApplicationContext, FloatingChatService::class.java))
    promise.resolve(true)
  }

  @ReactMethod
  fun updateMessages(messagesJson: String, promise: Promise) {
    FloatingChatBridge.updateMessagesInService(messagesJson)
    promise.resolve(true)
  }

  // NativeEventEmitter (JS) bu iki metodun var olmasını bekliyor; gerçek
  // event kaydı DeviceEventManagerModule üzerinden otomatik yürüyor, burada
  // yapılacak ekstra bir şey yok.
  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Int) {}
}
