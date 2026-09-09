package kr.pkm.shift

import android.app.Activity
import android.os.Bundle
import android.view.View
import android.widget.TextView
import android.widget.Toast
import java.time.LocalDate

/** 오늘의 근무만 고르면 나머지 날짜가 전부 맞춰집니다. */
class MainActivity : Activity() {

    private val buttons by lazy {
        listOf(
            R.id.pickJu to Shift.DAY,
            R.id.pickYa to Shift.NIGHT,
            R.id.pickBi to Shift.OFF,
            R.id.pickHyu to Shift.REST,
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        buttons.forEach { (id, shift) ->
            findViewById<View>(id).setOnClickListener {
                Schedule.setTodayShift(this, shift)
                ShiftWidget.refreshAll(this)
                ShiftWidget.scheduleMidnight(this)
                render()
                Toast.makeText(this, "오늘을 ${shift.full}으로 맞췄습니다", Toast.LENGTH_SHORT).show()
            }
        }
        render()
    }

    private fun render() {
        val today = LocalDate.now()
        val lines = (0..6).joinToString("\n") { i ->
            val d = today.plusDays(i.toLong())
            val mark = if (i == 0) "오늘  " else "      "
            "$mark${d.monthValue}/${d.dayOfMonth}   ${Schedule.at(this, d).full}"
        }
        findViewById<TextView>(R.id.preview).text = lines
    }
}
