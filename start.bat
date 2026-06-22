@echo off
chcp 65001 >nul
title AI写作工坊 - 多AI协作小说创作平台
cd /d "H:\vibecoding\AI writing"
echo ========================================
echo   AI写作工坊 正在启动...
echo   后端: http://localhost:3000
echo   前端: http://localhost:5173
echo   按 Ctrl+C 可停止服务
echo ========================================
echo.
npm run dev
pause
