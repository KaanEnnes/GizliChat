package com.mobile

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * FloatingChatModule (JS köprüsü) ile FloatingChatService (overlay penceresi)
 * arasındaki tek paylaşılan durum. Gerçek Firestore okuma/yazma işlemleri
 * JS tarafında (chatService.ts, mevcut Firebase JS SDK oturumuyla) yapılıyor —
 * native servis sadece "aptal" bir görüntüleme katmanı: kullanıcı burada
 * yazdığında `floatingChatSend` event'i JS'e gider, JS Firestore'a yazar;
 * yeni mesajlar geldiğinde JS `updateMessages()` ile buraya JSON gönderir.
 */
object FloatingChatBridge {
  var reactContext: ReactApplicationContext? = null
  var currentService: FloatingChatService? = null

  fun emitToJs(eventName: String, params: WritableMap?) {
    reactContext
      ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      ?.emit(eventName, params)
  }

  fun updateMessagesInService(messagesJson: String) {
    currentService?.applyMessages(messagesJson)
  }

  fun sendEventMap(name: String, key: String, value: String) {
    val map = Arguments.createMap()
    map.putString(key, value)
    emitToJs(name, map)
  }
}
