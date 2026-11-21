plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "qa.faslii.faslii_layout"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "qa.faslii.faslii_layout"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = maxOf(24, flutter.minSdkVersion)
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    flavorDimensions += "audience"
    productFlavors {
        create("parent") {
            dimension = "audience"
            applicationId = "qa.faslii.parent"
            manifestPlaceholders["appLabel"] = "Faslii Parent"
        }
        create("teacher") {
            dimension = "audience"
            applicationId = "qa.faslii.teacher"
            manifestPlaceholders["appLabel"] = "Faslii Teacher"
        }
    }

    val releaseKeystore = providers.environmentVariable("FASLII_ANDROID_KEYSTORE").orNull
    if (releaseKeystore != null) {
        signingConfigs.create("schoolRelease") {
            storeFile = file(releaseKeystore)
            storePassword = providers.environmentVariable("FASLII_ANDROID_STORE_PASSWORD").get()
            keyAlias = providers.environmentVariable("FASLII_ANDROID_KEY_ALIAS").get()
            keyPassword = providers.environmentVariable("FASLII_ANDROID_KEY_PASSWORD").get()
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.findByName("schoolRelease")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.1")
}

flutter {
    source = "../.."
}
