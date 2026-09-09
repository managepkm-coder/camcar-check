# 홈 화면 위젯

웹앱과 **같은 계산식**(주 → 야 → 비 → 휴, 기준일 2026-08-30 = 주간)을 씁니다.
서버·네트워크를 전혀 쓰지 않으므로 비행기 모드에서도 동작합니다.

---

## iOS — Scriptable (무료, 빌드 불필요)

1. App Store에서 **Scriptable** 설치
2. 앱에서 `+` → [`ios/shift-widget.js`](ios/shift-widget.js) 전체를 붙여넣기 → 이름을 **근무표** 로 저장
3. 홈 화면 빈 곳 길게 누르기 → `+` → **Scriptable** → 위젯 크기 선택 후 추가
4. 추가된 위젯을 길게 눌러 **위젯 편집**
   - **Script**: `근무표`
   - **Parameter**: 오늘의 근무 한 글자 — `주` `야` `비` `휴` 중 하나

Parameter만 맞추면 나머지 날짜는 전부 자동 계산됩니다. 조가 바뀌면 이 글자만 다시 바꾸세요.

| 크기 | 표시 |
|---|---|
| Small | 오늘 + 앞으로 3일 |
| Medium | 오늘 + 앞으로 6일 |

---

## Android — APK 설치 (폰만으로 가능)

Xcode도 PC도 필요 없습니다. GitHub Actions가 APK를 대신 빌드합니다.

1. 저장소 **Actions** 탭 → **Build Android widget APK** → 최신 실행 선택
2. 아래 **Artifacts** 의 `shift-widget-apk` 를 폰에서 다운로드 → 압축을 풀고 APK 설치
   - 처음이면 *출처를 알 수 없는 앱 설치 허용* 을 켜야 합니다
3. **근무표** 앱을 열어 **오늘의 근무**를 한 번 탭
4. 홈 화면 길게 누르기 → 위젯 → **근무표** 추가

위젯을 누르면 설정 화면이 다시 열립니다. 날짜는 매일 자정에 자동으로 넘어갑니다.

> 개인 설치용이라 debug 서명으로 빌드합니다. 키스토어나 GitHub Secret이 필요 없고,
> Play 스토어에 올리지 않으므로 개발자 계정도 필요 없습니다.

---

## 근무 주기를 바꾸려면

| 대상 | 파일 | 고칠 곳 |
|---|---|---|
| 웹앱 | `app.js` | `CYCLE`, `ANCHOR` |
| iOS | `widget/ios/shift-widget.js` | `CYCLE`, `ANCHOR` |
| Android | `widget/android/.../Schedule.kt` | `enum class Shift`, `ANCHOR` |

세 곳의 주기와 기준일은 항상 같게 유지하세요.
