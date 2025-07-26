@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: PVE Manager IP配置脚本 (Windows版本)
:: 自动配置前端API服务器地址

echo ========================================
echo     PVE Manager IP 配置工具
echo ========================================
echo.

:: 检查是否在项目根目录
if not exist "package.json" (
    echo [ERROR] 找不到package.json文件
    echo [ERROR] 请在PVE Manager项目根目录下运行此脚本
    pause
    exit /b 1
)

if not exist "client" (
    echo [ERROR] 找不到client目录
    echo [ERROR] 请在PVE Manager项目根目录下运行此脚本
    pause
    exit /b 1
)

:: 显示当前配置
if exist "client\.env" (
    echo [INFO] 当前配置:
    echo ----------------------------------------
    findstr /B "VITE_API_BASE_URL VITE_WS_URL" "client\.env" 2>nul
    echo ----------------------------------------
    echo.
)

:: 获取本机IP地址（尝试多种方式）
set "local_ip="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    set "temp_ip=%%a"
    set "temp_ip=!temp_ip: =!"
    :: 排除127.0.0.1
    if not "!temp_ip!"=="127.0.0.1" (
        set "local_ip=!temp_ip!"
        goto :found_ip
    )
)
:found_ip

:: 处理命令行参数
if "%~1"=="--help" goto :show_help
if "%~1"=="-h" goto :show_help
if "%~1"=="--auto" goto :auto_config
if "%~1"=="--localhost" goto :localhost_config
if not "%~1"=="" goto :direct_config

:: 交互式配置
:interactive_config
echo 请选择配置方式:
echo 1) 手动输入IP地址
if not "%local_ip%"=="" (
    echo 2) 使用本机IP地址 ^(%local_ip%^)
) else (
    echo 2) 使用本机IP地址 ^(未检测到^)
)
echo 3) 使用localhost^(本地开发^)
echo 4) 退出
echo.

set /p "choice=请选择 [1-4]: "

if "%choice%"=="1" goto :manual_input
if "%choice%"=="2" goto :use_local_ip
if "%choice%"=="3" goto :localhost_config
if "%choice%"=="4" goto :exit_script
echo [ERROR] 无效的选择
pause
exit /b 1

:manual_input
set /p "user_ip=请输入服务器IP地址: "
call :validate_ip "%user_ip%"
if !errorlevel! neq 0 (
    echo [ERROR] 无效的IP地址格式: %user_ip%
    pause
    exit /b 1
)
set "target_ip=%user_ip%"
goto :create_config

:use_local_ip
if "%local_ip%"=="" (
    echo [ERROR] 无法检测到本机IP地址
    pause
    exit /b 1
)
set "target_ip=%local_ip%"
goto :create_config

:auto_config
if "%local_ip%"=="" (
    echo [ERROR] 无法自动检测到有效的IP地址
    pause
    exit /b 1
)
echo [INFO] 自动检测到IP地址: %local_ip%
set "target_ip=%local_ip%"
goto :create_config

:localhost_config
set "target_ip=localhost"
goto :create_config

:direct_config
call :validate_ip "%~1"
if !errorlevel! neq 0 (
    echo [ERROR] 无效的IP地址: %~1
    echo.
    goto :show_help
)
set "target_ip=%~1"
goto :create_config

:create_config
:: 备份现有配置
if exist "client\.env" (
    set "backup_file=client\.env.backup.%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%"
    set "backup_file=!backup_file: =0!"
    copy "client\.env" "!backup_file!" >nul
    echo [INFO] 已备份现有配置到: !backup_file!
)

:: 创建新的配置文件
(
echo # API Configuration - 由configure-ip.bat脚本自动生成
echo # Generated automatically by configure-ip.bat script
echo VITE_API_BASE_URL=http://%target_ip%:3000
echo VITE_WS_URL=ws://%target_ip%:3000
echo.
echo # Development Configuration
echo VITE_ENV=development
echo.
echo # 配置时间: %date% %time%
echo # Configuration time: %date% %time%
) > "client\.env"

echo.
echo [SUCCESS] 配置文件已创建: client\.env
echo [INFO] API服务器地址: http://%target_ip%:3000
echo [INFO] WebSocket地址: ws://%target_ip%:3000
echo.
echo [SUCCESS] 配置完成！
echo [INFO] 提示：
echo   - 确保服务器在端口3000上运行后端服务
echo   - 确保防火墙允许3000和5173端口的访问
echo   - 重启前端开发服务器以应用新配置
echo.
echo [INFO] 启动命令：
echo   后端: cd server ^&^& npm run dev
echo   前端: cd client ^&^& npm run dev
echo.
pause
exit /b 0

:validate_ip
set "ip=%~1"
:: 简单的IP地址格式验证
echo %ip% | findstr /R "^[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*$" >nul
exit /b %errorlevel%

:show_help
echo PVE Manager IP配置脚本 ^(Windows版本^)
echo.
echo 用法:
echo   %~nx0                    # 交互式配置
echo   %~nx0 [IP地址]           # 直接设置指定IP
echo   %~nx0 --auto             # 自动检测并使用本机IP
echo   %~nx0 --localhost        # 设置为localhost^(本地开发^)
echo   %~nx0 --help             # 显示帮助信息
echo.
echo 示例:
echo   %~nx0 192.168.1.100      # 设置API服务器IP为192.168.1.100
echo   %~nx0 --auto             # 自动检测本机IP并配置
echo.
pause
exit /b 0

:exit_script
echo [INFO] 已取消配置
exit /b 0