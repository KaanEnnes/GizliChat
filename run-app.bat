@echo off
setlocal
cd /d "%~dp0"

rem Android SDK genelde sistem PATH'ine eklenmemis olabilir; bu dosyanin
rem calismasi icin gerekli olan adb/platform-tools yolunu burada ayarliyoruz.
if "%ANDROID_HOME%"=="" if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not "%ANDROID_HOME%"=="" set "PATH=%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\emulator;%PATH%"

where adb >nul 2>nul
if errorlevel 1 goto :noadb

echo Bagli cihaz/emulator kontrol ediliyor...
adb devices | findstr /R /C:"device$" >nul
if errorlevel 1 goto :nodevice

echo Metro baslatiliyor, ayri bir pencerede acilacak...
start "Metro Bundler - GizliChat" cmd /k "cd /d "%~dp0" && npx react-native start"

echo Metro'nun ayaga kalkmasi bekleniyor...
timeout /t 6 /nobreak >nul

echo Cihaz ile baglanti kuruluyor...
adb reverse tcp:8081 tcp:8081 >nul 2>nul

echo Uygulama derlenip cihaza kuruluyor, bu biraz surebilir...
cd android
call gradlew.bat installDebug
set BUILD_RESULT=%errorlevel%
cd ..
if not %BUILD_RESULT%==0 goto :buildfail

echo Uygulama cihazda baslatiliyor...
adb shell am start -n com.mobile/.MainActivity

echo.
echo Tamam. Uygulama acildi.
echo Metro penceresini KAPATMAYIN, uygulamanin calismasi icin gerekli.
echo.
pause
goto :end

:noadb
echo.
echo adb bulunamadi. Android SDK kurulu mu ve ANDROID_HOME dogru mu kontrol edin.
echo.
pause
exit /b 1

:nodevice
echo.
echo Bagli bir Android cihaz veya emulator bulunamadi.
echo Once bir emulator baslatin veya telefonu USB ile baglayip
echo USB hata ayiklama ozelligini acin, sonra bu dosyayi tekrar calistirin.
echo.
pause
exit /b 1

:buildfail
echo.
echo Derleme veya kurulum basarisiz oldu. Yukaridaki hata mesajina bakin.
echo.
pause
exit /b 1

:end
