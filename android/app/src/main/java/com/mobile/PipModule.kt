package com.mobile

import android.app.PictureInPictureParams
import android.os.Build
import android.util.Rational
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Sohbeti Android'in resmi Picture-in-Picture penceresine küçültür — WhatsApp'ın
 * video görüşmelerde kullandığı sistemle aynı OS mekanizması. Balon/ikon
 * gerektirmez (ekranda görünür bir iz bırakmaz), OS'in kendi küçük yüzer
 * pencere çerçevesi ve kapatma jesti/X butonu kullanılır.
 */
class PipModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "PipMode"

  @ReactMethod
  fun isSupported(promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    val supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
      activity != null &&
      activity.packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_PICTURE_IN_PICTURE)
    promise.resolve(supported)
  }

  @ReactMethod
  fun enter(promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "Aktif activity bulunamadı")
      return
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      promise.reject("UNSUPPORTED", "Bu Android sürümü PIP desteklemiyor")
      return
    }
    try {
      val params = PictureInPictureParams.Builder()
        .setAspectRatio(Rational(9, 16))
        .build()
      val entered = activity.enterPictureInPictureMode(params)
      promise.resolve(entered)
    } catch (error: Exception) {
      promise.reject("PIP_FAILED", error.message, error)
    }
  }
}
