package com.mobile

import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

/**
 * Launches the system package installer for an APK file that updateService.ts
 * has already downloaded to the app's cache dir (RNFS.CachesDirectoryPath).
 * A plain file:// intent would throw FileUriExposedException on Android 7+,
 * so the file is handed over through FileProvider (see file_paths.xml /
 * AndroidManifest.xml's <provider>) as a content:// URI instead.
 */
class ApkInstallerModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "ApkInstaller"

  @ReactMethod
  fun install(filePath: String, promise: Promise) {
    try {
      val context = reactApplicationContext
      val file = File(filePath)
      if (!file.exists()) {
        promise.reject("FILE_NOT_FOUND", "APK dosyası bulunamadı: $filePath")
        return
      }

      val apkUri: Uri = FileProvider.getUriForFile(
        context,
        "${context.packageName}.fileprovider",
        file,
      )

      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(apkUri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }

      // Android 8+ additionally requires the user to have granted the
      // "install unknown apps" permission for this app specifically — if
      // missing, the system installer itself shows that prompt instead of
      // silently failing, so no extra handling is needed here.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        !context.packageManager.canRequestPackageInstalls()
      ) {
        // Still attempt the intent — the OS routes to its own "allow this
        // source" settings screen automatically when this permission is
        // missing, which is the expected first-run flow.
      }

      context.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("INSTALL_FAILED", error.message, error)
    }
  }
}
