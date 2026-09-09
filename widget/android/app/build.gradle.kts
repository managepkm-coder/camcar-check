plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "kr.pkm.shift"
    compileSdk = 35

    defaultConfig {
        applicationId = "kr.pkm.shift"
        minSdk = 26          // java.time 사용
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    // 개인 설치용이라 debug 서명으로 충분합니다 (키스토어·시크릿 불필요)
    buildTypes {
        release { isMinifyEnabled = false }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
}
