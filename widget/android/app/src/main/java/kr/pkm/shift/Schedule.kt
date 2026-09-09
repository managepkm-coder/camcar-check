package kr.pkm.shift

import android.content.Context
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/** 주 → 야 → 비 → 휴 4일 주기. 순서를 바꾸려면 이 enum 순서만 고치면 됩니다. */
enum class Shift(val label: String, val full: String) {
    DAY("주", "주간"),
    NIGHT("야", "야간"),
    OFF("비", "비번"),
    REST("휴", "휴무"),
}

object Schedule {
    private val CYCLE = Shift.entries
    /** 이 날짜가 CYCLE[0](주간)입니다. */
    private val ANCHOR: LocalDate = LocalDate.of(2026, 8, 30)

    private const val PREFS = "shift"
    private const val KEY_OFFSET = "offset"

    private fun base(date: LocalDate): Int {
        val n = ChronoUnit.DAYS.between(ANCHOR, date)
        return ((n % CYCLE.size + CYCLE.size) % CYCLE.size).toInt()
    }

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun offset(ctx: Context): Int = prefs(ctx).getInt(KEY_OFFSET, 0)

    /** "오늘은 OO 근무"만 알려주면 나머지 주기가 전부 맞춰집니다. */
    fun setTodayShift(ctx: Context, shift: Shift) {
        val n = CYCLE.size
        val off = ((shift.ordinal - base(LocalDate.now())) % n + n) % n
        prefs(ctx).edit().putInt(KEY_OFFSET, off).apply()
    }

    fun at(ctx: Context, date: LocalDate): Shift = CYCLE[(base(date) + offset(ctx)) % CYCLE.size]
}
