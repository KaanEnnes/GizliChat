package com.mobile

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Base64
import android.util.TypedValue
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.ListView
import android.widget.TextView
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject

/**
 * The floating window's colors, mirroring the main app's ThemePalette (see
 * src/theme/ThemeContext.tsx) — sent over from JS as JSON (floatingChatBridge.ts's
 * themeToFloatingPayload) each time the window is opened, so this native "dumb" view layer
 * never hardcodes a color that could drift from the real in-app theme (dark OR light, whichever
 * the user has picked) or from a future palette change.
 */
data class FloatingTheme(
  val isDark: Boolean,
  val background: Int,
  val surface: Int,
  val surfaceAlt: Int,
  val inputBackground: Int,
  val text: Int,
  val textMuted: Int,
  val identity: Int,
  val accent: Int,
  val bubbleMine: Int,
  val bubbleMineText: Int,
  val bubbleOther: Int,
  val bubbleOtherText: Int,
) {
  /** Subtle 1dp border color for the window/header edges — not sent from JS (those tokens are rgba() strings Color.parseColor can't read), so approximated from the mode instead. */
  val borderColor: Int
    get() = if (isDark) Color.parseColor("#2A3142") else Color.parseColor("#D8DEE8")

  companion object {
    private fun color(json: JSONObject, key: String, fallback: String): Int =
      try {
        Color.parseColor(json.optString(key, fallback))
      } catch (error: IllegalArgumentException) {
        Color.parseColor(fallback)
      }

    /** Falls back to the app's DARK palette (ThemeContext.tsx) if `json` is blank/unparsable, so the window still looks intentional rather than crashing or rendering all-black. */
    fun parse(json: String): FloatingTheme {
      val obj = try {
        JSONObject(json)
      } catch (error: Exception) {
        JSONObject()
      }
      return FloatingTheme(
        isDark = obj.optString("mode", "dark") != "light",
        background = color(obj, "background", "#0B132B"),
        surface = color(obj, "surface", "#1C2541"),
        surfaceAlt = color(obj, "surfaceAlt", "#141B33"),
        inputBackground = color(obj, "inputBackground", "#141B33"),
        text = color(obj, "text", "#F8FAFC"),
        textMuted = color(obj, "textMuted", "#94A3B8"),
        identity = color(obj, "identity", "#3D63B8"),
        accent = color(obj, "accent", "#FF7A00"),
        bubbleMine = color(obj, "bubbleMine", "#25355F"),
        bubbleMineText = color(obj, "bubbleMineText", "#F8FAFC"),
        bubbleOther = color(obj, "bubbleOther", "#1C2541"),
        bubbleOtherText = color(obj, "bubbleOtherText", "#F8FAFC"),
      )
    }
  }
}

/**
 * Bu telefonun donanım/firmware'i Android'in resmi Picture-in-Picture'ını
 * desteklemediği için (doğrulandı: `pm has-feature
 * android.software.picture_in_picture` -> false) kendi küçük yüzer sohbet
 * penceremiz — SYSTEM_ALERT_WINDOW izniyle her Android cihazda çalışır.
 *
 * Bilerek "aptal" bir görüntüleme katmanı: Firestore bağlantısı burada değil,
 * JS tarafında (chatService.ts, floatingChatBridge.ts) — bu servis sadece
 * gösterir ve kullanıcının yazdığı metni event olarak JS'e iletir.
 */
class FloatingChatService : Service() {
  private lateinit var windowManager: WindowManager
  private var floatingView: View? = null
  private var layoutParams: WindowManager.LayoutParams? = null
  private var adapter: FloatingMessageAdapter? = null
  private var myUid: String = ""
  private var contactUid: String = ""
  private var replyTarget: FloatingMessage? = null

  override fun onCreate() {
    super.onCreate()
    startForegroundNotification()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    contactUid = intent?.getStringExtra("contactUid") ?: ""
    myUid = intent?.getStringExtra("myUid") ?: ""
    val contactName = intent?.getStringExtra("contactName") ?: "Sohbet"
    val theme = FloatingTheme.parse(intent?.getStringExtra("themeJson") ?: "")
    val backgroundUri = intent?.getStringExtra("backgroundUri")?.takeIf { it.isNotEmpty() }

    if (floatingView == null) {
      createFloatingWindow(contactName, theme, backgroundUri)
    }

    FloatingChatBridge.currentService = this
    FloatingChatBridge.emitToJs(
      "floatingChatOpened",
      com.facebook.react.bridge.Arguments.createMap().apply {
        putString("contactUid", contactUid)
        putString("myUid", myUid)
      },
    )
    return START_NOT_STICKY
  }

  private fun dp(value: Int): Float = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics)

  private fun createFloatingWindow(contactName: String, theme: FloatingTheme, backgroundUri: String?) {
    windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
    val view = LayoutInflater.from(this).inflate(R.layout.floating_chat_window, null)
    floatingView = view

    // Recolors the four static drawable/window backgrounds at runtime instead of leaving them
    // as the fixed dark colors they were hardcoded to (see the pre-existing floating_*.xml
    // drawables) — this is what makes the window actually track the app's real theme (dark OR
    // light) rather than always looking dark regardless of what the user picked in Settings.
    view.background = GradientDrawable().apply {
      setColor(theme.surface)
      cornerRadius = dp(14)
      setStroke(dp(1).toInt(), theme.borderColor)
    }
    view.findViewById<View>(R.id.floating_header).background = GradientDrawable().apply {
      setColor(theme.surfaceAlt)
      cornerRadii = floatArrayOf(dp(14), dp(14), dp(14), dp(14), 0f, 0f, 0f, 0f)
    }
    view.findViewById<View>(R.id.floating_action_bar).setBackgroundColor(theme.surfaceAlt)
    view.findViewById<View>(R.id.floating_reply_preview).setBackgroundColor(theme.surfaceAlt)
    view.findViewById<TextView>(R.id.floating_title).setTextColor(theme.text)
    view.findViewById<TextView>(R.id.floating_reply_action).setTextColor(theme.accent)
    view.findViewById<TextView>(R.id.floating_reply_preview_text).setTextColor(theme.textMuted)
    view.findViewById<TextView>(R.id.floating_reply_cancel).setTextColor(theme.textMuted)

    val inputBar = view.findViewById<TextView>(R.id.floating_input).parent as View
    inputBar.setBackgroundColor(theme.surfaceAlt)
    view.findViewById<EditText>(R.id.floating_input).apply {
      background = GradientDrawable().apply {
        setColor(theme.inputBackground)
        cornerRadius = dp(18)
      }
      setTextColor(theme.text)
      setHintTextColor(theme.textMuted)
    }

    // Same per-room wallpaper as the full chat screen (ChatRoomScreen's ImageBackground,
    // chatBackgroundService.ts) — only behind the message list, not the header/input bars,
    // matching that screen's layout. `backgroundUri` is the same base64 `data:` URI stored
    // there; decoded straight to a Bitmap since there's no network fetch involved.
    val backgroundImage = view.findViewById<ImageView>(R.id.floating_background_image)
    if (backgroundUri != null) {
      try {
        val base64 = backgroundUri.substring(backgroundUri.indexOf(',') + 1)
        val bytes = Base64.decode(base64, Base64.DEFAULT)
        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        if (bitmap != null) {
          backgroundImage.setImageBitmap(bitmap)
          backgroundImage.visibility = View.VISIBLE
        }
      } catch (error: Exception) {
        // Malformed/unsupported image data — leave the plain theme background instead of crashing.
      }
    }

    val metrics = resources.displayMetrics
    val width = (metrics.widthPixels * 0.82).toInt()
    val height = (metrics.heightPixels * 0.55).toInt()
    val windowType =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      } else {
        @Suppress("DEPRECATION")
        WindowManager.LayoutParams.TYPE_PHONE
      }
    val params = WindowManager.LayoutParams(
      width,
      height,
      windowType,
      WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    )
    params.gravity = Gravity.TOP or Gravity.START
    params.x = 16
    params.y = metrics.heightPixels / 5
    layoutParams = params

    view.findViewById<TextView>(R.id.floating_title).text = contactName

    val actionBar = view.findViewById<View>(R.id.floating_action_bar)
    val replyPreview = view.findViewById<View>(R.id.floating_reply_preview)
    val replyPreviewText = view.findViewById<TextView>(R.id.floating_reply_preview_text)

    val listView = view.findViewById<ListView>(R.id.floating_message_list)
    listView.setBackgroundColor(Color.TRANSPARENT)
    val messageAdapter = FloatingMessageAdapter(this, myUid, theme) { message ->
      replyTarget = message
      actionBar.visibility = View.VISIBLE
    }
    adapter = messageAdapter
    listView.adapter = messageAdapter

    val emojiIds = intArrayOf(R.id.emoji_1, R.id.emoji_2, R.id.emoji_3, R.id.emoji_4, R.id.emoji_5, R.id.emoji_6, R.id.emoji_7)
    for (emojiId in emojiIds) {
      view.findViewById<TextView>(emojiId).setOnClickListener { emojiView ->
        val target = replyTarget
        if (target != null) {
          val map = com.facebook.react.bridge.Arguments.createMap()
          map.putString("messageId", target.id)
          map.putString("emoji", (emojiView as TextView).text.toString())
          FloatingChatBridge.emitToJs("floatingChatReact", map)
        }
        actionBar.visibility = View.GONE
        replyTarget = null
      }
    }

    view.findViewById<TextView>(R.id.floating_reply_action).setOnClickListener {
      val target = replyTarget
      if (target != null) {
        replyPreviewText.text = "↩ " + target.text
        replyPreview.visibility = View.VISIBLE
      }
      actionBar.visibility = View.GONE
    }

    view.findViewById<TextView>(R.id.floating_reply_cancel).setOnClickListener {
      replyPreview.visibility = View.GONE
      replyTarget = null
    }

    val input = view.findViewById<EditText>(R.id.floating_input)
    val sendButton = view.findViewById<ImageButton>(R.id.floating_send)
    val sendAction = {
      val text = input.text.toString().trim()
      if (text.isNotEmpty()) {
        val map = com.facebook.react.bridge.Arguments.createMap()
        map.putString("text", text)
        val activeReply = if (replyPreview.visibility == View.VISIBLE) replyTarget else null
        if (activeReply != null) {
          map.putString("replyToId", activeReply.id)
          map.putString("replyToText", activeReply.text)
          map.putString("replyToSenderId", activeReply.senderId)
        }
        FloatingChatBridge.emitToJs("floatingChatSend", map)
        input.setText("")
        replyPreview.visibility = View.GONE
        replyTarget = null
      }
    }
    sendButton.setOnClickListener { sendAction() }
    input.setOnEditorActionListener { _, actionId, _ ->
      if (actionId == EditorInfo.IME_ACTION_SEND) {
        sendAction()
        true
      } else {
        false
      }
    }

    view.findViewById<ImageButton>(R.id.floating_close).setOnClickListener { stopSelf() }

    var initialX = 0
    var initialY = 0
    var touchStartX = 0f
    var touchStartY = 0f
    view.findViewById<View>(R.id.floating_header).setOnTouchListener { _, event ->
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          initialX = layoutParams!!.x
          initialY = layoutParams!!.y
          touchStartX = event.rawX
          touchStartY = event.rawY
          true
        }
        MotionEvent.ACTION_MOVE -> {
          layoutParams!!.x = initialX + (event.rawX - touchStartX).toInt()
          layoutParams!!.y = initialY + (event.rawY - touchStartY).toInt()
          windowManager.updateViewLayout(floatingView, layoutParams)
          true
        }
        else -> false
      }
    }

    windowManager.addView(view, params)
  }

  /** JS tarafından çağrılır (FloatingChatModule.updateMessages) — ana thread'e atlayıp adapter'ı günceller. */
  fun applyMessages(messagesJson: String) {
    Handler(Looper.getMainLooper()).post {
      try {
        val array = JSONArray(messagesJson)
        val items = mutableListOf<FloatingMessage>()
        for (i in 0 until array.length()) {
          val obj = array.getJSONObject(i)
          val reactionsObj = obj.optJSONObject("reactions")
          val reactionsText = StringBuilder()
          if (reactionsObj != null) {
            val keys = reactionsObj.keys()
            while (keys.hasNext()) {
              reactionsText.append(reactionsObj.optString(keys.next()))
            }
          }
          items.add(
            FloatingMessage(
              obj.optString("id"),
              obj.optString("text"),
              obj.optString("senderId"),
              reactionsText.toString(),
            ),
          )
        }
        adapter?.setMessages(items)
      } catch (error: Exception) {
        // Bozuk JSON gelirse mesaj listesini sessizce olduğu gibi bırak.
      }
    }
  }

  private fun startForegroundNotification() {
    val channelId = "floating_chat_channel"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(channelId, "Küçük pencere sohbet", NotificationManager.IMPORTANCE_MIN)
      (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
    }
    val notification = NotificationCompat.Builder(this, channelId)
      .setContentTitle("Sohbet penceresi açık")
      .setSmallIcon(android.R.drawable.ic_dialog_email)
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(1, notification)
    }
  }

  override fun onDestroy() {
    super.onDestroy()
    val view = floatingView
    if (view != null) {
      windowManager.removeView(view)
      floatingView = null
    }
    FloatingChatBridge.currentService = null
    FloatingChatBridge.emitToJs("floatingChatClosed", null)
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
