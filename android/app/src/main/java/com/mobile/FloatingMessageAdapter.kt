package com.mobile

import android.content.Context
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.BaseAdapter
import android.widget.LinearLayout
import android.widget.TextView

data class FloatingMessage(val id: String, val text: String, val senderId: String, val reactions: String = "")

class FloatingMessageAdapter(
  private val context: Context,
  private val myUid: String,
  private val theme: FloatingTheme,
  private val onLongPress: (FloatingMessage) -> Unit,
) : BaseAdapter() {
  private var messages: List<FloatingMessage> = emptyList()

  private fun dp(value: Int): Float = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), context.resources.displayMetrics)

  fun setMessages(list: List<FloatingMessage>) {
    messages = list
    notifyDataSetChanged()
  }

  override fun getCount() = messages.size
  override fun getItem(position: Int): Any = messages[position]
  override fun getItemId(position: Int) = position.toLong()

  override fun getView(position: Int, convertView: View?, parent: ViewGroup?): View {
    val view = convertView ?: LayoutInflater.from(context).inflate(R.layout.floating_message_bubble, parent, false)
    val message = messages[position]
    val container = view as LinearLayout
    val textView = view.findViewById<TextView>(R.id.bubble_text)
    textView.text = message.text
    // Real theme bubble colors (identity-blue "mine"/neutral "other", same as MessageBubble.tsx
    // in the full chat screen) instead of the previous hardcoded orange — this app deliberately
    // reserves orange for CTA buttons only, never message bubbles (see ThemeContext.tsx's doc
    // comment), so the old floating_bubble_mine.xml orange fill was actually inconsistent with
    // the rest of the app, not just a different shade.
    val isMine = message.senderId == myUid
    container.gravity = if (isMine) Gravity.END else Gravity.START
    textView.background = GradientDrawable().apply {
      setColor(if (isMine) theme.bubbleMine else theme.bubbleOther)
      cornerRadius = dp(14)
    }
    textView.setTextColor(if (isMine) theme.bubbleMineText else theme.bubbleOtherText)
    textView.setOnLongClickListener {
      onLongPress(message)
      true
    }

    val reactionsView = view.findViewById<TextView>(R.id.bubble_reactions)
    if (message.reactions.isNotEmpty()) {
      reactionsView.text = message.reactions
      reactionsView.visibility = View.VISIBLE
      (reactionsView.layoutParams as? LinearLayout.LayoutParams)?.gravity =
        if (isMine) Gravity.END else Gravity.START
    } else {
      reactionsView.visibility = View.GONE
    }
    return view
  }
}
