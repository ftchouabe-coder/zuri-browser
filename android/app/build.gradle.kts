import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

// Clé de signature release : fichier local non versionné (voir android/README.md).
val keystoreFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystoreFile.exists()) keystoreFile.inputStream().use { load(it) }
}

android {
    namespace = "af.zuri.browser"
    compileSdk = 36

    defaultConfig {
        applicationId = "af.zuri.browser"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.2.0"
    }

    signingConfigs {
        if (keystoreFile.exists()) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (keystoreFile.exists()) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

// La liste de secours CC0 du bureau est embarquée telle quelle (une seule source de vérité).
val zuriAssets = layout.buildDirectory.dir("generated/zuriAssets")
val copyBaseFilters by tasks.registering(Copy::class) {
    from(rootProject.file("../resources/base-filters.txt"))
    into(zuriAssets)
}
android.sourceSets["main"].assets.srcDir(zuriAssets)
tasks.named("preBuild") { dependsOn(copyBaseFilters) }

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.webkit)
    // Version alignée explicitement (la 1.3.0 tirée transitivement est plus ancienne).
    implementation(libs.androidx.profileinstaller)
    testImplementation(libs.junit)
}
