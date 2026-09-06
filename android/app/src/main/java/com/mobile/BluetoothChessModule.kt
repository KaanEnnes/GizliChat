package com.mobile

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothServerSocket
import android.bluetooth.BluetoothSocket
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.BufferedReader
import java.io.IOException
import java.io.InputStreamReader
import java.io.OutputStream
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Offline two-device chess over classic Bluetooth (RFCOMM/SPP) — "yan yana"
 * (sitting next to each other) play with no internet, no Firebase room.
 * Deliberately paired-devices-only: the user pairs the two phones once via
 * the OS Bluetooth settings (standard flow, no extra permission dance), then
 * picks a bonded device from getPairedDevices() here — this avoids the
 * separate BLUETOOTH_SCAN discovery permission entirely, only
 * BLUETOOTH_CONNECT (already declared in AndroidManifest.xml for the
 * call-audio-routing feature) is needed.
 *
 * One phone calls startServer() (becomes the RFCOMM listener / "beyaz"),
 * the other calls connectToDevice() with the host's paired MAC address
 * ("siyah"). Once connected, both sides exchange newline-delimited JSON move
 * messages over the socket; ChessRoomScreen.tsx owns the actual chess rules
 * (this module only ever moves opaque strings).
 */
class BluetoothChessModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    // Arbitrary but fixed app-specific UUID — both sides must use the same
    // one to find each other's RFCOMM service record.
    private val GAME_UUID: UUID = UUID.fromString("7a2f9e2e-3b7a-4b8e-9c2a-6f6e6a7c9d10")
  }

  private val adapter: BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()
  private val ioExecutor = Executors.newCachedThreadPool()
  private var serverSocket: BluetoothServerSocket? = null
  private var activeSocket: BluetoothSocket? = null
  private var outputStream: OutputStream? = null
  @Volatile private var listening = false

  override fun getName() = "BluetoothChess"

  private fun hasConnectPermission(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      return true
    }
    return ContextCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.BLUETOOTH_CONNECT) ==
      PackageManager.PERMISSION_GRANTED
  }

  private fun emit(eventName: String, params: com.facebook.react.bridge.WritableMap?) {
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, params)
  }

  @ReactMethod
  fun isSupported(promise: Promise) {
    promise.resolve(adapter != null)
  }

  @ReactMethod
  fun isEnabled(promise: Promise) {
    promise.resolve(adapter?.isEnabled == true)
  }

  @ReactMethod
  fun requestEnable(promise: Promise) {
    // No SDK-level "request enable" without an Activity result callback
    // plumbed through here — simplest reliable option is sending the user to
    // the system Bluetooth toggle directly via the same Settings-deep-link
    // pattern already used for overlay/battery permissions in this project.
    try {
      val intent = android.content.Intent(android.provider.Settings.ACTION_BLUETOOTH_SETTINGS).apply {
        addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactApplicationContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("BLUETOOTH_SETTINGS_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun getPairedDevices(promise: Promise) {
    if (!hasConnectPermission()) {
      promise.reject("NO_PERMISSION", "Bluetooth bağlantı izni yok")
      return
    }
    try {
      val devices: WritableArray = Arguments.createArray()
      adapter?.bondedDevices?.forEach { device: BluetoothDevice ->
        val entry = Arguments.createMap()
        entry.putString("name", device.name ?: device.address)
        entry.putString("address", device.address)
        devices.pushMap(entry)
      }
      promise.resolve(devices)
    } catch (error: SecurityException) {
      promise.reject("NO_PERMISSION", error.message, error)
    }
  }

  private fun beginReading(socket: BluetoothSocket) {
    ioExecutor.execute {
      try {
        val reader = BufferedReader(InputStreamReader(socket.inputStream))
        while (listening) {
          val line = reader.readLine() ?: break
          val map = Arguments.createMap()
          map.putString("data", line)
          emit("BluetoothChess:data", map)
        }
      } catch (error: IOException) {
        // Falls through to the disconnect notification below regardless of
        // whether this was a clean close or a dropped connection.
      } finally {
        listening = false
        emit("BluetoothChess:disconnected", null)
      }
    }
  }

  @ReactMethod
  fun startServer(promise: Promise) {
    if (!hasConnectPermission()) {
      promise.reject("NO_PERMISSION", "Bluetooth bağlantı izni yok")
      return
    }
    val bt = adapter
    if (bt == null || !bt.isEnabled) {
      promise.reject("BLUETOOTH_DISABLED", "Bluetooth kapalı")
      return
    }
    try {
      serverSocket?.close()
    } catch (_: IOException) {
      // ignore
    }
    ioExecutor.execute {
      try {
        val server = bt.listenUsingRfcommWithServiceRecord("MiniOyunlarChess", GAME_UUID)
        serverSocket = server
        val socket = server.accept() // blocks until the other side connects
        serverSocket = null
        try {
          server.close()
        } catch (_: IOException) {
          // ignore — the accepted socket is independent of the listener
        }
        activeSocket = socket
        outputStream = socket.outputStream
        listening = true
        val map = Arguments.createMap()
        map.putString("name", socket.remoteDevice.name ?: socket.remoteDevice.address)
        emit("BluetoothChess:connected", map)
        beginReading(socket)
      } catch (error: Exception) {
        val map = Arguments.createMap()
        map.putString("message", error.message ?: "Bağlantı kurulamadı")
        emit("BluetoothChess:error", map)
      }
    }
    promise.resolve(true)
  }

  @ReactMethod
  fun connectToDevice(address: String, promise: Promise) {
    if (!hasConnectPermission()) {
      promise.reject("NO_PERMISSION", "Bluetooth bağlantı izni yok")
      return
    }
    val bt = adapter
    if (bt == null || !bt.isEnabled) {
      promise.reject("BLUETOOTH_DISABLED", "Bluetooth kapalı")
      return
    }
    ioExecutor.execute {
      try {
        val device = bt.getRemoteDevice(address)
        // Cancelling discovery isn't needed since we never start it
        // (paired-devices-only), but it's cheap insurance against a slow
        // connect if the OS is scanning for some unrelated reason.
        bt.cancelDiscovery()
        val socket = device.createRfcommSocketToServiceRecord(GAME_UUID)
        socket.connect() // blocks until connected or throws
        activeSocket = socket
        outputStream = socket.outputStream
        listening = true
        val map = Arguments.createMap()
        map.putString("name", device.name ?: device.address)
        emit("BluetoothChess:connected", map)
        beginReading(socket)
      } catch (error: Exception) {
        val map = Arguments.createMap()
        map.putString("message", error.message ?: "Bağlantı kurulamadı")
        emit("BluetoothChess:error", map)
      }
    }
    promise.resolve(true)
  }

  @ReactMethod
  fun sendData(data: String, promise: Promise) {
    val stream = outputStream
    if (stream == null) {
      promise.reject("NOT_CONNECTED", "Bağlantı yok")
      return
    }
    ioExecutor.execute {
      try {
        stream.write((data + "\n").toByteArray(Charsets.UTF_8))
        stream.flush()
      } catch (error: IOException) {
        val map = Arguments.createMap()
        map.putString("message", error.message ?: "Gönderilemedi")
        emit("BluetoothChess:error", map)
      }
    }
    promise.resolve(true)
  }

  @ReactMethod
  fun disconnect(promise: Promise) {
    listening = false
    try {
      activeSocket?.close()
    } catch (_: IOException) {
      // ignore
    }
    try {
      serverSocket?.close()
    } catch (_: IOException) {
      // ignore
    }
    activeSocket = null
    serverSocket = null
    outputStream = null
    promise.resolve(true)
  }

  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Int) {}
}
