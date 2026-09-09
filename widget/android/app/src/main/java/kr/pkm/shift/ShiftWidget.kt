package kr.pkm.shift

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import java.time.LocalDate
import java.time.ZoneId

class ShiftWidget : AppWidgetProvider() {

    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        ids.forEach { mgr.updateAppWidget(it, buildViews(ctx)) }
        scheduleMidnight(ctx)
    }

    override fun onEnabled(ctx: Context) {
        scheduleMidnight(ctx)
    }

    override fun onDisabled(ctx: Context) {
        alarmManager(ctx).cancel(midnightIntent(ctx))
    }

    override fun onReceive(ctx: Context, intent: Intent) {
        super.onReceive(ctx, intent)
        when (intent.action) {
            ACTION_REFRESH,
            Intent.ACTION_DATE_CHANGED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            Intent.ACTION_BOOT_COMPLETED -> {
                refreshAll(ctx)
                scheduleMidnight(ctx)
            }
        }
    }

    companion object {
        const val ACTION_REFRESH = "kr.pkm.shift.REFRESH"

        private val DATE_IDS = intArrayOf(R.id.d1, R.id.d2, R.id.d3, R.id.d4)
        private val BADGE_IDS = intArrayOf(R.id.b1, R.id.b2, R.id.b3, R.id.b4)
        private val DOW = arrayOf("월", "화", "수", "목", "금", "토", "일")

        fun refreshAll(ctx: Context) {
            val mgr = AppWidgetManager.getInstance(ctx)
            val ids = mgr.getAppWidgetIds(ComponentName(ctx, ShiftWidget::class.java))
            ids.forEach { mgr.updateAppWidget(it, buildViews(ctx)) }
        }

        private fun badgeBg(s: Shift) = when (s) {
            Shift.DAY -> R.drawable.badge_ju
            Shift.NIGHT -> R.drawable.badge_ya
            Shift.OFF -> R.drawable.badge_bi
            Shift.REST -> R.drawable.badge_hyu
        }

        private fun badgeFg(s: Shift) = when (s) {
            Shift.DAY -> 0xFF3D3300.toInt()
            Shift.NIGHT -> 0xFFFFFFFF.toInt()
            Shift.OFF -> 0xFFC9372B.toInt()
            Shift.REST -> 0xFF6B6B73.toInt()
        }

        private fun paint(v: RemoteViews, id: Int, s: Shift) {
            v.setTextViewText(id, s.label)
            v.setInt(id, "setBackgroundResource", badgeBg(s))
            v.setTextColor(id, badgeFg(s))
        }

        private fun buildViews(ctx: Context): RemoteViews {
            val v = RemoteViews(ctx.packageName, R.layout.widget)
            val today = LocalDate.now()
            val shift = Schedule.at(ctx, today)

            v.setTextViewText(
                R.id.todayDate,
                "${today.monthValue}월 ${today.dayOfMonth}일 (${DOW[today.dayOfWeek.value - 1]})"
            )
            v.setTextViewText(R.id.todayName, shift.full)
            v.setTextColor(R.id.todayDate, ctx.getColor(R.color.text_muted))
            v.setTextColor(R.id.todayName, ctx.getColor(R.color.text_primary))
            paint(v, R.id.todayBadge, shift)

            for (i in DATE_IDS.indices) {
                val d = today.plusDays((i + 1).toLong())
                v.setTextViewText(DATE_IDS[i], "${d.dayOfMonth}${DOW[d.dayOfWeek.value - 1]}")
                v.setTextColor(DATE_IDS[i], ctx.getColor(R.color.text_muted))
                paint(v, BADGE_IDS[i], Schedule.at(ctx, d))
            }

            // 위젯을 누르면 설정 화면이 열립니다
            v.setOnClickPendingIntent(
                R.id.root,
                PendingIntent.getActivity(
                    ctx, 0, Intent(ctx, MainActivity::class.java),
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                )
            )
            return v
        }

        private fun alarmManager(ctx: Context) =
            ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager

        private fun midnightIntent(ctx: Context): PendingIntent {
            val i = Intent(ctx, ShiftWidget::class.java).setAction(ACTION_REFRESH)
            return PendingIntent.getBroadcast(
                ctx, 1, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
        }

        /** 매일 자정 직후에 위젯을 다시 그린다 (부정확 알람이라 별도 권한이 필요 없음). */
        fun scheduleMidnight(ctx: Context) {
            val next = LocalDate.now().plusDays(1)
                .atStartOfDay(ZoneId.systemDefault())
                .plusMinutes(1)
                .toInstant().toEpochMilli()
            alarmManager(ctx).setRepeating(
                AlarmManager.RTC, next, AlarmManager.INTERVAL_DAY, midnightIntent(ctx)
            )
        }
    }
}
