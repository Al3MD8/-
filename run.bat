@echo off
chcp 65001 >nul
title فضاء الأنمي - الخادم المدمج
color 0B

echo.
echo  =========================================
echo           تشغيل فضاء الأنمي
echo  =========================================
echo.
echo  [*] جاري تشغيل الخادم المحلي المدمج...
echo.

:: تشغيل سيرفر PowerShell الذي تم إنشاؤه لتوليد رابط حقيقي
PowerShell -NoProfile -ExecutionPolicy Bypass -Command "& '%~dp0server.ps1'"

exit
